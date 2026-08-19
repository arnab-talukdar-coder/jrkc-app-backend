import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import crypto from 'crypto';

process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection:', reason);
});

if (!globalThis.crypto) {
  globalThis.crypto = crypto;
}

// Resolve .env from project root (one directory up from src/)
const __srvFilename = fileURLToPath(import.meta.url);
const __srvDirname = dirname(__srvFilename);
const envPath = resolve(__srvDirname, '..', '.env');
dotenv.config({ path: envPath });

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
if (!process.env.JWT_SECRET) {
  console.warn('⚠️  WARNING: JWT_SECRET is not set in environment. Using insecure default. Set JWT_SECRET in .env before going to production.');
}

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
  sendDelayedPayslipDisbursementEmail,
  sendPasswordResetEmail,
  sendExpoPushNotification
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
import { generateNextEmployeeId } from './utils/idGenerator.js';
import attendanceRoutes from './routes/attendanceRoutes.js';
import authRoutes from './routes/authRoutes.js';
import employeeRoutes from './routes/employeeRoutes.js';
import hrEmployeeRoutes from './routes/hrEmployeeRoutes.js';
import approvalRoutes from './routes/approvalRoutes.js';
import hrSettingsRoutes from './routes/hrSettingsRoutes.js';
import salaryAdvanceRoutes from './routes/salaryAdvanceRoutes.js';
import payslipRoutes from './routes/payslipRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import holidayRoutes from './routes/holidayRoutes.js';
import projectRoutes from './routes/projectRoutes.js';
import miscRoutes from './routes/miscRoutes.js';

const app = express();
app.set('trust proxy', 1);
app.disable('etag');
const PORT = process.env.PORT || 5000;

// ── FAST HEALTH CHECK (Before Middleware & Rate Limiters) ──
app.get(['/', '/health', '/api', '/api/health'], (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'JRKC HR Portal REST API',
    environment: process.env.NODE_ENV || 'development',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'fallback',
    timestamp: new Date()
  });
});

// ── SECURITY MIDDLEWARE ──
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// CORS & No-Cache
app.use(cors({ origin: true, credentials: true }));
app.use((req, res, next) => {
  res.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.header('Pragma', 'no-cache');
  res.header('Expires', '0');
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
import {
  memEmployees, memApprovals, memAnnouncements, memRegistrationRequests,
  memPayslips, memNotifications, memHolidays, memSalaryAdvances, saveDiskStore
} from './data/store.js';

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
      console.log('✅ Database connected successfully.');
    } else {
      console.log('⚡ Operating in fallback mode (MongoDB not connected).');
    }
  } catch (e) {
    console.error('Database initialization error:', e.message);
  }
}

initDatabase();

// ── HELPER FUNCTIONS ──
import { createNotification } from './services/notificationService.js';

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

// Duplicate health check removed — handled at line 76

// ======================================================
// 1. REGISTRATION & AUTH (PUBLIC ROUTES)
// ======================================================

// Mount Auth Routes
app.use('/api/auth', authRoutes);

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
      await Project.updateMany({}, { assignedEmployeeIds: [] });
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

  sendPasswordResetEmail(user, newPassword).catch(err => console.error('Reset password email error:', err));
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
  const newEmpId = await generateNextEmployeeId(memEmployees);

  const newEmp = {
    id: newEmpId,
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
    idCardNo: newEmpId,
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

// Mount Employee Routes
app.use('/api/employees', employeeRoutes);
app.use('/api/hr/employees', hrEmployeeRoutes);

// Mount Attendance Routes
app.use('/api/attendance', attendanceRoutes);

// Mount Approval & Leave Routes
app.use('/api/approvals', approvalRoutes);

// Mount HR Settings Routes
app.use('/api/hr/settings', hrSettingsRoutes);

// Mount Salary Advance Routes
app.use('/api/salary-advance', salaryAdvanceRoutes);

// Mount Payslip Routes
app.use('/api/payslips', payslipRoutes);

// Mount Notification Routes
app.use('/api/notifications', notificationRoutes);

// Mount Holiday Routes
app.use('/api/holidays', holidayRoutes);

// Mount Project Routes
app.use('/api/projects', projectRoutes);

// Mount Misc Routes (Announcements, Bank Details, HR Settings Alias)
app.use('/api', miscRoutes);

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
