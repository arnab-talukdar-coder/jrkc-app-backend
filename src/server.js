import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import crypto from 'crypto';

if (!globalThis.crypto) {
  globalThis.crypto = crypto;
}

// Resolve .env from project root (one directory up from src/)
const __srvFilename = fileURLToPath(import.meta.url);
const __srvDirname = dirname(__srvFilename);
const envPath = resolve(__srvDirname, '..', '.env');
dotenv.config({ path: envPath });

console.log(`🔧 Server: Loaded .env from ${envPath}`);
console.log(`🔧 GMAIL_USER: ${process.env.GMAIL_USER || '❌ NOT SET'}`);
console.log(`🔧 JWT_SECRET: ${process.env.JWT_SECRET ? '✅ loaded' : '⚠️ using default'}`);

import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { connectDB } from './config/db.js';
import { authenticateToken, requireRole, optionalAuth, validateEmail, sanitizeString } from './middleware/auth.js';

const JWT_SECRET = process.env.JWT_SECRET || 'jrkc-hrms-secret-2026';

import { Employee } from './models/Employee.js';
import { Approval } from './models/Approval.js';
import { Announcement } from './models/Announcement.js';
import { BankDetails } from './models/BankDetails.js';
import { RegistrationRequest } from './models/RegistrationRequest.js';
import { Payslip } from './models/Payslip.js';
import { Notification } from './models/Notification.js';
import { Holiday } from './models/Holiday.js';
import { HRSettings } from './models/HRSettings.js';
import { SalaryAdvance } from './models/SalaryAdvance.js';
import { Project } from './models/Project.js';
import {
  sendAdminRegistrationAlert,
  sendRegistrationConfirmationToEmployee,
  sendEmployeeApprovalEmail,
  sendLeaveRequestAlert,
  sendLeaveStatusNotification,
  sendPayslipEmail,
  sendDelayedPayslipDisbursementEmail
} from './services/emailService.js';
import {
  INITIAL_EMPLOYEES,
  INITIAL_APPROVALS,
  INITIAL_ANNOUNCEMENTS,
  INITIAL_REGISTRATION_REQUESTS,
  INITIAL_PAYSLIPS,
  INITIAL_BANK_DETAILS
} from './data/initialData.js';
import { calculateSalaryForEmployee, calculateMonSatWorkingDays, calculateGrossSalary, generateRepaymentSchedule } from './services/payrollService.js';
import { seedDevelopmentData } from './services/mockDataSeeder.js';
import attendanceRoutes from './routes/attendanceRoutes.js';

const app = express();
app.set('trust proxy', 1);
app.disable('etag');
const PORT = process.env.PORT || 5000;

// ── SECURITY MIDDLEWARE ──
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// CORS & No-Cache
app.use((req, res, next) => {
  res.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.header('Pragma', 'no-cache');
  res.header('Expires', '0');

  const origin = req.headers.origin;
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Pragma');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

// Rate limiting
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { error: 'Too many auth attempts. Please try again later.' } });
const apiLimiter = rateLimit({ windowMs: 1 * 60 * 1000, max: 120, message: { error: 'Too many requests. Please slow down.' } });
app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

// Route normalization for Nginx
app.use((req, res, next) => {
  if (!req.url.startsWith('/api') && req.url !== '/' && req.url !== '/health') {
    req.url = '/api' + (req.url.startsWith('/') ? '' : '/') + req.url;
  }
  next();
});

// ── IN-MEMORY FALLBACK STORES (Deprecated, left empty to prevent ReferenceErrors in legacy logic) ──
let memEmployees = [];
let memApprovals = [];
let memAnnouncements = [];
let memRegistrationRequests = [];
let memPayslips = [];
let memNotifications = [];
let memHolidays = [];
let memSalaryAdvances = [];

const saveDiskStore = () => {};

// ── DATABASE INITIALIZATION ──
async function initDatabase() {
  await connectDB();
  try {
    if (mongoose.connection.readyState === 1) {
      const bankCount = await BankDetails.countDocuments();
      if (bankCount === 0) {
        await BankDetails.create(INITIAL_BANK_DETAILS);
      }
      const settingsCount = await HRSettings.countDocuments();
      if (settingsCount === 0) {
        await HRSettings.create({ id: 'HR_SETTINGS_GLOBAL', lwpDeductionBasis: 'basic' });
      }
      if (process.env.NODE_ENV !== 'production') {
        await seedDevelopmentData('arnab.talukdar07@gmail.com');
      }
      console.log('✅ Database connected & initial seeding complete.');
    } else {
      console.log('⚡ Operating in fallback mode (MongoDB not connected).');
    }
  } catch (e) {
    console.error('Database initialization error:', e.message);
  }
}

initDatabase();

// ── HELPER FUNCTIONS ──

async function createNotification(notif) {
  const newNotif = {
    id: `NOTIF-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    read: false,
    createdAtDate: new Date().toISOString(),
    ...notif
  };
  try {
    return await Notification.create(newNotif);
  } catch (e) {
    console.error('Notification create error:', e.message);
    return newNotif;
  }
}

// Haversine formula — distance between two GPS coordinates in meters
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeDuration(inTimestamp, outTime) {
  if (!inTimestamp) return 'Completed Shift';
  try {
    const diffMs = outTime - new Date(inTimestamp);
    if (diffMs <= 0) return 'Completed Shift';
    const totalMins = Math.floor(diffMs / 60000);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  } catch (e) { return 'Completed Shift'; }
}

function getTodayDateStr() {
  return new Date().toLocaleDateString('en-IN', { month: 'short', day: '2-digit', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

function getTodayISO() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

// Check if a date is Sunday
function isSunday(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.getDay() === 0;
  } catch (e) { return false; }
}

// ── HEALTH CHECK ──
app.get(['/', '/health', '/api', '/api/health'], (req, res) => {
  res.json({
    status: 'ok',
    message: 'JRKC HR Portal REST API',
    environment: process.env.NODE_ENV || 'development',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'fallback',
    timestamp: new Date()
  });
});

// ======================================================
// 1. REGISTRATION & AUTH (PUBLIC ROUTES)
// ======================================================

// Register Employee
app.post('/api/auth/register', async (req, res) => {
  const { name, email, phone, department, role, requestedUserRole, password, assignedHrId, assignedHrName } = req.body;

  if (!name || !email || !department) {
    return res.status(400).json({ error: 'Name, email, and department are required' });
  }
  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  // Check if email already registered or pending approval
  let existing = null;
  let pendingReg = null;
  try {
    if (mongoose.connection.readyState === 1) {
      existing = await Employee.findOne({ email: email.toLowerCase().trim() });
      pendingReg = await RegistrationRequest.findOne({ email: email.toLowerCase().trim() });
    }
  } catch (e) {}
  if (!existing) existing = memEmployees.find(e => e.email?.toLowerCase() === email.toLowerCase().trim());
  if (!pendingReg) pendingReg = memRegistrationRequests.find(r => r.email?.toLowerCase() === email.toLowerCase().trim());

  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists. Please log in.' });
  }
  if (pendingReg) {
    return res.status(409).json({ error: 'A registration request for this email is already pending HR/Admin approval.' });
  }

  let hashedPassword = null;
  if (password) {
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    hashedPassword = await bcrypt.hash(password, 10);
  }

  // Find an HR to assign
  let hr = null;
  if (assignedHrId) {
    hr = memEmployees.find(e => e.id === assignedHrId && e.userRole === 'HR');
  }
  if (!hr) {
    hr = memEmployees.find(e => e.userRole === 'HR');
  }

  const newReg = {
    id: `REG-${Date.now().toString(36).toUpperCase()}`,
    name: sanitizeString(name),
    email: email.toLowerCase().trim(),
    phone: phone || '',
    department: sanitizeString(department),
    role: sanitizeString(role) || 'Employee',
    requestedUserRole: requestedUserRole || 'Employee',
    password: hashedPassword,
    assignedHrId: hr?.id || '',
    assignedHrName: hr?.name || '',
    status: 'pending_approval',
    agreedToTerms: true,
    termsAcceptedAt: new Date().toISOString(),
    dateSubmitted: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
  };

  try {
    if (mongoose.connection.readyState === 1) {
      const saved = await RegistrationRequest.create(newReg);
      sendAdminRegistrationAlert(saved).catch(err => console.error('Admin email alert error:', err));
      sendRegistrationConfirmationToEmployee(saved).catch(err => console.error('Registration confirmation email error:', err));
      await createNotification({ targetRole: 'Admin', title: 'New Registration Request', message: `${name} (${email}) requested registration.`, type: 'registration' });
      return res.status(201).json(saved);
    }
  } catch (e) { console.error('Registration DB error:', e.message); }

  memRegistrationRequests.unshift(newReg);
  saveDiskStore();
  sendAdminRegistrationAlert(newReg).catch(err => console.error('Admin email alert error:', err));
  sendRegistrationConfirmationToEmployee(newReg).catch(err => console.error('Registration confirmation email error:', err));
  await createNotification({ targetRole: 'Admin', title: 'New Registration Request', message: `${name} (${email}) requested registration.`, type: 'registration' });
  res.status(201).json(newReg);
});

// Register Admin (requires secret key)
app.post('/api/auth/register-admin', async (req, res) => {
  const { name, email, phone, department, role, adminSecret, password } = req.body;
  const validSecret = process.env.ADMIN_REGISTRATION_SECRET || 'JRKC-ADMIN-2026';

  if (!adminSecret || adminSecret !== validSecret) {
    return res.status(401).json({ error: 'Invalid Admin Security Key' });
  }
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (!validateEmail(email)) return res.status(400).json({ error: 'Invalid email address' });

  let existing = null;
  try { if (mongoose.connection.readyState === 1) existing = await Employee.findOne({ email: email.toLowerCase().trim() }); } catch (e) {}
  if (!existing) existing = memEmployees.find(e => e.email?.toLowerCase() === email.toLowerCase().trim());
  if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });

  const hashedPassword = await bcrypt.hash(password, 10);
  const newAdmin = {
    id: `ADM-${Date.now().toString(36).toUpperCase()}`,
    name: sanitizeString(name),
    email: email.toLowerCase().trim(),
    phone: phone || '',
    department: sanitizeString(department) || 'Management',
    role: sanitizeString(role) || 'Director',
    userRole: 'Admin',
    status: 'Clocked Out',
    accountStatus: 'approved',
    password: hashedPassword,
    ptoDays: 18, sickDays: 10, casualDays: 10, lwpDaysTaken: 0,
    joiningDate: new Date().toLocaleDateString('en-IN'),
    recentLogs: []
  };

  try { if (mongoose.connection.readyState === 1) await Employee.create(newAdmin); } catch (e) { console.error('Admin create error:', e.message); }
  memEmployees.unshift(newAdmin);
  saveDiskStore();

  sendEmployeeApprovalEmail(newAdmin, null).catch(err => console.error('Admin welcome email error:', err));
  await createNotification({ targetRole: 'Admin', title: 'Admin Account Created', message: `${newAdmin.name} registered as Director/Admin.`, type: 'registration' });

  const token = jwt.sign({ id: newAdmin.id, email: newAdmin.email, userRole: newAdmin.userRole, name: newAdmin.name }, JWT_SECRET, { expiresIn: '7d' });
});

// One-click Setup Admin & HR Users Endpoint
app.post(['/api/auth/setup-admin-users', '/api/auth/init-admin-accounts'], async (req, res) => {
  const { adminSecret } = req.body || {};
  const validSecret = process.env.ADMIN_REGISTRATION_SECRET || 'JRKC-ADMIN-2026';
  if (adminSecret && adminSecret !== validSecret) {
    return res.status(401).json({ error: 'Invalid Admin Security Key' });
  }

  const defaultPassword = 'Abhishek@09';
  const hashedPassword = await bcrypt.hash(defaultPassword, 10);

  const adminUsers = [
    {
      id: 'ADM-CMD',
      name: 'CMD',
      email: 'cmd@jrkcrail.com',
      phone: '',
      department: 'Management',
      role: 'Director',
      userRole: 'Admin',
      status: 'Clocked Out',
      accountStatus: 'approved',
      password: hashedPassword,
      ptoDays: 18, sickDays: 10, casualDays: 10, lwpDaysTaken: 0,
      joiningDate: new Date().toLocaleDateString('en-IN'),
      recentLogs: []
    },
    {
      id: 'ADM-HR',
      name: 'HR',
      email: 'hr@jrkcrail.com',
      phone: '',
      department: 'Human Resources',
      role: 'HR Manager',
      userRole: 'Admin',
      status: 'Clocked Out',
      accountStatus: 'approved',
      password: hashedPassword,
      ptoDays: 18, sickDays: 10, casualDays: 10, lwpDaysTaken: 0,
      joiningDate: new Date().toLocaleDateString('en-IN'),
      recentLogs: []
    }
  ];

  const results = [];
  for (const user of adminUsers) {
    try {
      if (mongoose.connection.readyState === 1) {
        await Employee.findOneAndUpdate(
          { email: user.email },
          { $set: user },
          { upsert: true, new: true }
        );
      }
      const memIdx = memEmployees.findIndex(e => e.email === user.email);
      if (memIdx !== -1) memEmployees[memIdx] = user;
      else memEmployees.unshift(user);
      results.push(`${user.email} created/updated`);
    } catch (e) {
      results.push(`${user.email} error: ${e.message}`);
    }
  }

  saveDiskStore();
  res.json({
    message: 'Admin and HR accounts configured successfully!',
    defaultPassword,
    results
  });
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  let user = null;
  try { if (mongoose.connection.readyState === 1) user = await Employee.findOne({ email: email.toLowerCase().trim() }); } catch (e) {}
  if (!user) user = memEmployees.find(e => e.email?.toLowerCase() === email.toLowerCase().trim());
  if (!user) return res.status(401).json({ error: 'No account found with this email. Please register first or contact Admin.' });
  if (user.accountStatus !== 'approved') return res.status(403).json({ error: 'Your account is pending Admin approval.' });

  // Verify password
  let passwordMatch = false;
  if (user.password) {
    if (user.password.startsWith('$2b$') || user.password.startsWith('$2a$')) {
      passwordMatch = await bcrypt.compare(password, user.password);
    } else if (user.password === password) {
      passwordMatch = true;
    }
  } else {
    // If account exists and is approved without a set password, set password on first login
    const hashed = await bcrypt.hash(password, 10);
    user.password = hashed;
    passwordMatch = true;
    try { if (mongoose.connection.readyState === 1) await Employee.findOneAndUpdate({ email: user.email }, { password: hashed }); } catch (e) {}
    saveDiskStore();
  }

  // Check registration request password as fallback
  if (!passwordMatch) {
    let regReq = null;
    try { if (mongoose.connection.readyState === 1) regReq = await RegistrationRequest.findOne({ email: user.email?.toLowerCase().trim() }); } catch (e) {}
    if (!regReq) regReq = memRegistrationRequests.find(r => r.email?.toLowerCase() === user.email?.toLowerCase().trim());
    if (regReq?.password) {
      if (regReq.password.startsWith('$2b$') || regReq.password.startsWith('$2a$')) {
        passwordMatch = await bcrypt.compare(password, regReq.password);
      } else if (regReq.password === password) {
        passwordMatch = true;
      }
      if (passwordMatch) {
        user.password = regReq.password;
        try { if (mongoose.connection.readyState === 1) await Employee.findOneAndUpdate({ email: user.email }, { password: regReq.password }); } catch (e) {}
      }
    }
  }

  if (!passwordMatch) return res.status(401).json({ error: 'Incorrect password. Please try again.' });

  // Auto-upgrade password hash if needed
  if (user.password && !user.password.startsWith('$2b$')) {
    const upgraded = await bcrypt.hash(password, 10);
    try { if (mongoose.connection.readyState === 1) await Employee.findOneAndUpdate({ email: user.email }, { password: upgraded }); } catch (e) {}
  }

  const token = jwt.sign({ id: user.id, email: user.email, userRole: user.userRole, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
  res.json({
    message: 'Login successful', token,
    user: {
      id: user.id, name: user.name, email: user.email, userRole: user.userRole,
      role: user.role, department: user.department, accountStatus: user.accountStatus,
      avatar: user.avatar, ptoDays: user.ptoDays, sickDays: user.sickDays,
      casualDays: user.casualDays, station: user.station, assignedLocation: user.assignedLocation
    }
  });
});

// Change Password (authenticated)
app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
  const { email, currentPassword, newPassword } = req.body;
  if (!email || !currentPassword || !newPassword) return res.status(400).json({ error: 'All fields are required' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });

  let user = null;
  try { if (mongoose.connection.readyState === 1) user = await Employee.findOne({ email: email.toLowerCase().trim() }); } catch (e) {}
  if (!user) user = memEmployees.find(e => e.email?.toLowerCase() === email.toLowerCase().trim());
  if (!user) return res.status(404).json({ error: 'Account not found' });

  const match = user.password ? await bcrypt.compare(currentPassword, user.password) : false;
  if (!match) return res.status(401).json({ error: 'Current password is incorrect' });

  const hashed = await bcrypt.hash(newPassword, 10);
  try { if (mongoose.connection.readyState === 1) await Employee.findOneAndUpdate({ email: user.email }, { password: hashed }); } catch (e) {}
  const idx = memEmployees.findIndex(e => e.email === user.email);
  if (idx !== -1) memEmployees[idx].password = hashed;
  saveDiskStore();
  res.json({ message: 'Password changed successfully' });
});

// ======================================================
// 2. ADMIN ENDPOINTS (Require Admin role)
// ======================================================

// Admin Clear All Test Data & Re-seed Clean Initial State
app.post(['/api/admin/clear-all-data', '/api/admin/reset-data'], authenticateToken, requireRole('Admin'), async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      await Employee.deleteMany({});
      await RegistrationRequest.deleteMany({});
      await Approval.deleteMany({});
      await Payslip.deleteMany({});
      await Notification.deleteMany({});
    }
  } catch (e) {
    console.error('Clear DB data error:', e.message);
  }

  // Clear in-memory collections
  memEmployees.length = 0;
  memRegistrationRequests.length = 0;
  memApprovals.length = 0;
  memPayslips.length = 0;
  memNotifications.length = 0;

  // Re-seed clean initial data
  try {
    await seedDevelopmentData('arnab.talukdar07@gmail.com', memEmployees, memApprovals, memPayslips, saveDiskStore);
  } catch (e) {
    console.error('Re-seed data error:', e.message);
  }
  saveDiskStore();

  res.json({
    message: 'All test data and registrations cleared successfully. Default Admin and HR accounts restored.',
    employeesCount: memEmployees.length
  });
});

// Admin Reset User Password
app.post('/api/admin/reset-password', authenticateToken, requireRole('Admin'), async (req, res) => {
  const { employeeId, email, newPassword } = req.body;
  if ((!employeeId && !email) || !newPassword) return res.status(400).json({ error: 'Employee ID or email, and new password are required' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });

  let user = null;
  const searchEmail = email ? email.toLowerCase().trim() : null;
  try {
    if (mongoose.connection.readyState === 1) {
      user = searchEmail ? await Employee.findOne({ email: searchEmail }) : await Employee.findOne({ id: employeeId });
    }
  } catch (e) {}
  if (!user) user = searchEmail ? memEmployees.find(e => e.email?.toLowerCase() === searchEmail) : memEmployees.find(e => e.id === employeeId);
  if (!user) return res.status(404).json({ error: 'Employee account not found' });

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  try { if (mongoose.connection.readyState === 1) await Employee.findOneAndUpdate({ email: user.email }, { password: hashedPassword }); } catch (e) {}
  const idx = memEmployees.findIndex(e => e.email === user.email);
  if (idx !== -1) memEmployees[idx].password = hashedPassword;
  saveDiskStore();

  sendEmployeeApprovalEmail(user, null, newPassword).catch(err => console.error('Reset password email error:', err));
  res.json({ message: `Password for ${user.name} (${user.email}) updated successfully.`, user: { id: user.id, name: user.name, email: user.email } });
});

// List Registration Requests (Admin only)
app.get('/api/admin/registration-requests', authenticateToken, requireRole('Admin'), async (req, res) => {
  const { status } = req.query;
  try {
    if (mongoose.connection.readyState === 1) {
      let query = {};
      if (status) query.status = status;
      return res.json(await RegistrationRequest.find(query).sort({ createdAt: -1 }));
    }
  } catch (e) {}
  let list = [...memRegistrationRequests];
  if (status) list = list.filter(r => r.status === status);
  res.json(list);
});

// Approve Registration Request (Admin only)
app.post('/api/admin/registration-requests/:id/approve', authenticateToken, requireRole('Admin'), async (req, res) => {
  const { id } = req.params;
  const { assignedHrId, salaryStructure, dob, bloodGroup, station, validity } = req.body;

  let regItem = null;
  const queryFilter = (mongoose.Types.ObjectId.isValid(id)) ? { $or: [{ id }, { _id: id }] } : { id };

  try {
    if (mongoose.connection.readyState === 1) {
      regItem = await RegistrationRequest.findOne(queryFilter);
    }
  } catch (e) {}
  if (!regItem) regItem = memRegistrationRequests.find(r => r.id === id || r._id === id);
  if (!regItem) return res.status(404).json({ error: 'Registration request not found' });

  regItem.status = 'approved';

  let hrObj = memEmployees.find(e => e.id === (assignedHrId || regItem.assignedHrId) && e.userRole === 'HR');
  if (!hrObj) hrObj = memEmployees.find(e => e.userRole === 'HR');
  if (!hrObj && mongoose.connection.readyState === 1) {
    try {
      const dbHr = await Employee.findOne({ userRole: 'HR' });
      if (dbHr) hrObj = { id: dbHr.id, name: dbHr.name, email: dbHr.email };
    } catch (e) {}
  }
  if (!hrObj) hrObj = { id: '', name: '', email: '' };

  const tempPassword = 'JRKC#' + Math.floor(100000 + Math.random() * 900000);
  const userPassword = await bcrypt.hash(tempPassword, 10);

  const newEmp = {
    id: `EMP-${Date.now().toString(36).toUpperCase()}`,
    name: regItem.name,
    email: regItem.email.toLowerCase().trim(),
    phone: regItem.phone || '',
    department: regItem.department || 'General',
    role: regItem.role || 'Employee',
    userRole: regItem.requestedUserRole || 'Employee',
    status: 'Clocked Out',
    accountStatus: 'approved',
    password: userPassword,
    ptoDays: 18, sickDays: 10, casualDays: 10, lwpDaysTaken: 0,
    joiningDate: new Date().toLocaleDateString('en-IN'),
    dateOfBirth: dob || '', dob: dob || '',
    bloodGroup: bloodGroup || '', station: station || '',
    idCardNo: `JRKCRIPL/${Math.floor(100 + Math.random() * 900)}`,
    validity: validity || '',
    assignedHrId: hrObj.id, assignedHrName: hrObj.name, assignedHrEmail: hrObj.email,
    salaryStructure: salaryStructure || { basic: 30000, hra: 12000, da: 0, sa: 8000, employerPf: 3600, employeePf: 3600 },
    baseSalary: (salaryStructure?.basic) || 30000,
    allowances: ((salaryStructure?.hra || 12000) + (salaryStructure?.sa || 8000)),
    taxDeductions: ((salaryStructure?.employeePf || 3600) + 200 + 1500),
    recentLogs: []
  };

  try {
    if (mongoose.connection.readyState === 1) {
      await RegistrationRequest.findOneAndUpdate(queryFilter, { status: 'approved' });
      const existingEmp = await Employee.findOne({ email: newEmp.email });
      if (existingEmp) {
        existingEmp.accountStatus = 'approved';
        existingEmp.userRole = newEmp.userRole;
        existingEmp.password = userPassword;
        existingEmp.salaryStructure = newEmp.salaryStructure;
        existingEmp.baseSalary = newEmp.baseSalary;
        existingEmp.allowances = newEmp.allowances;
        existingEmp.taxDeductions = newEmp.taxDeductions;
        existingEmp.assignedHrId = newEmp.assignedHrId;
        existingEmp.assignedHrName = newEmp.assignedHrName;
        existingEmp.assignedHrEmail = newEmp.assignedHrEmail;
        await existingEmp.save();
      } else {
        await Employee.create(newEmp);
      }
    }
  } catch (e) { console.error('Approve registration error:', e.message); }

  const index = memRegistrationRequests.findIndex(r => r.id === id || r._id === id);
  if (index !== -1) memRegistrationRequests[index].status = 'approved';

  const existingMemIdx = memEmployees.findIndex(e => e.email?.toLowerCase() === newEmp.email.toLowerCase());
  if (existingMemIdx !== -1) {
    memEmployees[existingMemIdx] = { ...memEmployees[existingMemIdx], ...newEmp, accountStatus: 'approved' };
  } else {
    memEmployees.unshift(newEmp);
  }
  saveDiskStore();

  sendEmployeeApprovalEmail(newEmp, hrObj.email, tempPassword).catch(err => console.error('Welcome email error:', err));
  await createNotification({ targetRole: 'Employee', recipientEmail: newEmp.email, title: 'Account Approved ✅', message: `Your registration was approved! Your temporary password has been sent to your email.`, type: 'registration' });
  await createNotification({ targetRole: 'HR', recipientId: hrObj.id, title: 'New Employee Assigned', message: `${newEmp.name} has been approved and assigned to your roster.`, type: 'registration' });

  res.json({ message: 'Registration request approved', employee: newEmp, tempPassword });
});

// Reject Registration Request
app.post('/api/admin/registration-requests/:id/reject', authenticateToken, requireRole('Admin'), async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  try {
    if (mongoose.connection.readyState === 1) {
      const updated = await RegistrationRequest.findOneAndUpdate({ id }, { status: 'rejected', rejectionReason: reason || 'Not approved' }, { new: true });
      if (updated) return res.json(updated);
    }
  } catch (e) {}
  const reg = memRegistrationRequests.find(r => r.id === id);
  if (reg) { reg.status = 'rejected'; reg.rejectionReason = reason || 'Not approved'; return res.json(reg); }
  res.status(404).json({ error: 'Registration request not found' });
});

// Assign HR to Employee (Admin only)
app.put('/api/admin/employees/:id/assign-hr', authenticateToken, requireRole('Admin'), async (req, res) => {
  const { id } = req.params;
  const { assignedHrId, assignedHrName, assignedHrEmail } = req.body;
  const updateFields = { assignedHrId, assignedHrName, assignedHrEmail };
  try {
    if (mongoose.connection.readyState === 1) {
      const updated = await Employee.findOneAndUpdate({ id }, updateFields, { new: true });
      if (updated) return res.json(updated);
    }
  } catch (e) {}
  const emp = memEmployees.find(e => e.id === id);
  if (emp) { Object.assign(emp, updateFields); saveDiskStore(); return res.json(emp); }
  res.status(404).json({ error: 'Employee not found' });
});

// Assign Work Location (Admin only — for geofencing)
app.put('/api/admin/employees/:id/assign-location', authenticateToken, requireRole('Admin'), async (req, res) => {
  const { id } = req.params;
  const { latitude, longitude, address, geofenceRadius } = req.body;

  if (latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'Latitude and longitude are required' });
  }

  const location = {
    latitude: Number(latitude),
    longitude: Number(longitude),
    address: sanitizeString(address) || '',
    geofenceRadius: Number(geofenceRadius) || 50
  };

  try {
    if (mongoose.connection.readyState === 1) {
      const updated = await Employee.findOneAndUpdate({ id }, { assignedLocation: location }, { new: true });
      if (updated) return res.json({ message: 'Location assigned', employee: updated });
    }
  } catch (e) {}

  const emp = memEmployees.find(e => e.id === id);
  if (emp) { emp.assignedLocation = location; saveDiskStore(); return res.json({ message: 'Location assigned', employee: emp }); }
  res.status(404).json({ error: 'Employee not found' });
});

// ======================================================
// 3. EMPLOYEE ENDPOINTS
// ======================================================

// Get employees list
app.get('/api/employees', authenticateToken, async (req, res) => {
  try {
    const { department, search, hrId, userRole } = req.query;
    let dbEmps = [];
    
    if (mongoose.connection.readyState === 1) {
      let query = {};
      if (department && department !== 'All') query.department = new RegExp(`^${department}$`, 'i');
      if (hrId) query.assignedHrId = hrId;
      if (userRole) query.userRole = userRole;
      if (search) {
        const q = search.toString();
        query.$or = [{ name: new RegExp(q, 'i') }, { role: new RegExp(q, 'i') }, { email: new RegExp(q, 'i') }];
      }
      dbEmps = await Employee.find(query).sort({ createdAt: -1 });
    // Self-healing: Ensure any approved photo requests automatically update employee avatar in DB & memory
    try {
      if (mongoose.connection.readyState === 1) {
        const approvedPhotoApps = await Approval.find({
          status: 'approved',
          type: { $in: ['Profile Picture Approval', 'Photo Change'] }
        });
        if (Array.isArray(approvedPhotoApps) && approvedPhotoApps.length > 0) {
          for (const pApp of approvedPhotoApps) {
            const photoUrl = pApp.newAvatarUrl || pApp.subDetails;
            if (photoUrl) {
              const qOr = [];
              if (pApp.employeeId) qOr.push({ id: pApp.employeeId });
              if (pApp.email) qOr.push({ email: pApp.email.toLowerCase().trim() });
              if (pApp.employeeName) qOr.push({ name: pApp.employeeName });
              if (qOr.length > 0) {
                await Employee.updateMany(
                  { $or: qOr, avatar: { $ne: photoUrl } },
                  { avatar: photoUrl, pendingAvatar: null, photoStatus: 'approved' }
                );
              }
            }
          }
          // Refresh dbEmps after self-healing
          let query = {};
          if (department && department !== 'All') query.department = new RegExp(`^${department}$`, 'i');
          if (hrId) query.assignedHrId = hrId;
          if (userRole) query.userRole = userRole;
          if (search) {
            const q = search.toString();
            query.$or = [{ name: new RegExp(q, 'i') }, { role: new RegExp(q, 'i') }, { email: new RegExp(q, 'i') }];
          }
          dbEmps = await Employee.find(query).sort({ createdAt: -1 });
        }
      }
    } catch (e) {}

    // Combine memory store first, then DB second so DB status ALWAYS overrides memory store
    const empMap = new Map();
    memEmployees.forEach(e => {
      try {
        if (e && e.email && typeof e.email === 'string') empMap.set(e.email.toLowerCase().trim(), e);
      } catch (err) {}
    });
    
    if (Array.isArray(dbEmps)) {
      dbEmps.forEach(e => {
        try {
          const obj = e.toObject ? e.toObject() : e;
          if (obj && obj.email && typeof obj.email === 'string') empMap.set(obj.email.toLowerCase().trim(), obj);
        } catch (err) {}
      });
    }

    let result = Array.from(empMap.values());
    if (department && department !== 'All') result = result.filter(e => e.department && typeof e.department === 'string' && e.department.toLowerCase() === department.toString().toLowerCase());
    if (hrId) result = result.filter(e => e.assignedHrId === hrId);
    if (userRole) result = result.filter(e => e.userRole === userRole);
    if (search) {
      const q = search.toString().toLowerCase();
      result = result.filter(e => 
        (e.name && typeof e.name === 'string' && e.name.toLowerCase().includes(q)) || 
        (e.role && typeof e.role === 'string' && e.role.toLowerCase().includes(q)) || 
        (e.email && typeof e.email === 'string' && e.email.toLowerCase().includes(q))
      );
    }
    res.json(result);
  } catch (error) {
    console.error('CRITICAL ERROR in /api/employees GET:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Onboard New Employee (Admin/HR)
app.post('/api/employees', authenticateToken, requireRole('Admin', 'HR'), async (req, res) => {
  const { name, email, phone, department, role, userRole, password, joiningDate, dateOfBirth, dob, bloodGroup, station, validity, salaryStructure } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });
  if (!validateEmail(email)) return res.status(400).json({ error: 'Invalid email address' });

  const plainPassword = password || 'Employee@123';
  const hashedPassword = await bcrypt.hash(plainPassword, 10);

  const newEmp = {
    id: `EMP-${Date.now().toString(36).toUpperCase()}`,
    name: sanitizeString(name), email: email.toLowerCase().trim(), phone: phone || '',
    department: sanitizeString(department) || 'General', role: sanitizeString(role) || 'Employee',
    userRole: userRole || 'Employee', status: 'Clocked Out', accountStatus: 'approved',
    password: hashedPassword,
    ptoDays: 18, sickDays: 10, casualDays: 10, lwpDaysTaken: 0,
    joiningDate: joiningDate || new Date().toLocaleDateString('en-IN'),
    dateOfBirth: dateOfBirth || dob || '', dob: dob || dateOfBirth || '',
    bloodGroup: bloodGroup || '', station: station || '',
    idCardNo: `JRKCRIPL/${Math.floor(100 + Math.random() * 900)}`, validity: validity || '',
    salaryStructure: salaryStructure || { basic: 0, hra: 0, da: 0, sa: 0, employerPf: 0, employeePf: 0 },
    recentLogs: []
  };

  try { if (mongoose.connection.readyState === 1) await Employee.create(newEmp); } catch (e) { console.error('Onboard error:', e.message); }
  memEmployees.unshift(newEmp);
  saveDiskStore();
  res.status(201).json(newEmp);
});

// Profile Photo Change Request
app.post('/api/employees/photo-request', authenticateToken, async (req, res) => {
  const { employeeId, email, newAvatarUrl } = req.body;
  let emp = memEmployees.find(e => e.id === employeeId || (email && e.email?.toLowerCase() === email.toLowerCase()));
  if (!emp && mongoose.connection.readyState === 1) {
    try { emp = await Employee.findOne({ $or: [{ id: employeeId }, { email: email ? email.toLowerCase().trim() : '' }] }); } catch (e) {}
  }
  if (!emp) return res.status(404).json({ error: 'Employee not found' });

  emp.pendingAvatar = newAvatarUrl;
  emp.photoStatus = 'pending';

  const newApproval = {
    id: `REQ-${Date.now().toString(36).toUpperCase()}`,
    employeeId: emp.id, employeeName: emp.name, role: emp.role, avatar: emp.avatar,
    newAvatarUrl, type: 'Profile Picture Approval', details: 'Profile Picture Change Request',
    subDetails: newAvatarUrl, assignedHrId: emp.assignedHrId || '', assignedHrName: emp.assignedHrName || '',
    assignedHrEmail: emp.assignedHrEmail || '', status: 'pending_hr', dateSubmitted: new Date().toISOString()
  };

  try {
    if (mongoose.connection.readyState === 1) {
      await Employee.findOneAndUpdate({ $or: [{ id: emp.id }, { email: emp.email }] }, { pendingAvatar: newAvatarUrl, photoStatus: 'pending' });
      await Approval.create(newApproval);
    }
  } catch (e) {}
  memApprovals.unshift(newApproval);
  await createNotification({ targetRole: 'HR', recipientId: emp.assignedHrId, title: 'Profile Photo Submission', message: `${emp.name} uploaded a new profile picture.`, type: 'leave_request' });
  res.status(201).json({ message: 'Photo submitted for HR approval', approval: newApproval });
});

// ======================================================
// 4. ATTENDANCE & TIMESHEET
// ======================================================

// Mount Modular Attendance Routes (Clock In/Out/Status/History)
app.use('/api/attendance', attendanceRoutes);

// Timesheet Entry
app.post('/api/attendance/timesheet-entry', authenticateToken, async (req, res) => {
  const { employeeId, email, projectName, hours, notes, date } = req.body;
  const now = new Date();
  const dateStr = date || getTodayDateStr();

  const projectEntry = {
    id: `TS-${Date.now().toString(36).toUpperCase()}`,
    type: 'project_log', date: dateStr,
    projectName: sanitizeString(projectName) || 'General Work',
    hours: hours || '4.0 hrs', notes: sanitizeString(notes) || '',
    duration: hours || '4.0 hrs', status: 'Submitted', createdAt: now.toISOString()
  };

  try {
    if (mongoose.connection.readyState === 1) {
      const emp = await Employee.findOneAndUpdate(
        { $or: [{ id: employeeId }, { email: email ? email.toLowerCase().trim() : '' }] },
        { $push: { recentLogs: { $each: [projectEntry], $position: 0 } } }, { new: true }
      );
      if (emp) return res.status(201).json({ message: 'Timesheet log saved', log: projectEntry });
    }
  } catch (e) {}

  let emp = memEmployees.find(e => e.id === employeeId || (email && e.email?.toLowerCase() === email?.toLowerCase()));
  if (emp) {
    if (!emp.recentLogs) emp.recentLogs = [];
    emp.recentLogs.unshift(projectEntry);
    saveDiskStore();
    return res.status(201).json({ message: 'Timesheet log saved', log: projectEntry });
  }
  res.status(404).json({ error: 'Employee not found' });
});

// ======================================================
// 5. LEAVE REQUESTS & APPROVAL WORKFLOW
// ======================================================

// HR or Director changes salary structure or leave quota
const handleUpdateEmployeeQuotaSalary = async (req, res) => {
  const { id } = req.params;
  const { ptoDays, sickDays, casualDays, baseSalary, allowances, taxDeductions, salaryStructure } = req.body;
  const updateData = {};
  if (ptoDays !== undefined) updateData.ptoDays = Number(ptoDays);
  if (sickDays !== undefined) updateData.sickDays = Number(sickDays);
  if (casualDays !== undefined) updateData.casualDays = Number(casualDays);
  if (baseSalary !== undefined) updateData.baseSalary = Number(baseSalary);
  if (allowances !== undefined) updateData.allowances = Number(allowances);
  if (taxDeductions !== undefined) updateData.taxDeductions = Number(taxDeductions);
  if (salaryStructure !== undefined && typeof salaryStructure === 'object') updateData.salaryStructure = salaryStructure;

  try {
    if (mongoose.connection.readyState === 1) {
      const updated = await Employee.findOneAndUpdate({ id }, updateData, { new: true });
      if (updated) {
        await createNotification({ targetRole: 'Employee', recipientId: id, title: 'Salary & Quota Updated', message: `Your salary structure / leave quota has been updated.`, type: 'quota_update' });
        return res.json(updated);
      }
    }
  } catch (e) {}
  const emp = memEmployees.find(e => e.id === id);
  if (emp) {
    Object.assign(emp, updateData);
    saveDiskStore();
    await createNotification({ targetRole: 'Employee', recipientId: id, title: 'Salary & Quota Updated', message: `Your salary structure / leave quota has been updated.`, type: 'quota_update' });
    return res.json(emp);
  }
  res.status(404).json({ error: 'Employee not found' });
};

app.put('/api/hr/employees/:id/leave-quota', authenticateToken, requireRole('Admin', 'HR', 'Director'), handleUpdateEmployeeQuotaSalary);
app.put('/api/hr/employees/:id/salary', authenticateToken, requireRole('Admin', 'HR', 'Director'), handleUpdateEmployeeQuotaSalary);

// HR or Director updates full employee profile
app.put('/api/employees/:id', authenticateToken, requireRole('Admin', 'HR', 'Director'), async (req, res) => {
  const { id } = req.params;
  const {
    name, role, department, email, phone, reportingManager,
    ptoDays, sickDays, casualDays, dob, dateOfBirth, bloodGroup, station,
    baseSalary, allowances, taxDeductions, assignedHrId, assignedHrName, assignedHrEmail
  } = req.body;

  const updateData = {};
  if (name !== undefined) updateData.name = sanitizeString(name);
  if (role !== undefined) updateData.role = sanitizeString(role);
  if (department !== undefined) updateData.department = sanitizeString(department);
  if (email !== undefined) updateData.email = sanitizeString(email).toLowerCase();
  if (phone !== undefined) updateData.phone = sanitizeString(phone);
  if (reportingManager !== undefined) updateData.reportingManager = sanitizeString(reportingManager);
  if (ptoDays !== undefined) updateData.ptoDays = Number(ptoDays);
  if (sickDays !== undefined) updateData.sickDays = Number(sickDays);
  if (casualDays !== undefined) updateData.casualDays = Number(casualDays);
  if (dob !== undefined) updateData.dob = sanitizeString(dob);
  if (dateOfBirth !== undefined) updateData.dateOfBirth = sanitizeString(dateOfBirth);
  if (bloodGroup !== undefined) updateData.bloodGroup = sanitizeString(bloodGroup);
  if (station !== undefined) updateData.station = sanitizeString(station);
  if (baseSalary !== undefined) updateData.baseSalary = Number(baseSalary);
  if (allowances !== undefined) updateData.allowances = Number(allowances);
  if (taxDeductions !== undefined) updateData.taxDeductions = Number(taxDeductions);
  if (assignedHrId !== undefined) updateData.assignedHrId = assignedHrId;
  if (assignedHrName !== undefined) updateData.assignedHrName = assignedHrName;
  if (assignedHrEmail !== undefined) updateData.assignedHrEmail = assignedHrEmail;

  try {
    if (mongoose.connection.readyState === 1) {
      const updated = await Employee.findOneAndUpdate({ $or: [{ id }, { email: id }] }, updateData, { new: true });
      if (updated) {
        await createNotification({ recipientId: id, title: 'Profile Updated', message: 'Your profile details have been updated by HR / Director.', type: 'profile_update' });
        return res.json(updated);
      }
    }
  } catch (e) {}

  const emp = memEmployees.find(e => e.id === id || e.email === id);
  if (emp) {
    Object.assign(emp, updateData);
    saveDiskStore();
    return res.json(emp);
  }
  res.status(404).json({ error: 'Employee not found' });
});

app.put('/api/hr/employees/:id/profile', authenticateToken, requireRole('Admin', 'HR', 'Director'), async (req, res) => {
  req.url = `/api/employees/${req.params.id}`;
  app._router.handle(req, res);
});


// Submit Leave Request
app.post('/api/approvals', authenticateToken, async (req, res) => {
  const { employeeId, employeeName, type, details, subDetails, startDate, endDate, totalDays, isLwp } = req.body;

  let emp = memEmployees.find(e => e.id === employeeId || e.name === employeeName);
  if (!emp && mongoose.connection.readyState === 1) {
    try { emp = await Employee.findOne({ $or: [{ id: employeeId }, { name: employeeName }] }); } catch (e) {}
  }

  const defaultHr = memEmployees.find(e => e.userRole === 'HR') || { id: '', name: '', email: '' };
  const assignedHrId = emp?.assignedHrId || defaultHr.id;
  const assignedHrName = emp?.assignedHrName || defaultHr.name;
  const assignedHrEmail = emp?.assignedHrEmail || defaultHr.email;

  const daysCount = Number(totalDays) || 1;
  const isLwpLeave = isLwp || type === 'LWP' || type === 'Leave Without Pay';

  const newApproval = {
    id: `REQ-${Date.now().toString(36).toUpperCase()}`,
    employeeId: emp?.id || employeeId,
    employeeName: employeeName || emp?.name || 'Employee',
    role: emp?.role || 'Employee',
    avatar: emp?.avatar || '',
    type: type || (isLwpLeave ? 'LWP Leave' : 'Annual Leave'),
    details: details || `${daysCount} Day(s) Leave`,
    subDetails: subDetails || '',
    assignedHrId, assignedHrName, assignedHrEmail,
    startDate: startDate || '', endDate: endDate || '',
    totalDays: daysCount, isLwp: isLwpLeave,
    lwpDays: isLwpLeave ? daysCount : 0,
    status: 'pending_hr',
    dateSubmitted: new Date().toISOString()
  };

  try {
    if (mongoose.connection.readyState === 1) {
      const created = await Approval.create(newApproval);
      sendLeaveRequestAlert(created, assignedHrEmail).catch(err => console.error('Leave email error:', err));
      await createNotification({ targetRole: 'HR', recipientId: assignedHrId, title: 'New Leave Request', message: `${newApproval.employeeName} requested ${newApproval.type} (${daysCount} day(s)).`, type: 'leave_request' });
      await createNotification({ targetRole: 'Admin', title: 'Leave Request Submitted', message: `${newApproval.employeeName} submitted a leave request.`, type: 'leave_request' });
      return res.status(201).json(created);
    }
  } catch (e) {}

  memApprovals.unshift(newApproval);
  saveDiskStore();
  sendLeaveRequestAlert(newApproval, assignedHrEmail).catch(err => console.error('Leave email error:', err));
  await createNotification({ targetRole: 'HR', recipientId: assignedHrId, title: 'New Leave Request', message: `${newApproval.employeeName} requested ${newApproval.type} (${daysCount} day(s)).`, type: 'leave_request' });
  await createNotification({ targetRole: 'Admin', title: 'Leave Request Submitted', message: `${newApproval.employeeName} submitted a leave request.`, type: 'leave_request' });
  res.status(201).json(newApproval);
});

// List Approvals
app.get('/api/approvals', authenticateToken, async (req, res) => {
  const { hrId, status } = req.query;
  try {
    if (mongoose.connection.readyState === 1) {
      let query = {};
      if (hrId) query.assignedHrId = hrId;
      if (status) query.status = status;
      return res.json(await Approval.find(query).sort({ createdAt: -1 }));
    }
  } catch (e) {}
  let list = [...memApprovals];
  if (hrId) list = list.filter(a => a.assignedHrId === hrId);
  if (status) list = list.filter(a => a.status === status);
  res.json(list);
});

// Approve/Reject/Edit Leave (2-step: HR → Admin, plus HR/Director Override & Correction)
app.patch('/api/approvals/:id', authenticateToken, requireRole('Admin', 'HR', 'Director'), async (req, res) => {
  const { id } = req.params;
  const { status, action, userRole, approverName, remarks, details, totalDays } = req.body;

  let item = null;
  try { if (mongoose.connection.readyState === 1) item = await Approval.findOne({ id }); } catch (e) {}
  if (!item) item = memApprovals.find(a => a.id === id);
  if (!item) return res.status(404).json({ error: 'Approval request not found' });

  const prevStatus = item.status;
  if (details !== undefined) item.details = sanitizeString(details);
  if (req.body.subDetails !== undefined) item.subDetails = sanitizeString(req.body.subDetails);
  if (totalDays !== undefined) item.totalDays = Number(totalDays);
  if (remarks !== undefined) item.remarks = sanitizeString(remarks);

  let nextStatus = status || item.status;

  // Multi-stage & Override status transition
  if (action === 'override' || action === 'edit') {
    nextStatus = status || item.status;
    if (userRole === 'Admin' || req.user.userRole === 'Admin' || req.user.userRole === 'Director') {
      item.adminApprovedBy = approverName || req.user.name;
      item.adminApprovedAt = new Date().toISOString();
    } else {
      item.hrApprovedBy = approverName || req.user.name;
      item.hrApprovedAt = new Date().toISOString();
    }
  } else if (item.type === 'Profile Picture Approval' || item.type === 'Photo Change') {
    if (status === 'approved' || action === 'hr_approve' || action === 'admin_approve') {
      nextStatus = 'approved';
      item.hrApprovedBy = approverName || req.user.name;
      item.hrApprovedAt = new Date().toISOString();
    } else if (status === 'rejected') nextStatus = 'rejected';
  } else if (action === 'hr_approve' || (status === 'pending_admin') || (status === 'approved' && (item.status === 'pending_hr' || item.status === 'pending') && userRole === 'HR')) {
    nextStatus = 'pending_admin';
    item.hrApprovedBy = approverName || req.user.name;
    item.hrApprovedAt = new Date().toISOString();
  } else if (action === 'admin_approve' || (status === 'approved' && item.status === 'pending_admin') || (status === 'approved' && userRole === 'Admin')) {
    nextStatus = 'approved';
    item.adminApprovedBy = approverName || req.user.name;
    item.adminApprovedAt = new Date().toISOString();
  } else if (status === 'rejected') nextStatus = 'rejected';
  else if (status === 'cancelled') nextStatus = 'cancelled';

  item.status = nextStatus;

  // Find target employee
  let emp = memEmployees.find(e => 
    (item.employeeId && e.id === item.employeeId) || 
    (item.email && e.email?.toLowerCase() === item.email.toLowerCase()) ||
    (item.employeeEmail && e.email?.toLowerCase() === item.employeeEmail.toLowerCase()) ||
    (item.employeeName && e.name?.toLowerCase() === item.employeeName.toLowerCase())
  );

  if (!emp && mongoose.connection.readyState === 1) {
    try {
      const empOr = [];
      if (item.employeeId) empOr.push({ id: item.employeeId });
      if (item.email) empOr.push({ email: item.email.toLowerCase().trim() });
      if (item.employeeEmail) empOr.push({ email: item.employeeEmail.toLowerCase().trim() });
      if (item.employeeName) empOr.push({ name: item.employeeName });
      if (empOr.length > 0) {
        emp = await Employee.findOne({ $or: empOr });
      }
    } catch (e) {}
  }

  const isPhotoType = item.type === 'Profile Picture Approval' || item.type === 'Photo Change' || item.type?.includes('Photo') || item.type?.includes('Picture');

  // Adjust leave balances if status was reverted or newly approved
  if (prevStatus === 'approved' && nextStatus !== 'approved' && emp && !isPhotoType) {
    const days = item.totalDays || 1;
    if (item.isLwp || item.type?.includes('LWP')) {
      emp.lwpDaysTaken = Math.max(0, (emp.lwpDaysTaken || 0) - days);
    } else if (item.type?.includes('Casual')) {
      emp.casualDaysTaken = Math.max(0, (emp.casualDaysTaken || 0) - days);
    } else if (item.type?.includes('Sick')) {
      emp.sickDaysTaken = Math.max(0, (emp.sickDaysTaken || 0) - days);
    } else if (item.type?.includes('Annual') || item.type?.includes('Earned') || item.type?.includes('PTO')) {
      emp.ptoDaysTaken = Math.max(0, (emp.ptoDaysTaken || 0) - days);
    }
  }

  if (prevStatus !== 'approved' && nextStatus === 'approved' && emp && !isPhotoType) {
    const days = item.totalDays || 1;
    if (item.isLwp || item.type?.includes('LWP')) {
      emp.lwpDaysTaken = (emp.lwpDaysTaken || 0) + days;
    } else if (item.type?.includes('Casual')) {
      emp.casualDaysTaken = (emp.casualDaysTaken || 0) + days;
    } else if (item.type?.includes('Sick')) {
      emp.sickDaysTaken = (emp.sickDaysTaken || 0) + days;
    } else if (item.type?.includes('Annual') || item.type?.includes('Earned') || item.type?.includes('PTO')) {
      emp.ptoDaysTaken = (emp.ptoDaysTaken || 0) + days;
    }
  }

  if (nextStatus === 'approved' && isPhotoType) {
    const photoToApply = item.newAvatarUrl || item.subDetails;
    if (photoToApply) {
      if (emp) { emp.avatar = photoToApply; emp.pendingAvatar = null; emp.photoStatus = 'approved'; }
      if (mongoose.connection.readyState === 1) {
        try {
          const empOr = [];
          if (emp && emp.id) empOr.push({ id: emp.id });
          if (emp && emp.email) empOr.push({ email: emp.email.toLowerCase().trim() });
          if (item.employeeId) empOr.push({ id: item.employeeId });
          if (item.email) empOr.push({ email: item.email.toLowerCase().trim() });
          if (item.employeeEmail) empOr.push({ email: item.employeeEmail.toLowerCase().trim() });
          if (item.employeeName) empOr.push({ name: item.employeeName });
          if (empOr.length > 0) {
            const updatedDbEmp = await Employee.findOneAndUpdate(
              { $or: empOr },
              { avatar: photoToApply, pendingAvatar: null, photoStatus: 'approved' },
              { new: true }
            );
            if (updatedDbEmp && !memEmployees.some(m => m.id === updatedDbEmp.id || m.email === updatedDbEmp.email)) {
              memEmployees.unshift(updatedDbEmp.toObject());
            }
          }
        } catch (err) {
          console.error('Failed to apply approved avatar in DB:', err.message);
        }
      }
    }
  } else if (nextStatus === 'rejected' && isPhotoType) {
    if (emp) { emp.pendingAvatar = null; emp.photoStatus = 'rejected'; }
    if (mongoose.connection.readyState === 1) {
      try {
        const empOr = [];
        if (emp && emp.id) empOr.push({ id: emp.id });
        if (emp && emp.email) empOr.push({ email: emp.email.toLowerCase().trim() });
        if (item.employeeId) empOr.push({ id: item.employeeId });
        if (item.email) empOr.push({ email: item.email.toLowerCase().trim() });
        if (item.employeeName) empOr.push({ name: item.employeeName });
        if (empOr.length > 0) {
          await Employee.findOneAndUpdate({ $or: empOr }, { pendingAvatar: null, photoStatus: 'rejected' });
        }
      } catch (e) {}
    }
  }
  saveDiskStore();

  try {
    if (mongoose.connection.readyState === 1) {
      await Approval.findOneAndUpdate(
        { id },
        {
          status: nextStatus,
          details: item.details,
          subDetails: item.subDetails,
          totalDays: item.totalDays,
          remarks: item.remarks,
          hrApprovedBy: item.hrApprovedBy,
          hrApprovedAt: item.hrApprovedAt,
          adminApprovedBy: item.adminApprovedBy,
          adminApprovedAt: item.adminApprovedAt
        }
      );
      if (emp && !isPhotoType) {
        await Employee.findOneAndUpdate(
          { $or: [{ id: emp.id }, { email: emp.email }] },
          {
            lwpDaysTaken: emp.lwpDaysTaken,
            ptoDaysTaken: emp.ptoDaysTaken,
            sickDaysTaken: emp.sickDaysTaken,
            casualDaysTaken: emp.casualDaysTaken
          }
        );
      }
    }
  } catch (e) {}

  // Notifications
  const empEmail = emp?.email || '';
  if (nextStatus === 'pending_admin') {
    await createNotification({ targetRole: 'Admin', title: 'Leave Request Pending Admin Approval', message: `${item.employeeName}'s ${item.type} approved by HR. Pending Director final approval.`, type: 'leave_request' });
    await createNotification({ targetRole: 'Employee', recipientEmail: empEmail, title: 'Leave Approved by HR', message: `Your ${item.type} request has been approved by HR. Pending Director approval.`, type: 'leave_approval' });
  } else if (nextStatus === 'approved') {
    sendLeaveStatusNotification(item, empEmail).catch(err => console.error('Leave email error:', err));
    await createNotification({ targetRole: 'Employee', recipientEmail: empEmail, title: 'Leave Fully Approved ✅', message: `Your ${item.type} (${item.totalDays} day(s)) has been approved.`, type: 'leave_approval' });
  } else if (nextStatus === 'rejected') {
    sendLeaveStatusNotification(item, empEmail).catch(err => console.error('Leave email error:', err));
    await createNotification({ targetRole: 'Employee', recipientEmail: empEmail, title: 'Approval Decision Updated / Rejected ❌', message: `Your ${item.type} decision was updated to rejected.`, type: 'leave_rejection' });
  }

  res.json(item);
});

// Submit Attendance Regularization Request
app.post('/api/approvals/regularize', authenticateToken, async (req, res) => {
  const { employeeId, regularizationDate, missedType, requestedClockIn = '09:00 AM', requestedClockOut = '06:00 PM', reason } = req.body;

  let emp = memEmployees.find(e => e.id === employeeId || e.email === req.user.email);
  if (!emp && mongoose.connection.readyState === 1) {
    try { emp = await Employee.findOne({ $or: [{ id: employeeId }, { email: req.user.email }] }); } catch (e) {}
  }
  if (!emp) return res.status(404).json({ error: 'Employee not found' });

  const newApproval = {
    id: `REG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    employeeId: emp.id,
    employeeName: emp.name,
    role: emp.role,
    avatar: emp.avatar || '',
    type: 'Attendance Regularization',
    details: `${missedType || 'Missed Punch'} on ${regularizationDate}`,
    subDetails: `Shift: ${requestedClockIn} - ${requestedClockOut}`,
    assignedHrId: emp.assignedHrId || '',
    assignedHrName: emp.assignedHrName || '',
    assignedHrEmail: emp.assignedHrEmail || '',
    regularizationDate,
    missedType: missedType || 'Missed Clock In',
    requestedClockIn,
    requestedClockOut,
    reason: reason || 'Shift punch regularization',
    status: 'pending_hr',
    dateSubmitted: new Date().toISOString().split('T')[0]
  };

  try {
    if (mongoose.connection.readyState === 1) {
      await Approval.create(newApproval);
    }
  } catch (e) {}
  memApprovals.unshift(newApproval);
  saveDiskStore();

  await createNotification({ targetRole: 'HR', recipientId: emp.assignedHrId, title: 'New Regularization Request ⏰', message: `${emp.name} requested regularization for ${regularizationDate}.`, type: 'leave_request' });
  await createNotification({ targetRole: 'Admin', title: 'Regularization Request Submitted', message: `${emp.name} submitted attendance regularization.`, type: 'leave_request' });

  res.status(201).json(newApproval);
});
app.get('/api/hr/settings', authenticateToken, async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const settings = await HRSettings.findOne({ id: 'HR_SETTINGS_GLOBAL' });
      if (settings) return res.json(settings);
    }
  } catch (e) {}
  res.json({ id: 'HR_SETTINGS_GLOBAL', lwpDeductionBasis: 'basic', workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] });
});

app.put('/api/hr/settings', authenticateToken, requireRole('Admin', 'HR'), async (req, res) => {
  const updates = req.body;
  try {
    if (mongoose.connection.readyState === 1) {
      const updated = await HRSettings.findOneAndUpdate({ id: 'HR_SETTINGS_GLOBAL' }, updates, { new: true, upsert: true });
      return res.json(updated);
    }
  } catch (e) {}
  res.json({ id: 'HR_SETTINGS_GLOBAL', ...updates });
});

// ======================================================
// 5.5 SALARY ADVANCE MODULE
// ======================================================

// Request Salary Advance
app.post('/api/salary-advance/request', authenticateToken, async (req, res) => {
  try {
    const { requestedAmount, reason, preferredRepaymentPeriod } = req.body;
    const userEmail = req.user.email;

    let emp = memEmployees.find(e => e.email === userEmail || e.id === req.user.id);
    if (!emp && mongoose.connection.readyState === 1) {
      emp = await Employee.findOne({ $or: [{ email: userEmail }, { id: req.user.id }] });
    }
    if (!emp) return res.status(404).json({ error: 'Employee profile not found' });

    const grossMonthlySalary = calculateGrossSalary(emp);
    if (grossMonthlySalary <= 0) {
      return res.status(400).json({ error: 'Employee salary structure is not configured or base salary is ₹0. Please contact HR.' });
    }

    const maxEligibleAdvance = grossMonthlySalary;
    const reqAmt = Number(requestedAmount);
    const tenure = Number(preferredRepaymentPeriod);

    if (!reqAmt || reqAmt <= 0) {
      return res.status(400).json({ error: 'Requested advance amount must be greater than 0.' });
    }

    if (req.user.userRole === 'Employee' && reqAmt > maxEligibleAdvance) {
      return res.status(400).json({ error: `Requested amount (₹${reqAmt.toLocaleString('en-IN')}) exceeds maximum eligible limit of 1 month Gross Salary (₹${maxEligibleAdvance.toLocaleString('en-IN')}).` });
    }

    if (![3, 6, 12].includes(tenure)) {
      return res.status(400).json({ error: 'Repayment tenure must be 3, 6, or 12 months.' });
    }

    // Check if employee already has an active or pending advance request
    let existingActive = null;
    if (mongoose.connection.readyState === 1) {
      existingActive = await SalaryAdvance.findOne({
        employeeId: emp.id,
        status: { $in: ['pending', 'approved'] },
        $or: [{ status: 'pending' }, { outstandingBalance: { $gt: 0 } }]
      });
    } else {
      existingActive = memSalaryAdvances.find(adv =>
        adv.employeeId === emp.id &&
        (adv.status === 'pending' || (adv.status === 'approved' && adv.outstandingBalance > 0))
      );
    }

    if (existingActive) {
      return res.status(400).json({
        error: `You already have an ${existingActive.status === 'pending' ? 'unprocessed pending' : 'active ongoing'} Salary Advance request. Outstanding balance: ₹${(existingActive.outstandingBalance || 0).toLocaleString('en-IN')}. Complete current repayments before applying again.`
      });
    }

    const advanceId = `ADV-${Date.now().toString(36).toUpperCase()}`;
    const newAdvance = {
      id: advanceId,
      employeeId: emp.id,
      employeeName: emp.name,
      employeeEmail: emp.email,
      department: emp.department,
      role: emp.role,
      grossMonthlySalary,
      maxEligibleAdvance,
      requestedAmount: reqAmt,
      approvedAmount: reqAmt, // default until reviewed by Director
      reason: reason || 'Salary Advance Request',
      preferredRepaymentPeriod: tenure,
      approvedRepaymentPeriod: tenure,
      status: 'pending',
      repaymentSchedule: [],
      amountRepaid: 0,
      outstandingBalance: 0,
      installmentsPaid: 0,
      totalInstallments: tenure,
      requestDate: new Date().toISOString().split('T')[0]
    };

    if (mongoose.connection.readyState === 1) {
      await SalaryAdvance.create(newAdvance);
    }
    memSalaryAdvances.unshift(newAdvance);

    // Add Approval record for Admin/Director dashboard
    const approvalId = `ADV-APP-${Date.now()}`;
    const newApproval = {
      id: approvalId,
      employeeId: emp.id,
      employeeName: emp.name,
      role: emp.role,
      avatar: emp.avatar || '',
      type: 'Salary Advance',
      details: `Requested ₹${reqAmt.toLocaleString('en-IN')} over ${tenure} Months`,
      subDetails: `Reason: ${reason} | Gross Salary: ₹${grossMonthlySalary.toLocaleString('en-IN')}`,
      assignedHrId: emp.assignedHrId || '',
      assignedHrName: emp.assignedHrName || '',
      assignedHrEmail: emp.assignedHrEmail || '',
      reason,
      status: 'pending_admin',
      dateSubmitted: new Date().toISOString().split('T')[0]
    };

    if (mongoose.connection.readyState === 1) {
      await Approval.create(newApproval);
    }
    memApprovals.unshift(newApproval);
    saveDiskStore();

    // Create notifications for Director and Admin
    await createNotification({ targetRole: 'Admin', title: 'New Salary Advance Request 💵', message: `${emp.name} requested ₹${reqAmt.toLocaleString('en-IN')} advance (${tenure} Months).`, type: 'leave_request' });
    await createNotification({ targetRole: 'Employee', recipientEmail: emp.email, title: 'Salary Advance Requested 📑', message: `Your request for ₹${reqAmt.toLocaleString('en-IN')} Salary Advance has been submitted for Director approval.`, type: 'leave_request' });

    res.status(201).json({ message: 'Salary advance request submitted successfully', advance: newAdvance });
  } catch (err) {
    console.error('Error requesting salary advance:', err);
    res.status(500).json({ error: 'Internal server error while submitting salary advance request' });
  }
});

// Get Employee Salary Advance Summary & History
app.get('/api/salary-advance/employee/:employeeId', authenticateToken, async (req, res) => {
  try {
    const { employeeId } = req.params;
    let emp = memEmployees.find(e => e.id === employeeId || e.email === employeeId);
    if (!emp && mongoose.connection.readyState === 1) {
      emp = await Employee.findOne({ $or: [{ id: employeeId }, { email: employeeId }] });
    }
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    const grossMonthlySalary = calculateGrossSalary(emp);
    const maxEligibleAdvance = grossMonthlySalary;

    let advances = [];
    if (mongoose.connection.readyState === 1) {
      advances = await SalaryAdvance.find({ $or: [{ employeeId: emp.id }, { employeeEmail: emp.email }] }).sort({ createdAt: -1 });
    } else {
      advances = memSalaryAdvances.filter(a => a.employeeId === emp.id || a.employeeEmail === emp.email);
    }

    const activeAdvance = advances.find(a => a.status === 'approved' && a.outstandingBalance > 0) ||
                          advances.find(a => a.status === 'pending') || null;

    const outstandingBalance = activeAdvance?.status === 'approved' ? activeAdvance.outstandingBalance : 0;
    const existingAdvanceAmount = activeAdvance ? activeAdvance.approvedAmount || activeAdvance.requestedAmount : 0;

    res.json({
      employeeId: emp.id,
      employeeName: emp.name,
      grossMonthlySalary,
      maxEligibleAdvance,
      existingAdvanceAmount,
      outstandingBalance,
      activeAdvance,
      history: advances
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch salary advance details' });
  }
});

// Get All Salary Advance Requests (Admin/Director)
app.get('/api/salary-advance/admin/requests', authenticateToken, requireRole('Admin', 'HR'), async (req, res) => {
  try {
    const { status } = req.query;
    let list = [];
    if (mongoose.connection.readyState === 1) {
      const query = status ? { status } : {};
      list = await SalaryAdvance.find(query).sort({ createdAt: -1 });
    } else {
      list = status ? memSalaryAdvances.filter(a => a.status === status) : memSalaryAdvances;
    }
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch salary advance requests' });
  }
});

// Approve Salary Advance (Admin/Director Only)
app.post('/api/salary-advance/:id/approve', authenticateToken, requireRole('Admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { approvedAmount, approvedRepaymentPeriod, remarks, startMonth = 'June', startYear = 2026 } = req.body;

    let adv = null;
    if (mongoose.connection.readyState === 1) {
      adv = await SalaryAdvance.findOne({ $or: [{ id }, { _id: mongoose.Types.ObjectId.isValid(id) ? id : null }] });
    } else {
      adv = memSalaryAdvances.find(a => a.id === id);
    }
    if (!adv) return res.status(404).json({ error: 'Salary advance request not found' });

    const finalAmount = Number(approvedAmount) || adv.requestedAmount;
    const finalTenure = [3, 6, 12].includes(Number(approvedRepaymentPeriod)) ? Number(approvedRepaymentPeriod) : adv.preferredRepaymentPeriod;

    if (finalAmount <= 0) return res.status(400).json({ error: 'Approved amount must be greater than 0.' });

    // Generate complete integer repayment schedule without rounding loss
    const schedule = generateRepaymentSchedule(finalAmount, finalTenure, Number(startYear), startMonth);

    adv.status = 'approved';
    adv.approvedAmount = finalAmount;
    adv.approvedRepaymentPeriod = finalTenure;
    adv.repaymentSchedule = schedule;
    adv.amountRepaid = 0;
    adv.outstandingBalance = finalAmount;
    adv.installmentsPaid = 0;
    adv.totalInstallments = finalTenure;
    adv.approvalDate = new Date().toISOString();
    adv.approvedBy = req.user?.name || 'Director';
    adv.remarks = remarks || 'Approved by Director';

    if (mongoose.connection.readyState === 1) {
      await SalaryAdvance.findOneAndUpdate({ id: adv.id }, adv, { new: true });
    }

    // Sync corresponding approval item
    if (mongoose.connection.readyState === 1) {
      await Approval.findOneAndUpdate(
        { employeeId: adv.employeeId, type: 'Salary Advance', status: { $in: ['pending', 'pending_admin', 'pending_hr'] } },
        { status: 'approved', adminApprovedBy: req.user?.name || 'Director', adminApprovedAt: new Date().toISOString() }
      );
    }

    const appItem = memApprovals.find(a => a.employeeId === adv.employeeId && a.type === 'Salary Advance' && a.status.startsWith('pending'));
    if (appItem) {
      appItem.status = 'approved';
      appItem.adminApprovedBy = req.user?.name || 'Director';
      appItem.adminApprovedAt = new Date().toISOString();
    }
    saveDiskStore();

    // Create notifications
    await createNotification({
      targetRole: 'Employee',
      recipientEmail: adv.employeeEmail,
      title: 'Salary Advance Approved ✅',
      message: `Your Salary Advance of ₹${finalAmount.toLocaleString('en-IN')} (${finalTenure} Months tenure) has been approved! Scheduled monthly deduction: ₹${schedule[0]?.amount.toLocaleString('en-IN')}.`,
      type: 'leave_approval'
    });

    res.json({ message: 'Salary advance approved successfully', advance: adv });
  } catch (err) {
    console.error('Error approving salary advance:', err);
    res.status(500).json({ error: 'Failed to approve salary advance request' });
  }
});

// Reject Salary Advance (Admin/Director Only)
app.post('/api/salary-advance/:id/reject', authenticateToken, requireRole('Admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { remarks } = req.body;

    let adv = null;
    if (mongoose.connection.readyState === 1) {
      adv = await SalaryAdvance.findOne({ $or: [{ id }, { _id: mongoose.Types.ObjectId.isValid(id) ? id : null }] });
    } else {
      adv = memSalaryAdvances.find(a => a.id === id);
    }
    if (!adv) return res.status(404).json({ error: 'Salary advance request not found' });

    adv.status = 'rejected';
    adv.rejectionReason = remarks || 'Request rejected by Director';
    adv.remarks = remarks || 'Request rejected by Director';

    if (mongoose.connection.readyState === 1) {
      await SalaryAdvance.findOneAndUpdate({ id: adv.id }, adv, { new: true });
    }

    if (mongoose.connection.readyState === 1) {
      await Approval.findOneAndUpdate(
        { employeeId: adv.employeeId, type: 'Salary Advance', status: { $in: ['pending', 'pending_admin', 'pending_hr'] } },
        { status: 'rejected', adminApprovedBy: req.user?.name || 'Director', adminApprovedAt: new Date().toISOString() }
      );
    }

    const appItem = memApprovals.find(a => a.employeeId === adv.employeeId && a.type === 'Salary Advance' && a.status.startsWith('pending'));
    if (appItem) {
      appItem.status = 'rejected';
      appItem.adminApprovedBy = req.user?.name || 'Director';
      appItem.adminApprovedAt = new Date().toISOString();
    }
    saveDiskStore();

    await createNotification({
      targetRole: 'Employee',
      recipientEmail: adv.employeeEmail,
      title: 'Salary Advance Request Rejected ❌',
      message: `Your Salary Advance request was rejected. Remarks: ${remarks || 'Contact HR/Management'}.`,
      type: 'leave_rejection'
    });

    res.json({ message: 'Salary advance request rejected', advance: adv });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reject salary advance request' });
  }
});

// ======================================================
// 6. PAYSLIP GENERATION & PAYROLL
// ======================================================

// Dynamic Auto Payslip Generation based on Employee Profile & Attendance/LWP
app.post('/api/payslips/generate-auto', authenticateToken, requireRole('Admin', 'HR'), async (req, res) => {
  const { employeeId, year = 2026, month = 'May' } = req.body;

  let emp = memEmployees.find(e => e.id === employeeId);
  if (!emp && mongoose.connection.readyState === 1) {
    try { emp = await Employee.findOne({ id: employeeId }); } catch (e) {}
  }
  if (!emp) return res.status(404).json({ error: 'Employee not found' });

  // Get HR Settings
  let lwpBasis = 'basic';
  try {
    if (mongoose.connection.readyState === 1) {
      const s = await HRSettings.findOne({ id: 'HR_SETTINGS_GLOBAL' });
      if (s?.lwpDeductionBasis) lwpBasis = s.lwpDeductionBasis;
    }
  } catch (e) {}

  // Fetch approvals for employee
  let approvals = [];
  try {
    if (mongoose.connection.readyState === 1) {
      approvals = await Approval.find({ employeeId: emp.id });
    } else {
      approvals = memApprovals.filter(a => a.employeeId === emp.id);
    }
  } catch (e) {}

  // Fetch active salary advances for employee
  let salaryAdvances = [];
  try {
    if (mongoose.connection.readyState === 1) {
      salaryAdvances = await SalaryAdvance.find({ employeeId: emp.id, status: 'approved' });
    } else {
      salaryAdvances = memSalaryAdvances.filter(a => a.employeeId === emp.id && a.status === 'approved');
    }
  } catch (e) {}

  const calc = calculateSalaryForEmployee(emp, Number(year), month, lwpBasis, approvals, null, salaryAdvances);

  const payslipId = `PAY-${year}-${String(month).toUpperCase()}-${emp.id}`;
  const newPayslip = {
    id: payslipId,
    employeeId: emp.id,
    employeeName: emp.name,
    employeeEmail: emp.email,
    department: emp.department,
    role: emp.role,
    assignedHrName: emp.assignedHrName || 'HR Manager',
    payPeriod: calc.payPeriod,
    month: calc.month,
    year: calc.year,
    payDate: new Date().toISOString().split('T')[0],
    workingDaysInMonth: calc.workingDaysInMonth,
    attendance: calc.attendance,
    lwpDays: calc.lwpDays,
    lwpDeduction: calc.lwpDeduction,
    station: emp.station || 'KARAMBELI',
    serialNo: `${Math.floor(10000 + Math.random() * 90000)}`,
    baseSalary: calc.baseSalary,
    basic: calc.basic,
    salaryOfAttendance: calc.salaryOfAttendance,
    hra: calc.hra,
    da: calc.da,
    sa: calc.sa,
    conveyance: calc.conveyance,
    otherAllowances: calc.otherAllowances,
    employerPf: calc.employerPf,
    totalCtc: calc.totalCtc,
    employeePf: calc.employeePf,
    esi: calc.esi,
    professionalTax: calc.professionalTax,
    tds: calc.tds,
    advance: calc.salaryAdvanceRecovery,
    salaryAdvanceRecovery: calc.salaryAdvanceRecovery,
    advanceOutstandingBalance: calc.advanceOutstandingBalance,
    incomeTax: calc.tds,
    loan: 0,
    other: 0,
    totalDeductions: calc.totalDeductions,
    grossSalary: calc.grossSalary,
    netPay: calc.netPay,
    amountInWords: `Rupees ${calc.netPay.toLocaleString('en-IN')} Only`,
    disbursementStatus: 'pending_disbursement',
    emailStatus: 'pending'
  };

  try {
    if (mongoose.connection.readyState === 1) {
      await Payslip.findOneAndUpdate({ id: payslipId }, newPayslip, { upsert: true, new: true });
    }
  } catch (e) {}

  const existingIdx = memPayslips.findIndex(p => p.id === payslipId);
  if (existingIdx !== -1) memPayslips[existingIdx] = newPayslip;
  else memPayslips.unshift(newPayslip);
  saveDiskStore();

  sendPayslipEmail(newPayslip, emp.assignedHrEmail || '').catch(err => console.error('Payslip email error:', err));
  await createNotification({ targetRole: 'Employee', recipientEmail: emp.email, title: 'Payslip Issued 📄', message: `Your payslip for ${newPayslip.payPeriod} has been generated. Net Pay: ₹${newPayslip.netPay.toLocaleString('en-IN')}.`, type: 'payslip' });

  res.status(201).json({ message: 'Dynamic payslip generated successfully', payslip: newPayslip });
});

app.post('/api/payslips/generate', authenticateToken, requireRole('Admin', 'HR'), async (req, res) => {
  const { employeeId, payPeriod, workingDaysInMonth, customLwpDays, attendance, esi, advance, incomeTax, loan, other } = req.body;

  let emp = memEmployees.find(e => e.id === employeeId);
  if (!emp && mongoose.connection.readyState === 1) {
    try { emp = await Employee.findOne({ id: employeeId }); } catch (e) {}
  }
  if (!emp) return res.status(404).json({ error: 'Employee not found' });

  const totalDaysInMonth = Number(workingDaysInMonth) || 30;

  // Calculate clocked-in attendance from logs
  let clockedInDays = 0;
  if (emp.recentLogs?.length > 0) {
    const uniqueDates = new Set();
    emp.recentLogs.forEach(l => {
      if (l.type === 'clock_punch' && (l.date || l.clockInTimestamp)) {
        const d = l.date || (l.clockInTimestamp ? new Date(l.clockInTimestamp).toISOString().split('T')[0] : null);
        if (d) uniqueDates.add(d);
      }
    });
    clockedInDays = uniqueDates.size;
  }

  const actualAttendance = (attendance !== undefined && attendance !== null && attendance !== '') ? Number(attendance) : (clockedInDays > 0 ? clockedInDays : totalDaysInMonth);
  const lwpDays = customLwpDays !== undefined && customLwpDays !== null && customLwpDays !== '' ? Number(customLwpDays) : Math.max(0, totalDaysInMonth - actualAttendance);

  const struct = emp.salaryStructure || { basic: 0, hra: 0, da: 0, sa: 0, employerPf: 0, employeePf: 0 };
  const basic = Number(struct.basic) || 0;
  const hra = Number(struct.hra) || 0;
  const da = Number(struct.da) || 0;
  const sa = Number(struct.sa) || 0;
  const employerPf = Number(struct.employerPf) || 0;
  const employeePf = Number(struct.employeePf) || 0;

  const perDayBasic = totalDaysInMonth > 0 ? Math.round((basic / totalDaysInMonth) * 100) / 100 : 0;
  const lwpDeduction = Math.round(perDayBasic * lwpDays * 100) / 100;
  const salaryOfAttendance = basic - lwpDeduction;
  const grossSalary = salaryOfAttendance + hra + da + sa;

  const esiNum = Number(esi) || 0;
  const advanceNum = Number(advance) || 0;
  const incomeTaxNum = Number(incomeTax) || 0;
  const loanNum = Number(loan) || 0;
  const otherNum = Number(other) || 0;
  const totalDeductions = employeePf + esiNum + advanceNum + incomeTaxNum + loanNum + otherNum;
  const netPay = grossSalary - totalDeductions;

  const newPayslip = {
    id: `PAY-${Date.now().toString(36).toUpperCase()}`,
    employeeId: emp.id, employeeName: emp.name, employeeEmail: emp.email,
    department: emp.department, role: emp.role, station: emp.station || '',
    assignedHrName: emp.assignedHrName || '',
    payPeriod: payPeriod || '', payDate: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
    workingDaysInMonth: totalDaysInMonth, attendance: actualAttendance,
    basic, salaryOfAttendance, hra, da, sa, employerPf, employeePf,
    esi: esiNum, advance: advanceNum, incomeTax: incomeTaxNum, loan: loanNum, other: otherNum,
    lwpDays, totalDeductions, grossSalary, netPay,
    disbursementStatus: 'unpaid', emailStatus: 'pending', createdAt: new Date()
  };

  try { if (mongoose.connection.readyState === 1) await Payslip.create(newPayslip); } catch (e) {}
  memPayslips.unshift(newPayslip);
  saveDiskStore();

  sendPayslipEmail(newPayslip, emp.assignedHrEmail || '').catch(err => console.error('Payslip email error:', err));
  await createNotification({ targetRole: 'Employee', recipientEmail: emp.email, title: 'New Payslip Available', message: `Your payslip for ${newPayslip.payPeriod} has been generated. Net Pay: ₹${netPay.toLocaleString('en-IN')}.`, type: 'payslip' });
  await createNotification({ targetRole: 'HR', recipientId: emp.assignedHrId, title: 'Payslip Dispatched', message: `Payslip for ${emp.name} (${newPayslip.payPeriod}) generated.`, type: 'payslip' });
  await createNotification({ targetRole: 'Admin', title: 'Payroll Dispatched', message: `Payslip for ${emp.name}. Net Pay: ₹${netPay.toLocaleString('en-IN')}.`, type: 'payslip' });

  res.status(201).json({ message: 'Payslip generated and sent', payslip: newPayslip });
});

// Get payslips for employee
app.get('/api/payslips/employee/:employeeId', authenticateToken, async (req, res) => {
  const { employeeId } = req.params;
  try {
    if (mongoose.connection.readyState === 1) {
      const list = await Payslip.find({ employeeId }).sort({ createdAt: -1 });
      if (list.length > 0) return res.json(list);
    }
  } catch (e) {}
  res.json(memPayslips.filter(p => p.employeeId === employeeId));
});

// Get all payslips (Admin/HR)
app.get('/api/payslips', authenticateToken, async (req, res) => {
  const { employeeId } = req.query;
  try {
    if (mongoose.connection.readyState === 1) {
      const query = employeeId ? { $or: [{ employeeId }, { employeeEmail: employeeId }] } : {};
      return res.json(await Payslip.find(query).sort({ createdAt: -1 }));
    }
  } catch (e) {}
  let list = [...memPayslips];
  if (employeeId) list = list.filter(p => p.employeeId === employeeId || p.employeeEmail === employeeId);
  res.json(list);
});

// Mark Payslip as Paid
app.post('/api/payslips/:id/mark-paid', authenticateToken, requireRole('Admin', 'HR'), async (req, res) => {
  const { id } = req.params;
  const { delayHours = 4.5, immediate = false } = req.body;
  const now = new Date();
  const delayMs = immediate ? 0 : (Number(delayHours) || 4.5) * 3600 * 1000;
  const scheduledTime = new Date(now.getTime() + delayMs);

  let updatedPayslip = null;
  try {
    if (mongoose.connection.readyState === 1) {
      updatedPayslip = await Payslip.findOneAndUpdate(
        { $or: [{ id }, { _id: mongoose.Types.ObjectId.isValid(id) ? id : null }] },
        { disbursementStatus: immediate ? 'dispatched' : 'paid_pending_dispatch', markedPaidAt: now, scheduledDispatchTime: scheduledTime, emailStatus: immediate ? 'sent' : 'scheduled', sentAt: immediate ? now : null },
        { new: true }
      );
    }
  } catch (e) {}

  if (!updatedPayslip) {
    const slip = memPayslips.find(p => p.id === id);
    if (slip) {
      slip.disbursementStatus = immediate ? 'dispatched' : 'paid_pending_dispatch';
      slip.markedPaidAt = now; slip.scheduledDispatchTime = scheduledTime;
      slip.emailStatus = immediate ? 'sent' : 'scheduled';
      if (immediate) slip.sentAt = now;
      updatedPayslip = slip;
      saveDiskStore();
    }
  }

  if (!updatedPayslip) return res.status(404).json({ error: 'Payslip not found' });
  if (immediate) sendDelayedPayslipDisbursementEmail(updatedPayslip).catch(e => console.error('Payslip email error:', e));

  // Handle Salary Advance Repayment Settlement
  if (updatedPayslip && (updatedPayslip.advance > 0 || updatedPayslip.salaryAdvanceRecovery > 0)) {
    try {
      let adv = null;
      if (mongoose.connection.readyState === 1) {
        adv = await SalaryAdvance.findOne({
          $or: [{ employeeId: updatedPayslip.employeeId }, { employeeEmail: updatedPayslip.employeeEmail }],
          status: 'approved',
          outstandingBalance: { $gt: 0 }
        });
      } else {
        adv = memSalaryAdvances.find(a =>
          (a.employeeId === updatedPayslip.employeeId || a.employeeEmail === updatedPayslip.employeeEmail) &&
          a.status === 'approved' && a.outstandingBalance > 0
        );
      }

      if (adv && adv.repaymentSchedule?.length > 0) {
        // Find pending installment matching this pay period or first pending
        const inst = adv.repaymentSchedule.find(s => s.payPeriod === updatedPayslip.payPeriod && s.status === 'pending') ||
                     adv.repaymentSchedule.find(s => s.status === 'pending');

        if (inst && inst.status !== 'paid') {
          inst.status = 'paid';
          inst.paidAt = new Date();
          inst.payslipId = updatedPayslip.id;

          adv.amountRepaid = (adv.amountRepaid || 0) + inst.amount;
          adv.outstandingBalance = Math.max(0, adv.approvedAmount - adv.amountRepaid);
          adv.installmentsPaid = (adv.installmentsPaid || 0) + 1;

          if (adv.outstandingBalance === 0 || adv.installmentsPaid >= adv.totalInstallments) {
            adv.status = 'completed';
          }

          if (mongoose.connection.readyState === 1) {
            await SalaryAdvance.findOneAndUpdate({ id: adv.id }, adv, { new: true });
          }
          saveDiskStore();
        }
      }
    } catch (err) {
      console.error('Error settling salary advance installment on mark-paid:', err);
    }
  }

  await createNotification({ targetRole: 'HR', title: 'Salary Disbursement Marked 💳', message: immediate ? `Salary for ${updatedPayslip.employeeName} paid & emailed.` : `Salary for ${updatedPayslip.employeeName} marked as paid. Email in ${delayHours}h.`, type: 'payslip' });

  res.json({ message: immediate ? 'Paid and dispatched.' : `Paid. Email in ${delayHours}h.`, payslip: updatedPayslip });
});

// ======================================================
// 7. NOTIFICATIONS
// ======================================================

app.get('/api/notifications', authenticateToken, async (req, res) => {
  const { targetRole, recipientEmail, recipientId } = req.query;
  try {
    if (mongoose.connection.readyState === 1) {
      let query = {};
      if (targetRole) {
        query.$or = [{ targetRole }, { targetRole: 'All' }, ...(recipientEmail ? [{ recipientEmail }] : []), ...(recipientId ? [{ recipientId }] : [])];
      }
      return res.json(await Notification.find(query).sort({ createdAt: -1 }).limit(100));
    }
  } catch (e) {}
  let list = [...memNotifications];
  if (targetRole) list = list.filter(n => n.targetRole === targetRole || n.targetRole === 'All' || (recipientEmail && n.recipientEmail === recipientEmail) || (recipientId && n.recipientId === recipientId));
  res.json(list.slice(0, 100));
});

app.patch('/api/notifications/:id/read', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    if (mongoose.connection.readyState === 1) {
      const updated = await Notification.findOneAndUpdate({ id }, { read: true }, { new: true });
      if (updated) return res.json(updated);
    }
  } catch (e) {}
  const n = memNotifications.find(x => x.id === id);
  if (n) { n.read = true; return res.json(n); }
  res.status(404).json({ error: 'Notification not found' });
});

// ======================================================
// 8. HOLIDAYS (HR manages, all can view)
// ======================================================

app.get('/api/holidays', authenticateToken, async (req, res) => {
  const { year } = req.query;
  try {
    if (mongoose.connection.readyState === 1) {
      const query = year ? { year: Number(year) } : {};
      return res.json(await Holiday.find(query).sort({ date: 1 }));
    }
  } catch (e) {}
  let list = [...memHolidays];
  if (year) list = list.filter(h => h.year === Number(year));
  res.json(list.sort((a, b) => new Date(a.date) - new Date(b.date)));
});

app.post('/api/holidays', authenticateToken, requireRole('Admin', 'HR'), async (req, res) => {
  const { name, date, type, description } = req.body;
  if (!name || !date) return res.status(400).json({ error: 'Name and date are required' });

  const holidayDate = new Date(date);
  const holiday = {
    id: `HOL-${Date.now().toString(36).toUpperCase()}`,
    name: sanitizeString(name), date: holidayDate,
    type: type || 'company', year: holidayDate.getFullYear(),
    description: sanitizeString(description) || '',
    createdBy: req.user.name || ''
  };

  try { if (mongoose.connection.readyState === 1) { await Holiday.create(holiday); return res.status(201).json(holiday); } } catch (e) {}
  memHolidays.push(holiday);
  saveDiskStore();
  res.status(201).json(holiday);
});

app.put('/api/holidays/:id', authenticateToken, requireRole('Admin', 'HR'), async (req, res) => {
  const { id } = req.params;
  const { name, date, type, description } = req.body;
  const updateData = {};
  if (name) updateData.name = sanitizeString(name);
  if (date) { updateData.date = new Date(date); updateData.year = new Date(date).getFullYear(); }
  if (type) updateData.type = type;
  if (description !== undefined) updateData.description = sanitizeString(description);

  try {
    if (mongoose.connection.readyState === 1) {
      const updated = await Holiday.findOneAndUpdate({ id }, updateData, { new: true });
      if (updated) return res.json(updated);
    }
  } catch (e) {}
  const h = memHolidays.find(x => x.id === id);
  if (h) { Object.assign(h, updateData); saveDiskStore(); return res.json(h); }
  res.status(404).json({ error: 'Holiday not found' });
});

app.delete('/api/holidays/:id', authenticateToken, requireRole('Admin', 'HR'), async (req, res) => {
  const { id } = req.params;
  try {
    if (mongoose.connection.readyState === 1) {
      await Holiday.findOneAndDelete({ id });
    }
  } catch (e) {}
  memHolidays = memHolidays.filter(h => h.id !== id);
  saveDiskStore();
  res.json({ message: 'Holiday deleted' });
});

// ======================================================
// 9. HR SETTINGS
// ======================================================

app.get('/api/hr-settings', authenticateToken, requireRole('Admin', 'HR'), async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      let settings = await HRSettings.findOne({ id: 'HR_SETTINGS_GLOBAL' });
      if (!settings) settings = await HRSettings.create({ id: 'HR_SETTINGS_GLOBAL' });
      return res.json(settings);
    }
  } catch (e) {}
  res.json({ id: 'HR_SETTINGS_GLOBAL', payrollWindowStart: 1, payrollWindowEnd: 7, workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] });
});

app.put('/api/hr-settings', authenticateToken, requireRole('Admin', 'HR'), async (req, res) => {
  const updateData = { ...req.body, updatedBy: req.user.name || '' };
  delete updateData.id;
  try {
    if (mongoose.connection.readyState === 1) {
      const updated = await HRSettings.findOneAndUpdate({ id: 'HR_SETTINGS_GLOBAL' }, updateData, { new: true, upsert: true });
      return res.json(updated);
    }
  } catch (e) {}
  res.json({ id: 'HR_SETTINGS_GLOBAL', ...updateData });
});

// ======================================================
// 9.5 PROJECTS & LOCATION MANAGEMENT
// ======================================================

app.get('/api/projects', authenticateToken, async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const projects = await Project.find().sort({ createdAt: -1 });
      return res.json(projects);
    }
  } catch (e) {
    console.error('Error fetching projects:', e);
  }
  res.json([]);
});

app.post('/api/projects', authenticateToken, requireRole('Admin', 'HR'), async (req, res) => {
  try {
    const { name, latitude, longitude, geofenceRadius, address, description, assignedEmployeeIds } = req.body;
    if (!name || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Project name, latitude, and longitude are required.' });
    }

    const projectId = `PROJ-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newProject = new Project({
      id: projectId,
      name: sanitizeString(name),
      latitude: Number(latitude),
      longitude: Number(longitude),
      geofenceRadius: Number(geofenceRadius) || 50,
      address: sanitizeString(address || ''),
      description: sanitizeString(description || ''),
      assignedEmployeeIds: Array.isArray(assignedEmployeeIds) ? assignedEmployeeIds : [],
      createdBy: req.user.name || req.user.id || 'HR/Director'
    });

    await newProject.save();

    // Sync location and project fields to assigned employees
    if (Array.isArray(assignedEmployeeIds) && assignedEmployeeIds.length > 0) {
      await Employee.updateMany(
        { id: { $in: assignedEmployeeIds } },
        {
          $set: {
            assignedProjectId: projectId,
            assignedProjectName: name,
            assignedLocation: {
              latitude: Number(latitude),
              longitude: Number(longitude),
              address: address || name,
              geofenceRadius: Number(geofenceRadius) || 50
            }
          }
        }
      );
    }

    return res.status(201).json(newProject);
  } catch (e) {
    console.error('Error creating project:', e);
    return res.status(500).json({ error: e.message || 'Failed to create project' });
  }
});

app.put('/api/projects/:id', authenticateToken, requireRole('Admin', 'HR'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, latitude, longitude, geofenceRadius, address, description, assignedEmployeeIds } = req.body;

    const project = await Project.findOne({ id });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (name) project.name = sanitizeString(name);
    if (latitude !== undefined) project.latitude = Number(latitude);
    if (longitude !== undefined) project.longitude = Number(longitude);
    if (geofenceRadius !== undefined) project.geofenceRadius = Number(geofenceRadius);
    if (address !== undefined) project.address = sanitizeString(address);
    if (description !== undefined) project.description = sanitizeString(description);

    const prevAssigned = project.assignedEmployeeIds || [];
    const newAssigned = Array.isArray(assignedEmployeeIds) ? assignedEmployeeIds : prevAssigned;
    project.assignedEmployeeIds = newAssigned;

    await project.save();

    // Employees removed from project
    const unassigned = prevAssigned.filter(empId => !newAssigned.includes(empId));
    if (unassigned.length > 0) {
      await Employee.updateMany(
        { id: { $in: unassigned }, assignedProjectId: id },
        { $unset: { assignedProjectId: '', assignedProjectName: '', assignedLocation: '' } }
      );
    }

    // Employees newly or still assigned
    if (newAssigned.length > 0) {
      await Employee.updateMany(
        { id: { $in: newAssigned } },
        {
          $set: {
            assignedProjectId: id,
            assignedProjectName: project.name,
            assignedLocation: {
              latitude: project.latitude,
              longitude: project.longitude,
              address: project.address || project.name,
              geofenceRadius: project.geofenceRadius
            }
          }
        }
      );
    }

    return res.json(project);
  } catch (e) {
    console.error('Error updating project:', e);
    return res.status(500).json({ error: e.message || 'Failed to update project' });
  }
});

app.delete('/api/projects/:id', authenticateToken, requireRole('Admin', 'HR'), async (req, res) => {
  try {
    const { id } = req.params;
    const project = await Project.findOneAndDelete({ id });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Clear assignment from employees
    await Employee.updateMany(
      { assignedProjectId: id },
      { $unset: { assignedProjectId: '', assignedProjectName: '', assignedLocation: '' } }
    );

    return res.json({ message: 'Project deleted successfully' });
  } catch (e) {
    console.error('Error deleting project:', e);
    return res.status(500).json({ error: e.message || 'Failed to delete project' });
  }
});

// ======================================================
// 10. ANNOUNCEMENTS & BANK DETAILS
// ======================================================

app.get('/api/announcements', authenticateToken, async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) return res.json(await Announcement.find().sort({ createdAt: -1 }));
  } catch (e) {}
  res.json(memAnnouncements);
});

app.get('/api/bank-details', authenticateToken, async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const bank = await BankDetails.findOne();
      if (bank) return res.json(bank);
    }
  } catch (e) {}
  res.json(INITIAL_BANK_DETAILS);
});

// ======================================================
// 11. DELAYED PAYSLIP DISPATCH WORKER (every 60s)
// ======================================================

setInterval(async () => {
  try {
    const now = new Date();
    if (mongoose.connection.readyState === 1) {
      const pending = await Payslip.find({ disbursementStatus: 'paid_pending_dispatch', scheduledDispatchTime: { $lte: now } });
      for (const slip of pending) {
        slip.disbursementStatus = 'dispatched'; slip.emailStatus = 'sent'; slip.dispatchedAt = now; slip.sentAt = now;
        await slip.save();
        sendDelayedPayslipDisbursementEmail(slip).catch(err => console.error('Delayed email error:', err));
        try { await Notification.create({ id: `NOTIF-${Date.now()}`, title: 'Salary Statement Disbursed 📑', message: `Your salary statement for ${slip.payPeriod} has been emailed.`, targetRole: 'Employee', recipientEmail: slip.employeeEmail, recipientId: slip.employeeId, createdAt: now.toISOString(), read: false }); } catch (e) {}
      }
    }

    const pendingMem = memPayslips.filter(p => p.disbursementStatus === 'paid_pending_dispatch' && p.scheduledDispatchTime && new Date(p.scheduledDispatchTime) <= now);
    for (const slip of pendingMem) {
      slip.disbursementStatus = 'dispatched'; slip.emailStatus = 'sent'; slip.dispatchedAt = now; slip.sentAt = now;
      sendDelayedPayslipDisbursementEmail(slip).catch(err => console.error('Delayed email error:', err));
      memNotifications.unshift({ id: `NOTIF-${Date.now()}`, title: 'Salary Statement Disbursed 📑', message: `Your salary statement for ${slip.payPeriod} has been emailed.`, targetRole: 'Employee', recipientEmail: slip.employeeEmail, recipientId: slip.employeeId, createdAt: now.toISOString(), read: false });
    }
    if (pendingMem.length > 0) saveDiskStore();
  } catch (e) {
    console.error('Delayed payslip worker error:', e.message);
  }
}, 60 * 1000);

// ── START SERVER ──
const server = app.listen(PORT, () => {
  console.log(`🚀 JRKC HR Portal API listening on http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use by another process!`);
  } else {
    console.error(`❌ Server error:`, err);
  }
});
