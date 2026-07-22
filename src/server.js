import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import { Employee } from './models/Employee.js';
import { Approval } from './models/Approval.js';
import { Announcement } from './models/Announcement.js';
import { BankDetails } from './models/BankDetails.js';
import {
  INITIAL_EMPLOYEES,
  INITIAL_APPROVALS,
  INITIAL_ANNOUNCEMENTS,
  INITIAL_BANK_DETAILS,
  INITIAL_TAX_DOCS,
  INITIAL_PAYROLL
} from './data/initialData.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// In-memory fallback stores
let memEmployees = [...INITIAL_EMPLOYEES];
let memApprovals = [...INITIAL_APPROVALS];
let memAnnouncements = [...INITIAL_ANNOUNCEMENTS];
let memBankDetails = { ...INITIAL_BANK_DETAILS };
let taxDocs = [...INITIAL_TAX_DOCS];
let payroll = { ...INITIAL_PAYROLL };

// Connect to MongoDB & Seed Initial Data if Empty
async function initDatabase() {
  await connectDB();
  if (mongoose.connection.readyState === 1) {
    try {
      const empCount = await Employee.countDocuments();
      if (empCount === 0) {
        console.log('Seeding initial employees into MongoDB...');
        await Employee.insertMany(INITIAL_EMPLOYEES);
      }

      const appCount = await Approval.countDocuments();
      if (appCount === 0) {
        console.log('Seeding initial approvals into MongoDB...');
        await Approval.insertMany(INITIAL_APPROVALS);
      }

      const annCount = await Announcement.countDocuments();
      if (annCount === 0) {
        console.log('Seeding initial announcements into MongoDB...');
        await Announcement.insertMany(INITIAL_ANNOUNCEMENTS);
      }

      const bankCount = await BankDetails.countDocuments();
      if (bankCount === 0) {
        await BankDetails.create(INITIAL_BANK_DETAILS);
      }
      console.log('MongoDB initialization & seeding complete.');
    } catch (e) {
      console.error('Database seeding error:', e.message);
    }
  }
}

initDatabase();

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'JRKC HR Portal REST Backend API is running',
    environment: process.env.NODE_ENV || 'development',
    database: mongoose.connection.readyState === 1 ? 'connected (MongoDB)' : 'disconnected (in-memory fallback)',
    timestamp: new Date()
  });
});

// Employee Endpoints
app.get('/api/employees', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const { department, search } = req.query;
      let query = {};
      if (department && department !== 'All') {
        query.department = new RegExp(`^${department}$`, 'i');
      }
      if (search) {
        const q = search.toString();
        query.$or = [
          { name: new RegExp(q, 'i') },
          { role: new RegExp(q, 'i') },
          { email: new RegExp(q, 'i') }
        ];
      }
      const employees = await Employee.find(query).sort({ createdAt: -1 });
      return res.json(employees);
    }
  } catch (e) {
    console.error('DB fetch error, using fallback:', e.message);
  }

  // Fallback to memory
  let result = [...memEmployees];
  const { department, search } = req.query;
  if (department && department !== 'All') {
    result = result.filter(e => e.department.toLowerCase() === department.toString().toLowerCase());
  }
  if (search) {
    const q = search.toString().toLowerCase();
    result = result.filter(e => e.name.toLowerCase().includes(q) || e.role.toLowerCase().includes(q) || e.email.toLowerCase().includes(q));
  }
  res.json(result);
});

app.post('/api/employees', async (req, res) => {
  const newEmpData = {
    id: `HR-${Math.floor(1000 + Math.random() * 9000)}`,
    joiningDate: 'Just now',
    ptoDays: 15,
    sickDays: 5,
    status: 'Clocked Out',
    recentLogs: [],
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
    ...req.body
  };

  try {
    if (mongoose.connection.readyState === 1) {
      const created = await Employee.create(newEmpData);
      return res.status(201).json(created);
    }
  } catch (e) {
    console.error('DB save error:', e.message);
  }

  memEmployees.unshift(newEmpData);
  res.status(201).json(newEmpData);
});

app.put('/api/employees/:id', async (req, res) => {
  const { id } = req.params;
  try {
    if (mongoose.connection.readyState === 1) {
      const updated = await Employee.findOneAndUpdate({ id }, req.body, { new: true });
      if (updated) return res.json(updated);
    }
  } catch (e) {}

  const index = memEmployees.findIndex(e => e.id === id);
  if (index !== -1) {
    memEmployees[index] = { ...memEmployees[index], ...req.body };
    return res.json(memEmployees[index]);
  }
  res.status(404).json({ error: 'Employee not found' });
});

// Clock In / Clock Out Endpoint
app.post('/api/employees/:id/clock', async (req, res) => {
  const { id } = req.params;
  const { status, clockTime } = req.body;

  try {
    if (mongoose.connection.readyState === 1) {
      const emp = await Employee.findOne({ id });
      if (emp) {
        emp.status = status;
        emp.clockTime = clockTime;
        if (status === 'Clocked In') {
          emp.recentLogs.unshift({
            date: 'Today',
            hours: `${clockTime} - Present`,
            duration: 'Active',
            status: 'Active'
          });
        }
        await emp.save();
        return res.json(emp);
      }
    }
  } catch (e) {}

  const index = memEmployees.findIndex(e => e.id === id);
  if (index !== -1) {
    memEmployees[index].status = status;
    memEmployees[index].clockTime = clockTime;
    if (status === 'Clocked In') {
      memEmployees[index].recentLogs.unshift({
        date: 'Today',
        hours: `${clockTime} - Present`,
        duration: 'Active',
        status: 'Active'
      });
    }
    return res.json(memEmployees[index]);
  }
  res.status(404).json({ error: 'Employee not found' });
});

// Approvals & Leave Requests Endpoints
app.get('/api/approvals', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const approvals = await Approval.find().sort({ createdAt: -1 });
      return res.json(approvals);
    }
  } catch (e) {}
  res.json(memApprovals);
});

app.post('/api/approvals', async (req, res) => {
  const newApproval = {
    id: `REQ-${Math.floor(100 + Math.random() * 900)}`,
    status: 'pending',
    dateSubmitted: 'Just now',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
    ...req.body
  };

  try {
    if (mongoose.connection.readyState === 1) {
      const created = await Approval.create(newApproval);
      return res.status(201).json(created);
    }
  } catch (e) {}

  memApprovals.unshift(newApproval);
  res.status(201).json(newApproval);
});

app.patch('/api/approvals/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    if (mongoose.connection.readyState === 1) {
      const updated = await Approval.findOneAndUpdate({ id }, { status }, { new: true });
      if (updated) return res.json(updated);
    }
  } catch (e) {}

  const item = memApprovals.find(a => a.id === id);
  if (item) {
    item.status = status;
    return res.json(item);
  }
  res.status(404).json({ error: 'Approval request not found' });
});

// Announcements Endpoints
app.get('/api/announcements', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const announcements = await Announcement.find().sort({ createdAt: -1 });
      return res.json(announcements);
    }
  } catch (e) {}
  res.json(memAnnouncements);
});

app.post('/api/announcements', async (req, res) => {
  const newAnn = {
    id: `ANN-${Math.floor(100 + Math.random() * 900)}`,
    time: 'Just now',
    image: 'https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=800&q=80',
    ...req.body
  };

  try {
    if (mongoose.connection.readyState === 1) {
      const created = await Announcement.create(newAnn);
      return res.status(201).json(created);
    }
  } catch (e) {}

  memAnnouncements.unshift(newAnn);
  res.status(201).json(newAnn);
});

// Bank Details Endpoints
app.get('/api/bank-details', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const bank = await BankDetails.findOne();
      if (bank) return res.json(bank);
    }
  } catch (e) {}
  res.json(memBankDetails);
});

app.put('/api/bank-details', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      let bank = await BankDetails.findOne();
      if (bank) {
        Object.assign(bank, req.body);
        await bank.save();
        return res.json(bank);
      } else {
        bank = await BankDetails.create({ ...INITIAL_BANK_DETAILS, ...req.body });
        return res.json(bank);
      }
    }
  } catch (e) {}

  memBankDetails = { ...memBankDetails, ...req.body };
  res.json(memBankDetails);
});

// Tax Docs & Payroll Endpoints
app.get('/api/tax-docs', (req, res) => {
  res.json(taxDocs);
});

app.get('/api/payroll', (req, res) => {
  res.json(payroll);
});

app.listen(PORT, () => {
  console.log(`Server listening on port http://localhost:${PORT}`);
});
