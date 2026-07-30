import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

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

const app = express();
const PORT = process.env.PORT || 5000;

// ── SECURITY MIDDLEWARE ──
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// CORS
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json({ limit: '5mb' }));

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

// ── IN-MEMORY FALLBACK STORES ──
let memEmployees = [...INITIAL_EMPLOYEES];
let memApprovals = [...INITIAL_APPROVALS];
let memAnnouncements = [...INITIAL_ANNOUNCEMENTS];
let memRegistrationRequests = [...INITIAL_REGISTRATION_REQUESTS];
let memPayslips = [...INITIAL_PAYSLIPS];
let memNotifications = [];
let memHolidays = [];

const STORE_PATH = path.resolve('src/data/db_store.json');

function saveDiskStore() {
  try {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify({
      memEmployees, memRegistrationRequests, memApprovals, memPayslips, memNotifications, memHolidays
    }, null, 2), 'utf-8');
  } catch (err) {
    console.error('Disk store save error:', err.message);
  }
}

function loadDiskStore() {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const data = JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
      if (data.memEmployees?.length > 0) memEmployees = data.memEmployees;
      if (data.memRegistrationRequests) memRegistrationRequests = data.memRegistrationRequests;
      if (data.memApprovals) memApprovals = data.memApprovals;
      if (data.memPayslips) memPayslips = data.memPayslips;
      if (data.memNotifications) memNotifications = data.memNotifications;
      if (data.memHolidays) memHolidays = data.memHolidays;
      console.log(`Loaded ${memEmployees.length} employees from disk store.`);
    }
  } catch (err) {
    console.error('Disk store load error:', err.message);
  }
}

// ── DATABASE INITIALIZATION ──
async function initDatabase() {
  loadDiskStore();
  await connectDB();
  if (mongoose.connection.readyState === 1) {
    try {
      const empCount = await Employee.countDocuments();
      if (empCount === 0 && memEmployees.length > 0) {
        await Employee.insertMany(memEmployees);
      }
      const regCount = await RegistrationRequest.countDocuments();
      if (regCount === 0 && memRegistrationRequests.length > 0) {
        await RegistrationRequest.insertMany(memRegistrationRequests);
      }
      const annCount = await Announcement.countDocuments();
      if (annCount === 0 && memAnnouncements.length > 0) {
        await Announcement.insertMany(memAnnouncements);
      }
      const bankCount = await BankDetails.countDocuments();
      if (bankCount === 0) {
        await BankDetails.create(INITIAL_BANK_DETAILS);
      }
      // Ensure global HR settings exist
      const settingsCount = await HRSettings.countDocuments();
      if (settingsCount === 0) {
        await HRSettings.create({ id: 'HR_SETTINGS_GLOBAL' });
      }
      console.log('MongoDB initialization complete.');
    } catch (e) {
      console.error('Database seeding error:', e.message);
    }
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
    if (mongoose.connection.readyState === 1) {
      return await Notification.create(newNotif);
    }
  } catch (e) { console.error('Notification create error:', e.message); }
  memNotifications.unshift(newNotif);
  return newNotif;
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

  // Check if email already registered
  let existing = null;
  try {
    if (mongoose.connection.readyState === 1) {
      existing = await Employee.findOne({ email: email.toLowerCase().trim() });
    }
  } catch (e) {}
  if (!existing) existing = memEmployees.find(e => e.email?.toLowerCase() === email.toLowerCase().trim());
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
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
  res.status(201).json({ message: 'Admin account registered successfully', token, user: newAdmin });
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
    }
  }

  // Check registration request password as fallback
  if (!passwordMatch) {
    let regReq = null;
    try { if (mongoose.connection.readyState === 1) regReq = await RegistrationRequest.findOne({ email: user.email?.toLowerCase().trim() }); } catch (e) {}
    if (!regReq) regReq = memRegistrationRequests.find(r => r.email?.toLowerCase() === user.email?.toLowerCase().trim());
    if (regReq?.password) {
      if (regReq.password.startsWith('$2b$') || regReq.password.startsWith('$2a$')) {
        passwordMatch = await bcrypt.compare(password, regReq.password);
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
  try { if (mongoose.connection.readyState === 1) regItem = await RegistrationRequest.findOne({ id }); } catch (e) {}
  if (!regItem) regItem = memRegistrationRequests.find(r => r.id === id);
  if (!regItem) return res.status(404).json({ error: 'Registration request not found' });

  regItem.status = 'approved';

  let hrObj = memEmployees.find(e => e.id === (assignedHrId || regItem.assignedHrId) && e.userRole === 'HR');
  if (!hrObj) hrObj = memEmployees.find(e => e.userRole === 'HR');
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
    salaryStructure: salaryStructure || { basic: 0, hra: 0, da: 0, sa: 0, employerPf: 0, employeePf: 0 },
    recentLogs: []
  };

  try {
    if (mongoose.connection.readyState === 1) {
      await RegistrationRequest.findOneAndUpdate({ id }, { status: 'approved' });
      await Employee.create(newEmp);
    }
  } catch (e) { console.error('Approve registration error:', e.message); }

  const index = memRegistrationRequests.findIndex(r => r.id === id);
  if (index !== -1) memRegistrationRequests[index].status = 'approved';
  memEmployees.unshift(newEmp);
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
  const { department, search, hrId, userRole } = req.query;
  try {
    if (mongoose.connection.readyState === 1) {
      let query = {};
      if (department && department !== 'All') query.department = new RegExp(`^${department}$`, 'i');
      if (hrId) query.assignedHrId = hrId;
      if (userRole) query.userRole = userRole;
      if (search) {
        const q = search.toString();
        query.$or = [{ name: new RegExp(q, 'i') }, { role: new RegExp(q, 'i') }, { email: new RegExp(q, 'i') }];
      }
      return res.json(await Employee.find(query).sort({ createdAt: -1 }));
    }
  } catch (e) {}

  let result = [...memEmployees];
  if (department && department !== 'All') result = result.filter(e => e.department?.toLowerCase() === department.toString().toLowerCase());
  if (hrId) result = result.filter(e => e.assignedHrId === hrId);
  if (userRole) result = result.filter(e => e.userRole === userRole);
  if (search) {
    const q = search.toString().toLowerCase();
    result = result.filter(e => e.name?.toLowerCase().includes(q) || e.role?.toLowerCase().includes(q) || e.email?.toLowerCase().includes(q));
  }
  res.json(result);
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

// Clock In — with GPS geofence validation and duplicate prevention
app.post('/api/attendance/clock-in', authenticateToken, async (req, res) => {
  const { employeeId, email, latitude, longitude, deviceInfo } = req.body;
  const now = new Date();
  const dateStr = getTodayDateStr();
  const todayISO = getTodayISO();
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });

  // Find employee
  let emp = null;
  try { if (mongoose.connection.readyState === 1) emp = await Employee.findOne({ $or: [{ id: employeeId }, { email: email ? email.toLowerCase().trim() : '' }] }); } catch (e) {}
  if (!emp) emp = memEmployees.find(e => e.id === employeeId || (email && e.email?.toLowerCase() === email?.toLowerCase()));
  if (!emp) return res.status(404).json({ error: 'Employee not found' });

  // Check if already clocked in today (duplicate prevention)
  if (emp.status === 'Clocked In') {
    return res.status(400).json({ error: 'You are already clocked in. Please clock out first.' });
  }
  const alreadyClockedToday = emp.recentLogs?.some(l => {
    if (!l.clockInTimestamp) return false;
    return l.clockInTimestamp.startsWith(todayISO) && l.status === 'Active';
  });
  if (alreadyClockedToday) {
    return res.status(400).json({ error: 'You already have an active clock-in session today.' });
  }

  // GPS Geofence validation
  if (emp.assignedLocation && emp.assignedLocation.latitude && emp.assignedLocation.longitude) {
    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'GPS location is required for attendance. Please enable location services.' });
    }
    const distance = haversineDistance(latitude, longitude, emp.assignedLocation.latitude, emp.assignedLocation.longitude);
    const radius = emp.assignedLocation.geofenceRadius || 50;
    if (distance > radius) {
      return res.status(403).json({
        error: `You are ${Math.round(distance)}m from your work location. You must be within ${radius}m to clock in.`,
        distance: Math.round(distance), radius
      });
    }
  }

  // Check if Sunday
  if (now.getDay() === 0) {
    return res.status(400).json({ error: 'Sunday is a non-working day. Attendance cannot be recorded.' });
  }

  const logEntry = {
    id: `ATT-${Date.now().toString(36).toUpperCase()}`,
    type: 'clock_punch', date: dateStr, clockInTime: timeStr,
    clockInTimestamp: now.toISOString(), clockOutTime: null, clockOutTimestamp: null,
    hours: `${timeStr} - Active`, duration: 'Active Session', status: 'Active',
    clockInLatitude: latitude || null, clockInLongitude: longitude || null,
    deviceInfo: deviceInfo || '', createdAt: now.toISOString()
  };

  try {
    if (mongoose.connection.readyState === 1) {
      const updated = await Employee.findOneAndUpdate(
        { $or: [{ id: emp.id }, { email: emp.email }] },
        { $set: { status: 'Clocked In', clockInTimestamp: now.toISOString(), clockOutTimestamp: null }, $push: { recentLogs: { $each: [logEntry], $position: 0 } } },
        { new: true }
      );
      if (updated) return res.json({ message: 'Clocked in successfully', employee: updated, log: logEntry });
    }
  } catch (e) {}

  emp.status = 'Clocked In'; emp.clockInTimestamp = now.toISOString(); emp.clockOutTimestamp = null;
  if (!emp.recentLogs) emp.recentLogs = [];
  emp.recentLogs.unshift(logEntry);
  saveDiskStore();
  res.json({ message: 'Clocked in successfully', employee: emp, log: logEntry });
});

// Clock Out — with GPS geofence validation and duplicate prevention
app.post('/api/attendance/clock-out', authenticateToken, async (req, res) => {
  const { employeeId, email, latitude, longitude } = req.body;
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });

  let emp = null;
  try { if (mongoose.connection.readyState === 1) emp = await Employee.findOne({ $or: [{ id: employeeId }, { email: email ? email.toLowerCase().trim() : '' }] }); } catch (e) {}
  if (!emp) emp = memEmployees.find(e => e.id === employeeId || (email && e.email?.toLowerCase() === email?.toLowerCase()));
  if (!emp) return res.status(404).json({ error: 'Employee not found' });

  // Duplicate prevention
  if (emp.status !== 'Clocked In') {
    return res.status(400).json({ error: 'You are not clocked in. Please clock in first.' });
  }

  // GPS Geofence validation
  if (emp.assignedLocation && emp.assignedLocation.latitude && emp.assignedLocation.longitude) {
    if (latitude !== undefined && longitude !== undefined) {
      const distance = haversineDistance(latitude, longitude, emp.assignedLocation.latitude, emp.assignedLocation.longitude);
      const radius = emp.assignedLocation.geofenceRadius || 50;
      if (distance > radius) {
        return res.status(403).json({
          error: `You are ${Math.round(distance)}m from your work location. You must be within ${radius}m to clock out.`,
          distance: Math.round(distance), radius
        });
      }
    }
  }

  // Update active log
  const updateLog = (logs) => {
    const activeLog = logs?.find(l => l.status === 'Active' || !l.clockOutTime);
    if (activeLog) {
      const duration = computeDuration(activeLog.clockInTimestamp, now);
      activeLog.clockOutTime = timeStr;
      activeLog.clockOutTimestamp = now.toISOString();
      activeLog.hours = `${activeLog.clockInTime || timeStr} - ${timeStr}`;
      activeLog.duration = duration;
      activeLog.status = 'Completed';
      activeLog.clockOutLatitude = latitude || null;
      activeLog.clockOutLongitude = longitude || null;
    }
  };

  try {
    if (mongoose.connection.readyState === 1) {
      updateLog(emp.recentLogs);
      emp.status = 'Clocked Out'; emp.clockOutTimestamp = now.toISOString();
      await emp.save();
      return res.json({ message: 'Clocked out successfully', employee: emp });
    }
  } catch (e) {}

  updateLog(emp.recentLogs);
  emp.status = 'Clocked Out'; emp.clockOutTimestamp = now.toISOString();
  saveDiskStore();
  res.json({ message: 'Clocked out successfully', employee: emp });
});

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

// HR changes leave quota
app.put('/api/hr/employees/:id/leave-quota', authenticateToken, requireRole('Admin', 'HR'), async (req, res) => {
  const { id } = req.params;
  const { ptoDays, sickDays, casualDays, baseSalary } = req.body;
  const updateData = {};
  if (ptoDays !== undefined) updateData.ptoDays = Number(ptoDays);
  if (sickDays !== undefined) updateData.sickDays = Number(sickDays);
  if (casualDays !== undefined) updateData.casualDays = Number(casualDays);
  if (baseSalary !== undefined) updateData.baseSalary = Number(baseSalary);

  try {
    if (mongoose.connection.readyState === 1) {
      const updated = await Employee.findOneAndUpdate({ id }, updateData, { new: true });
      if (updated) {
        await createNotification({ targetRole: 'Employee', recipientId: id, title: 'Leave Quota Updated', message: `Your HR updated your leave quota.`, type: 'quota_update' });
        return res.json(updated);
      }
    }
  } catch (e) {}
  const emp = memEmployees.find(e => e.id === id);
  if (emp) {
    Object.assign(emp, updateData);
    saveDiskStore();
    await createNotification({ targetRole: 'Employee', recipientId: id, title: 'Leave Quota Updated', message: `Your HR updated your leave quota.`, type: 'quota_update' });
    return res.json(emp);
  }
  res.status(404).json({ error: 'Employee not found' });
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

// Approve/Reject Leave (2-step: HR → Admin)
app.patch('/api/approvals/:id', authenticateToken, requireRole('Admin', 'HR'), async (req, res) => {
  const { id } = req.params;
  const { status, action, userRole, approverName } = req.body;

  let item = null;
  try { if (mongoose.connection.readyState === 1) item = await Approval.findOne({ id }); } catch (e) {}
  if (!item) item = memApprovals.find(a => a.id === id);
  if (!item) return res.status(404).json({ error: 'Approval request not found' });

  let nextStatus = status;

  // Multi-stage status transition
  if (item.type === 'Profile Picture Approval' || item.type === 'Photo Change') {
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

  // Update employee leave balance on final approval
  let emp = memEmployees.find(e => e.id === item.employeeId || e.name === item.employeeName);

  if (nextStatus === 'approved' && emp) {
    if (item.type === 'Profile Picture Approval' || item.type === 'Photo Change') {
      const photoToApply = item.newAvatarUrl || item.subDetails;
      if (photoToApply) { emp.avatar = photoToApply; emp.pendingAvatar = null; emp.photoStatus = 'approved'; }
    } else if (item.isLwp || item.type?.includes('LWP')) {
      emp.lwpDaysTaken = (emp.lwpDaysTaken || 0) + (item.totalDays || 0);
    } else if (item.type?.includes('Casual')) {
      emp.casualDaysTaken = (emp.casualDaysTaken || 0) + (item.totalDays || 0);
    } else if (item.type?.includes('Sick')) {
      emp.sickDaysTaken = (emp.sickDaysTaken || 0) + (item.totalDays || 0);
    } else if (item.type?.includes('Annual') || item.type?.includes('Earned') || item.type?.includes('PTO')) {
      emp.ptoDaysTaken = (emp.ptoDaysTaken || 0) + (item.totalDays || 0);
    }
    saveDiskStore();
  } else if (nextStatus === 'rejected' && emp && (item.type === 'Profile Picture Approval' || item.type === 'Photo Change')) {
    emp.pendingAvatar = null; emp.photoStatus = 'rejected';
  }

  try {
    if (mongoose.connection.readyState === 1) {
      await Approval.findOneAndUpdate({ id }, { status: nextStatus, hrApprovedBy: item.hrApprovedBy, hrApprovedAt: item.hrApprovedAt, adminApprovedBy: item.adminApprovedBy, adminApprovedAt: item.adminApprovedAt });
      if (nextStatus === 'approved' && emp) {
        if (item.type === 'Profile Picture Approval' || item.type === 'Photo Change') {
          await Employee.findOneAndUpdate({ $or: [{ id: emp.id }, { email: emp.email }] }, { avatar: item.newAvatarUrl || item.subDetails, pendingAvatar: null, photoStatus: 'approved' });
        } else {
          await Employee.findOneAndUpdate({ $or: [{ id: emp.id }, { email: emp.email }] }, { lwpDaysTaken: emp.lwpDaysTaken, ptoDaysTaken: emp.ptoDaysTaken, sickDaysTaken: emp.sickDaysTaken, casualDaysTaken: emp.casualDaysTaken });
        }
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
    await createNotification({ targetRole: 'HR', recipientId: item.assignedHrId, title: 'Leave Finalized', message: `${item.employeeName}'s ${item.type} approved by Director.`, type: 'leave_approval' });
  } else if (nextStatus === 'rejected') {
    sendLeaveStatusNotification(item, empEmail).catch(err => console.error('Leave email error:', err));
    await createNotification({ targetRole: 'Employee', recipientEmail: empEmail, title: 'Leave Request Rejected', message: `Your ${item.type} request was rejected.`, type: 'leave_rejection' });
  }

  res.json(item);
});

// ======================================================
// 6. PAYSLIP GENERATION & PAYROLL
// ======================================================

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
app.listen(PORT, () => {
  console.log(`🚀 JRKC HR Portal API listening on http://localhost:${PORT}`);
});
