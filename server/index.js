import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;
const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb+srv://onlydevsx_db_user:aN0cWgqkOWo4rhiD@cluster0.jfuzynl.mongodb.net/sales_dashboard?retryWrites=true&w=majority&appName=Cluster0
';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// Serve static frontend (index.html) from project root
const clientDir = path.resolve(__dirname, '..');
app.use('/', express.static(clientDir));

// Mongo connection (✅ added clear logs)
console.log('🟡 Attempting to connect to MongoDB...');
console.log('🔗 Using URI:', mongoUri.includes('@') ? 'Atlas Cluster' : 'Local MongoDB');

mongoose
  .connect(mongoUri, { autoIndex: true })
  .then(() => {
    console.log('✅ MongoDB connected successfully!');
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

// Schemas/Models
const BranchSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    address: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' }
  },
  { timestamps: true }
);

const SaleSchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    date: { type: Date, required: true },
    items: [
      {
        sku: String,
        name: String,
        quantity: Number,
        unitPrice: Number,
        cost: Number
      }
    ],
    total: Number,
    costTotal: Number,
    profit: Number,
    category: String
  },
  { timestamps: true }
);

const Branch = mongoose.model('Branch', BranchSchema);
const Sale = mongoose.model('Sale', SaleSchema);

// Settings (singleton)
const SettingsSchema = new mongoose.Schema(
  {
    companyName: { type: String, default: '' },
    currency: { type: String, default: 'PKR' },
    dateFormat: { type: String, default: 'DD/MM/YYYY' },
    itemsPerPage: { type: Number, default: 10 },
    defaultCostPercent: { type: Number, default: 70 }
  },
  { timestamps: true }
);
const Settings = mongoose.model('Settings', SettingsSchema);

// Health
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// Settings API
app.get('/api/settings', async (req, res) => {
  let settings = await Settings.findOne();
  if (!settings) {
    settings = await Settings.create({});
  }
  const wantsHtml = req.accepts(['html', 'json']) === 'html';
  if (wantsHtml) {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Settings</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  <style> body{padding:20px} table{background:#fff} </style>
</head>
<body>
  <div class="container">
    <h1 class="mb-4">Settings</h1>
    <table class="table table-striped table-bordered w-auto">
      <tbody>
        <tr><th scope="row">Company Name</th><td>${settings.companyName || ''}</td></tr>
        <tr><th scope="row">Currency</th><td>${settings.currency || ''}</td></tr>
        <tr><th scope="row">Date Format</th><td>${settings.dateFormat || ''}</td></tr>
        <tr><th scope="row">Items Per Page</th><td>${Number(settings.itemsPerPage || 10)}</td></tr>
        <tr><th scope="row">Default Cost %</th><td>${Number(settings.defaultCostPercent ?? 70)}%</td></tr>
      </tbody>
    </table>
    <a href="/" class="btn btn-secondary">Back to App</a>
  </div>
</body>
</html>`);
  } else {
    res.json(settings);
  }
});

app.put('/api/settings', async (req, res) => {
  try {
    const update = {
      companyName: req.body.companyName ?? '',
      currency: req.body.currency ?? 'PKR',
      dateFormat: req.body.dateFormat ?? 'DD/MM/YYYY',
      itemsPerPage: Number(req.body.itemsPerPage ?? 10),
      defaultCostPercent: req.body.defaultCostPercent !== undefined ? Number(req.body.defaultCostPercent) : undefined
    };
    Object.keys(update).forEach((k) => update[k] === undefined && delete update[k]);
    const settings = await Settings.findOneAndUpdate({}, update, { new: true, upsert: true });
    res.json(settings);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Branches CRUD
app.get('/api/branches', async (req, res) => {
  const branches = await Branch.find().sort({ createdAt: -1 });
  res.json(branches);
});

app.post('/api/branches', async (req, res) => {
  try {
    const branch = await Branch.create(req.body);
    res.status(201).json(branch);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/branches/:id', async (req, res) => {
  try {
    const updated = await Branch.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/branches/:id', async (req, res) => {
  try {
    await Branch.findByIdAndDelete(req.params.id);
    await Sale.deleteMany({ branchId: req.params.id });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Sales endpoints
app.get('/api/sales', async (req, res) => {
  const filter = {};
  if (req.query.branchId) filter.branchId = req.query.branchId;
  if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) filter.date.$gte = new Date(req.query.from);
    if (req.query.to) filter.date.$lte = new Date(req.query.to);
  }
  const sales = await Sale.find(filter).sort({ date: -1 }).populate('branchId', 'name');
  res.json(sales);
});

app.post('/api/sales', async (req, res) => {
  try {
    const sale = await Sale.create(req.body);
    res.status(201).json(sale);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server listening on port ${port}`);
});






// import express from 'express';
// import mongoose from 'mongoose';
// import cors from 'cors';
// import morgan from 'morgan';
// import dotenv from 'dotenv';
// import path from 'path';
// import { fileURLToPath } from 'url';

// dotenv.config();

// const app = express();
// const port = process.env.PORT || 4000;
// const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb+srv://onlydevsx_db_user:aN0cWgqkOWo4rhiD@cluster0.jfuzynl.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// app.use(cors());
// app.use(express.json({ limit: '1mb' }));
// app.use(morgan('dev'));

// // Serve static frontend (index.html) from project root
// const clientDir = path.resolve(__dirname, '..');
// app.use('/', express.static(clientDir));

// // Mongo connection
// mongoose
//   .connect(mongoUri, { autoIndex: true })
//   .then(() => console.log('MongoDB connected'))
//   .catch((err) => {
//     console.error('MongoDB connection error:', err.message);
//     process.exit(1);
//   });

// // Schemas/Models
// const BranchSchema = new mongoose.Schema(
//   {
//     name: { type: String, required: true },
//     address: { type: String, default: '' },
//     phone: { type: String, default: '' },
//     email: { type: String, default: '' }
//   },
//   { timestamps: true }
// );

// const SaleSchema = new mongoose.Schema(
//   {
//     branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
//     date: { type: Date, required: true },
//     items: [
//       {
//         sku: String,
//         name: String,
//         quantity: Number,
//         unitPrice: Number,
//         cost: Number
//       }
//     ],
//     total: Number,
//     costTotal: Number,
//     profit: Number,
//     category: String
//   },
//   { timestamps: true }
// );

// const Branch = mongoose.model('Branch', BranchSchema);
// const Sale = mongoose.model('Sale', SaleSchema);
// // Settings (singleton)
// const SettingsSchema = new mongoose.Schema(
//   {
//     companyName: { type: String, default: '' },
//     currency: { type: String, default: 'PKR' },
//     dateFormat: { type: String, default: 'DD/MM/YYYY' },
//     itemsPerPage: { type: Number, default: 10 },
//     defaultCostPercent: { type: Number, default: 70 }
//   },
//   { timestamps: true }
// );
// const Settings = mongoose.model('Settings', SettingsSchema);

// // Health
// app.get('/api/health', (req, res) => {
//   res.json({ ok: true });
// });

// // Settings API
// app.get('/api/settings', async (req, res) => {
//   let settings = await Settings.findOne();
//   if (!settings) {
//     settings = await Settings.create({});
//   }
//   const wantsHtml = req.accepts(['html', 'json']) === 'html';
//   if (wantsHtml) {
//     res.send(`<!DOCTYPE html>
// <html lang="en">
// <head>
//   <meta charset="UTF-8" />
//   <meta name="viewport" content="width=device-width, initial-scale=1.0" />
//   <title>Settings</title>
//   <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
//   <style> body{padding:20px} table{background:#fff} </style>
// </head>
// <body>
//   <div class="container">
//     <h1 class="mb-4">Settings</h1>
//     <table class="table table-striped table-bordered w-auto">
//       <tbody>
//         <tr><th scope="row">Company Name</th><td>${settings.companyName || ''}</td></tr>
//         <tr><th scope="row">Currency</th><td>${settings.currency || ''}</td></tr>
//         <tr><th scope="row">Date Format</th><td>${settings.dateFormat || ''}</td></tr>
//         <tr><th scope="row">Items Per Page</th><td>${Number(settings.itemsPerPage || 10)}</td></tr>
//         <tr><th scope="row">Default Cost %</th><td>${Number(settings.defaultCostPercent ?? 70)}%</td></tr>
//       </tbody>
//     </table>
//     <a href="/" class="btn btn-secondary">Back to App</a>
//   </div>
// </body>
// </html>`);
//   } else {
//     res.json(settings);
//   }
// });

// app.put('/api/settings', async (req, res) => {
//   try {
//     const update = {
//       companyName: req.body.companyName ?? '',
//       currency: req.body.currency ?? 'PKR',
//       dateFormat: req.body.dateFormat ?? 'DD/MM/YYYY',
//       itemsPerPage: Number(req.body.itemsPerPage ?? 10),
//       defaultCostPercent: req.body.defaultCostPercent !== undefined ? Number(req.body.defaultCostPercent) : undefined
//     };
//     // Remove undefined to avoid overwriting with undefined
//     Object.keys(update).forEach((k) => update[k] === undefined && delete update[k]);
//     const settings = await Settings.findOneAndUpdate({}, update, { new: true, upsert: true });
//     res.json(settings);
//   } catch (e) {
//     res.status(400).json({ error: e.message });
//   }
// });

// // Branches CRUD
// app.get('/api/branches', async (req, res) => {
//   const branches = await Branch.find().sort({ createdAt: -1 });
//   const wantsHtml = req.accepts(['html', 'json']) === 'html';
//   if (wantsHtml) {
//     const rows = branches
//       .map(
//         (b) => `
//           <tr>
//             <td>${b._id}</td>
//             <td>${b.name}</td>
//             <td>${b.address || ''}</td>
//             <td>${b.phone || ''}</td>
//             <td>${b.email || ''}</td>
//           </tr>`
//       )
//       .join('');
//     res.send(`<!DOCTYPE html>
// <html lang="en">
// <head>
//   <meta charset="UTF-8" />
//   <meta name="viewport" content="width=device-width, initial-scale=1.0" />
//   <title>Branches</title>
//   <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
//   <style> body{padding:20px} table{background:#fff} </style>
// </head>
// <body>
//   <div class="container">
//     <h1 class="mb-4">Branches</h1>
//     <table class="table table-striped table-bordered">
//       <thead><tr><th>_id</th><th>Name</th><th>Address</th><th>Phone</th><th>Email</th></tr></thead>
//       <tbody>${rows}</tbody>
//     </table>
//     <a href="/" class="btn btn-secondary">Back to App</a>
//   </div>
// </body>
// </html>`);
//   } else {
//     res.json(branches);
//   }
// });

// app.post('/api/branches', async (req, res) => {
//   try {
//     const branch = await Branch.create(req.body);
//     res.status(201).json(branch);
//   } catch (e) {
//     res.status(400).json({ error: e.message });
//   }
// });

// app.put('/api/branches/:id', async (req, res) => {
//   try {
//     const updated = await Branch.findByIdAndUpdate(req.params.id, req.body, { new: true });
//     res.json(updated);
//   } catch (e) {
//     res.status(400).json({ error: e.message });
//   }
// });

// app.delete('/api/branches/:id', async (req, res) => {
//   try {
//     await Branch.findByIdAndDelete(req.params.id);
//     await Sale.deleteMany({ branchId: req.params.id });
//     res.json({ ok: true });
//   } catch (e) {
//     res.status(400).json({ error: e.message });
//   }
// });

// // Sales basic endpoints (optional starter)
// app.get('/api/sales', async (req, res) => {
//   const filter = {};
//   if (req.query.branchId) filter.branchId = req.query.branchId;
//   if (req.query.from || req.query.to) {
//     filter.date = {};
//     if (req.query.from) filter.date.$gte = new Date(req.query.from);
//     if (req.query.to) filter.date.$lte = new Date(req.query.to);
//   }
//   const sales = await Sale.find(filter).sort({ date: -1 }).populate('branchId', 'name');
//   const wantsHtml = req.accepts(['html', 'json']) === 'html';
//   if (wantsHtml) {
//     const rows = sales
//       .map(
//         (s) => `
//           <tr>
//             <td>${s._id}</td>
//             <td>${s.date ? new Date(s.date).toISOString().slice(0,10) : ''}</td>
//             <td>${s.branchId && s.branchId.name ? s.branchId.name : s.branchId}</td>
//             <td>${(s.total ?? 0).toLocaleString()}</td>
//             <td>${(s.costTotal ?? 0).toLocaleString()}</td>
//             <td>${(s.profit ?? 0).toLocaleString()}</td>
//             <td>${s.category || ''}</td>
//           </tr>`
//       )
//       .join('');
//     res.send(`<!DOCTYPE html>
// <html lang="en">
// <head>
//   <meta charset="UTF-8" />
//   <meta name="viewport" content="width=device-width, initial-scale=1.0" />
//   <title>Sales</title>
//   <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
//   <style> body{padding:20px} table{background:#fff} </style>
// </head>
// <body>
//   <div class="container">
//     <h1 class="mb-4">Sales</h1>
//     <table class="table table-striped table-bordered">
//       <thead><tr><th>_id</th><th>Date</th><th>Branch</th><th>Total</th><th>Cost</th><th>Profit</th><th>Category</th></tr></thead>
//       <tbody>${rows}</tbody>
//     </table>
//     <a href="/" class="btn btn-secondary">Back to App</a>
//   </div>
// </body>
// </html>`);
//   } else {
//     res.json(sales);
//   }
// });

// app.post('/api/sales', async (req, res) => {
//   try {
//     const sale = await Sale.create(req.body);
//     res.status(201).json(sale);
//   } catch (e) {
//     res.status(400).json({ error: e.message });
//   }
// });

// app.listen(port, () => {
//   console.log(`Server listening on http://localhost:${port}`);
// });





