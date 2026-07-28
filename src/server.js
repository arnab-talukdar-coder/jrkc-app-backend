import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { connectDB } from './config/db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'jrkc-hrms-secret-2026';
import { Employee } from './models/Employee.js';
import { Approval } from './models/Approval.js';
import { Announcement } from './models/Announcement.js';
import { BankDetails } from './models/BankDetails.js';
import { RegistrationRequest } from './models/RegistrationRequest.js';
import { Payslip } from './models/Payslip.js';
import { Notification } from './models/Notification.js';
import {
  sendAdminRegistrationAlert,
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
  INITIAL_BANK_DETAILS,
  INITIAL_TAX_DOCS,
  INITIAL_PAYROLL,
  INITIAL_REGISTRATION_REQUESTS,
  INITIAL_PAYSLIPS
} from './data/initialData.js';

const app = express();
const PORT = process.env.PORT || 5000;
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

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());

// Normalization middleware: Ensures routes match whether Nginx forwards /api prefix or strips it
app.use((req, res, next) => {
  if (!req.url.startsWith('/api') && req.url !== '/' && req.url !== '/health') {
    req.url = '/api' + (req.url.startsWith('/') ? '' : '/') + req.url;
  }
  next();
});

// In-memory fallback stores
let memEmployees = [...INITIAL_EMPLOYEES];
let memApprovals = [...INITIAL_APPROVALS];
let memAnnouncements = [...INITIAL_ANNOUNCEMENTS];
let memBankDetails = { ...INITIAL_BANK_DETAILS };
let memRegistrationRequests = [...INITIAL_REGISTRATION_REQUESTS];
let memPayslips = [...INITIAL_PAYSLIPS];
let memNotifications = [
  {
    id: 'NOTIF-01',
    targetRole: 'Admin',
    title: 'New Registration Request',
    message: 'Daniel Kim requested employee account registration.',
    type: 'registration',
    read: false,
    createdAtDate: new Date().toLocaleString()
  }
];
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

      const regCount = await RegistrationRequest.countDocuments();
      if (regCount === 0) {
        console.log('Seeding initial registration requests into MongoDB...');
        await RegistrationRequest.insertMany(INITIAL_REGISTRATION_REQUESTS);
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

// Health & Root Check Endpoints
app.get(['/', '/health', '/api', '/api/health'], (req, res) => {
  res.json({
    status: 'ok',
    message: 'JRKC HR Portal REST API Backend is running',
    environment: process.env.NODE_ENV || 'development',
    database: mongoose.connection.readyState === 1 ? 'connected (MongoDB)' : 'disconnected (in-memory fallback)',
    timestamp: new Date()
  });
});

// Reset Database Endpoint (Wipes test candidates/approvals and seeds arnab@yopmail.com & hr@yopmail.com)
app.post('/api/admin/reset-database', async (req, res) => {
  memEmployees = [...INITIAL_EMPLOYEES];
  memRegistrationRequests = [];
  memApprovals = [];
  memNotifications = [];
  memPayslips = [];

  try {
    if (mongoose.connection.readyState === 1) {
      await Employee.deleteMany({});
      await Employee.insertMany(INITIAL_EMPLOYEES);
      await RegistrationRequest.deleteMany({});
      await Approval.deleteMany({});
      await Notification.deleteMany({});
      await Payslip.deleteMany({});
    }
  } catch (e) {}

  res.json({
    message: 'Database reset cleanly. Active accounts: arnab@yopmail.com (Admin) and hr@yopmail.com (HR).'
  });
});

// Helper: Push Notification
async function createNotification(notif) {
  const newNotif = {
    id: `NOTIF-${Math.floor(1000 + Math.random() * 9000)}`,
    read: false,
    createdAtDate: new Date().toLocaleString(),
    ...notif
  };

  try {
    if (mongoose.connection.readyState === 1) {
      return await Notification.create(newNotif);
    }
  } catch (e) {}

  memNotifications.unshift(newNotif);
  return newNotif;
}

// ----------------------------------------------------
// 1. REGISTRATION & ADMIN APPROVAL WORKFLOW
// ----------------------------------------------------

// Submit registration request (Candidate/Employee 1st time)
app.post('/api/auth/register', async (req, res) => {
  const { name, email, phone, department, role, requestedUserRole, password, assignedHrId, assignedHrName } = req.body;

  if (!name || !email || !department) {
    return res.status(400).json({ error: 'Name, email, and department are required' });
  }

  let hashedPassword = null;
  if (password) {
    hashedPassword = await bcrypt.hash(password, 10);
  }

  const newReg = {
    id: `REG-${Math.floor(100 + Math.random() * 900)}`,
    name,
    email: email.toLowerCase().trim(),
    phone: phone || '',
    department,
    role: role || 'Employee',
    requestedUserRole: requestedUserRole || 'Employee',
    password: hashedPassword,
    assignedHrId: assignedHrId || 'HR-0010',
    assignedHrName: assignedHrName || 'Sarah Chen',
    status: 'pending_approval',
    agreedToTerms: true,
    termsAcceptedAt: new Date().toISOString(),
    dateSubmitted: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
  };

  try {
    if (mongoose.connection.readyState === 1) {
      const saved = await RegistrationRequest.create(newReg);
      // Email Admin
      sendAdminRegistrationAlert(saved).catch(err => console.error('Email alert error:', err));
      // Notify Admin
      await createNotification({
        targetRole: 'Admin',
        title: 'New Registration Request',
        message: `${name} (${email}) requested account registration for ${department}.`,
        type: 'registration'
      });
      return res.status(201).json(saved);
    }
  } catch (e) {}

  memRegistrationRequests.unshift(newReg);
  sendAdminRegistrationAlert(newReg).catch(err => console.error('Email alert error:', err));
  await createNotification({
    targetRole: 'Admin',
    title: 'New Registration Request',
    message: `${name} (${email}) requested account registration for ${department}.`,
    type: 'registration'
  });

  res.status(201).json(newReg);
});

// ── LOGIN ENDPOINT ──
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  let user = null;

  // Try MongoDB first
  try {
    if (mongoose.connection.readyState === 1) {
      user = await Employee.findOne({ email: email.toLowerCase().trim() });
    }
  } catch (e) {}

  // Fall back to in-memory store
  if (!user) {
    user = memEmployees.find(e => e.email && e.email.toLowerCase() === email.toLowerCase().trim());
  }

  if (!user) {
    return res.status(401).json({ error: 'No account found with this email. Please register first or contact Admin.' });
  }

  if (user.accountStatus !== 'approved') {
    return res.status(403).json({ error: 'Your account is pending Admin approval. You will receive an email once activated.' });
  }

  // Verify password with auto-repair and legacy support
  let passwordMatch = false;
  if (user.password) {
    if (user.password.startsWith('$2b$') || user.password.startsWith('$2a$')) {
      passwordMatch = await bcrypt.compare(password, user.password);
    } else {
      passwordMatch = (user.password === password);
    }
  }

  // Fallback for default seeded accounts or registration request auto-sync
  if (!passwordMatch) {
    if (user.email === 'arnab@yopmail.com' && password === 'Admin@123') passwordMatch = true;
    if (user.email === 'hr@yopmail.com' && password === 'Hrm@123') passwordMatch = true;

    // Check if candidate registered with a password in RegistrationRequest
    if (!passwordMatch) {
      let regReq = null;
      try {
        if (mongoose.connection.readyState === 1) {
          regReq = await RegistrationRequest.findOne({ email: user.email.toLowerCase().trim() });
        }
      } catch (e) {}
      if (!regReq) regReq = memRegistrationRequests.find(r => r.email && r.email.toLowerCase() === user.email.toLowerCase().trim());

      if (regReq && regReq.password) {
        if (regReq.password.startsWith('$2b$') || regReq.password.startsWith('$2a$')) {
          passwordMatch = await bcrypt.compare(password, regReq.password);
        } else {
          passwordMatch = (regReq.password === password);
        }

        if (passwordMatch) {
          user.password = regReq.password;
          try {
            if (mongoose.connection.readyState === 1) {
              await Employee.findOneAndUpdate({ email: user.email.toLowerCase().trim() }, { password: regReq.password });
            }
          } catch (e) {}
        }
      }
    }
  }

  if (!passwordMatch) {
    return res.status(401).json({ error: 'Incorrect password. Please try again.' });
  }

  // Auto-upgrade / repair password hash in MongoDB if needed
  if (!user.password || !user.password.startsWith('$2b$')) {
    user.password = await bcrypt.hash(password, 10);
    try {
      if (mongoose.connection.readyState === 1) {
        await Employee.findOneAndUpdate({ email: user.email }, { password: user.password });
      }
    } catch (e) {}
  }

  // Issue JWT token (Valid for 7 Days)
  const token = jwt.sign(
    { id: user.id, email: user.email, userRole: user.userRole, name: user.name },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    message: 'Login successful',
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      userRole: user.userRole,
      role: user.role,
      department: user.department,
      accountStatus: user.accountStatus,
      avatar: user.avatar,
      ptoDays: user.ptoDays,
      sickDays: user.sickDays
    }
  });
});

// ── CHANGE PASSWORD ENDPOINT ──
app.post('/api/auth/change-password', async (req, res) => {
  const { email, currentPassword, newPassword } = req.body;
  if (!email || !currentPassword || !newPassword) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  let user = null;
  try {
    if (mongoose.connection.readyState === 1) {
      user = await Employee.findOne({ email: email.toLowerCase().trim() });
    }
  } catch (e) {}
  if (!user) user = memEmployees.find(e => e.email && e.email.toLowerCase() === email.toLowerCase().trim());

  if (!user) return res.status(404).json({ error: 'Account not found' });

  const match = user.password ? await bcrypt.compare(currentPassword, user.password) : currentPassword === user._tempPassword;
  if (!match) return res.status(401).json({ error: 'Current password is incorrect' });

  const hashed = await bcrypt.hash(newPassword, 10);
  try {
    if (mongoose.connection.readyState === 1) {
      await Employee.findOneAndUpdate({ email: user.email }, { password: hashed });
    }
  } catch (e) {}
  const idx = memEmployees.findIndex(e => e.email === user.email);
  if (idx !== -1) memEmployees[idx].password = hashed;

  res.json({ message: 'Password changed successfully' });
});

// Register Admin User directly
app.post('/api/auth/register-admin', async (req, res) => {
  const { name, email, phone, department, role, adminSecret, password } = req.body;

  const validSecret = process.env.ADMIN_REGISTRATION_SECRET || 'JRKC-ADMIN-2026';
  if (adminSecret && adminSecret !== validSecret) {
    return res.status(401).json({ error: 'Invalid Admin Security Key' });
  }

  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required for Admin registration' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  // Check if email already registered
  let existing = null;
  try {
    if (mongoose.connection.readyState === 1) existing = await Employee.findOne({ email });
  } catch (e) {}
  if (!existing) existing = memEmployees.find(e => e.email === email);
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists. Please login instead.' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const newAdmin = {
    id: `ADM-${Math.floor(1000 + Math.random() * 9000)}`,
    name,
    email: email.toLowerCase().trim(),
    phone: phone || '',
    department: department || 'Management',
    role: role || 'Admin / Director',
    userRole: 'Admin',
    status: 'Clocked Out',
    accountStatus: 'approved',
    password: hashedPassword,
    ptoDays: 30,
    sickDays: 10,
    lwpDaysTaken: 0,
    joiningDate: new Date().toLocaleDateString('en-IN'),
    baseSalary: 120000,
    allowances: 15000,
    taxDeductions: 10000,
    recentLogs: [],
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=300&q=80'
  };

  try {
    if (mongoose.connection.readyState === 1) {
      await Employee.create(newAdmin);
    }
  } catch (e) {}

  memEmployees.unshift(newAdmin);

  sendEmployeeApprovalEmail(newAdmin, null).catch(err => console.error('Admin welcome email error:', err));

  await createNotification({
    targetRole: 'Admin',
    title: 'New Admin Account Created',
    message: `${newAdmin.name} (${newAdmin.email}) registered as Director/Admin.`,
    type: 'registration'
  });

  // Issue token immediately so they are logged in (Valid for 7 Days)
  const token = jwt.sign(
    { id: newAdmin.id, email: newAdmin.email, userRole: newAdmin.userRole, name: newAdmin.name },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.status(201).json({ message: 'Admin account registered successfully', token, user: newAdmin });
});


// List registration requests for Admin
app.get('/api/admin/registration-requests', async (req, res) => {
  const { status } = req.query;
  try {
    if (mongoose.connection.readyState === 1) {
      let query = {};
      if (status) query.status = status;
      const list = await RegistrationRequest.find(query).sort({ createdAt: -1 });
      return res.json(list);
    }
  } catch (e) {}

  let list = [...memRegistrationRequests];
  if (status) list = list.filter(r => r.status === status);
  res.json(list);
});

// Admin approves registration request
app.post('/api/admin/registration-requests/:id/approve', async (req, res) => {
  const { id } = req.params;
  const { assignedHrId } = req.body;

  let regItem = null;

  try {
    if (mongoose.connection.readyState === 1) {
      regItem = await RegistrationRequest.findOne({ id });
    }
  } catch (e) {}

  if (!regItem) {
    regItem = memRegistrationRequests.find(r => r.id === id);
  }

  if (!regItem) {
    return res.status(404).json({ error: 'Registration request not found' });
  }

  regItem.status = 'approved';

  // Find assigned HR details
  let hrObj = memEmployees.find(e => e.id === (assignedHrId || regItem.assignedHrId) && e.userRole === 'HR');
  if (!hrObj) {
    hrObj = { id: 'HR-0010', name: 'Sarah Chen', email: 'sarah.chen@jrkc.com' };
  }

  // Always generate a secure system password for the approved employee
  const tempPassword = 'JRKC#' + Math.floor(100000 + Math.random() * 900000);
  const userPassword = await bcrypt.hash(tempPassword, 10);

  const newEmp = {
    id: `EMP-${Math.floor(1000 + Math.random() * 9000)}`,
    name: regItem.name,
    email: regItem.email.toLowerCase().trim(),
    phone: regItem.phone,
    department: regItem.department,
    role: regItem.role,
    userRole: regItem.requestedUserRole || 'Employee',
    status: 'Clocked Out',
    accountStatus: 'approved',
    password: userPassword,
    ptoDays: 18, // EL (Earned Leave)
    sickDays: 10, // SL (Sick Leave)
    casualDays: 10, // CL (Casual Leave)
    lwpDaysTaken: 0,
    joiningDate: new Date().toLocaleDateString('en-IN'),
    assignedHrId: hrObj.id,
    assignedHrName: hrObj.name,
    assignedHrEmail: hrObj.email,
    baseSalary: 60000,
    allowances: 5000,
    taxDeductions: 3000,
    recentLogs: [],
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80'
  };

  try {
    if (mongoose.connection.readyState === 1) {
      await RegistrationRequest.findOneAndUpdate({ id }, { status: 'approved' });
      await Employee.create(newEmp);
    }
  } catch (e) {}

  const index = memRegistrationRequests.findIndex(r => r.id === id);
  if (index !== -1) memRegistrationRequests[index].status = 'approved';
  memEmployees.unshift(newEmp);

  // Trigger emails to Employee & Assigned HR (with system generated temp password)
  sendEmployeeApprovalEmail(newEmp, hrObj.email, tempPassword).catch(err => console.error('Welcome email error:', err));

  // Notifications
  await createNotification({
    targetRole: 'Employee',
    recipientEmail: newEmp.email,
    title: 'Account Approved ✅',
    message: `Your registration was approved! Your system-generated password is: ${tempPassword}. Please log in and change your password immediately.`,
    type: 'registration'
  });

  await createNotification({
    targetRole: 'HR',
    recipientId: hrObj.id,
    title: 'New Employee Assigned',
    message: `${newEmp.name} has been approved and assigned to your HR roster.`,
    type: 'registration'
  });

  res.json({ message: 'Registration request approved', employee: newEmp, tempPassword });
});

// Admin rejects registration request
app.post('/api/admin/registration-requests/:id/reject', async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  try {
    if (mongoose.connection.readyState === 1) {
      const updated = await RegistrationRequest.findOneAndUpdate(
        { id },
        { status: 'rejected', rejectionReason: reason || 'Not approved' },
        { new: true }
      );
      if (updated) return res.json(updated);
    }
  } catch (e) {}

  const reg = memRegistrationRequests.find(r => r.id === id);
  if (reg) {
    reg.status = 'rejected';
    reg.rejectionReason = reason || 'Not approved';
    return res.json(reg);
  }
  res.status(404).json({ error: 'Registration request not found' });
});

// ----------------------------------------------------
// 2. HR LEAVE QUOTA & ASSIGNMENT ENDPOINTS
// ----------------------------------------------------

// Get employees list (with filtering for assigned HR or role)
app.get('/api/employees', async (req, res) => {
  const { department, search, hrId, userRole } = req.query;

  try {
    if (mongoose.connection.readyState === 1) {
      let query = {};
      if (department && department !== 'All') {
        query.department = new RegExp(`^${department}$`, 'i');
      }
      if (hrId) query.assignedHrId = hrId;
      if (userRole) query.userRole = userRole;
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
  } catch (e) {}

  let result = [...memEmployees];
  if (department && department !== 'All') {
    result = result.filter(e => e.department.toLowerCase() === department.toString().toLowerCase());
  }
  if (hrId) {
    result = result.filter(e => e.assignedHrId === hrId);
  }
  if (userRole) {
    result = result.filter(e => e.userRole === userRole);
  }
  if (search) {
    const q = search.toString().toLowerCase();
    result = result.filter(e => e.name.toLowerCase().includes(q) || e.role.toLowerCase().includes(q) || e.email.toLowerCase().includes(q));
  }
  res.json(result);
});

// Admin / HR Onboards New Employee Directly
app.post('/api/employees', async (req, res) => {
  const { name, email, phone, department, role, userRole, password, joiningDate, dateOfBirth } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required for onboarding' });
  }

  const plainPassword = password || 'Employee@123';
  const hashedPassword = await bcrypt.hash(plainPassword, 10);

  const newEmp = {
    id: `EMP-${Math.floor(1000 + Math.random() * 9000)}`,
    name,
    email: email.toLowerCase().trim(),
    phone: phone || '',
    department: department || 'General',
    role: role || 'Employee',
    userRole: userRole || 'Employee',
    status: 'Clocked Out',
    accountStatus: 'approved',
    password: hashedPassword,
    ptoDays: 18, // EL (Earned Leave)
    sickDays: 10, // SL (Sick Leave)
    casualDays: 10, // CL (Casual Leave)
    lwpDaysTaken: 0,
    joiningDate: joiningDate || new Date().toLocaleDateString('en-IN'),
    dateOfBirth: dateOfBirth || 'Jan 01, 1995',
    dob: dateOfBirth || '01/01/1995',
    idCardNo: `JRKCRIPL/${Math.floor(100 + Math.random() * 900)}`,
    validity: 'March 2028',
    baseSalary: 60000,
    allowances: 5000,
    taxDeductions: 3000,
    recentLogs: [],
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80'
  };

  try {
    if (mongoose.connection.readyState === 1) {
      await Employee.create(newEmp);
    }
  } catch (e) {}

  memEmployees.unshift(newEmp);
  res.status(201).json(newEmp);
});

// Submit Profile Photo Change Request for HR Approval
app.post('/api/employees/photo-request', async (req, res) => {
  const { employeeId, email, newAvatarUrl } = req.body;

  let emp = memEmployees.find(e => e.id === employeeId || (email && e.email.toLowerCase() === email.toLowerCase()));
  if (!emp && mongoose.connection.readyState === 1) {
    try { emp = await Employee.findOne({ $or: [{ id: employeeId }, { email: email ? email.toLowerCase().trim() : '' }] }); } catch (e) {}
  }

  if (!emp) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  emp.pendingAvatar = newAvatarUrl;
  emp.photoStatus = 'pending';

  const newApproval = {
    id: `REQ-${Math.floor(100 + Math.random() * 900)}`,
    employeeId: emp.id,
    employeeName: emp.name,
    role: emp.role,
    avatar: emp.avatar,
    newAvatarUrl,
    type: 'Profile Picture Approval',
    details: 'Profile Picture Change Request',
    subDetails: newAvatarUrl,
    assignedHrId: emp.assignedHrId || 'HR-0010',
    assignedHrName: emp.assignedHrName || 'HR Manager',
    assignedHrEmail: emp.assignedHrEmail || 'hr@yopmail.com',
    status: 'pending_hr',
    dateSubmitted: 'Just now'
  };

  try {
    if (mongoose.connection.readyState === 1) {
      await Employee.findOneAndUpdate(
        { $or: [{ id: emp.id }, { email: emp.email }] },
        { pendingAvatar: newAvatarUrl, photoStatus: 'pending' }
      );
      await Approval.create(newApproval);
    }
  } catch (e) {}

  memApprovals.unshift(newApproval);

  await createNotification({
    targetRole: 'HR',
    recipientId: emp.assignedHrId,
    title: 'New Profile Photo Submission',
    message: `${emp.name} uploaded a new profile picture. HR approval required.`,
    type: 'leave_request'
  });

  res.status(201).json({ message: 'Photo submitted for HR approval', approval: newApproval, employee: emp });
});

// ----------------------------------------------------
// ATTENDANCE & TIMESHEET ENDPOINTS
// ----------------------------------------------------

// Clock In Endpoint
app.post('/api/attendance/clock-in', async (req, res) => {
  const { employeeId, email } = req.body;
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { month: 'short', day: '2-digit', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });

  const logEntry = {
    id: `ATT-${Math.floor(1000 + Math.random() * 9000)}`,
    type: 'clock_punch',
    date: dateStr,
    clockInTime: timeStr,
    clockOutTime: null,
    hours: `${timeStr} - Active`,
    duration: 'Active Session',
    status: 'Active',
    createdAt: now.toISOString()
  };

  try {
    if (mongoose.connection.readyState === 1) {
      const emp = await Employee.findOneAndUpdate(
        { $or: [{ id: employeeId }, { email: email ? email.toLowerCase().trim() : '' }] },
        {
          $set: { status: 'Clocked In' },
          $push: { recentLogs: { $each: [logEntry], $position: 0 } }
        },
        { new: true }
      );
      if (emp) return res.json({ message: 'Clocked in successfully', employee: emp, log: logEntry });
    }
  } catch (e) {}

  let emp = memEmployees.find(e => e.id === employeeId || (email && e.email.toLowerCase() === email.toLowerCase()));
  if (emp) {
    emp.status = 'Clocked In';
    if (!emp.recentLogs) emp.recentLogs = [];
    emp.recentLogs.unshift(logEntry);
    return res.json({ message: 'Clocked in successfully', employee: emp, log: logEntry });
  }

  res.status(404).json({ error: 'Employee not found' });
});

// Clock Out Endpoint
app.post('/api/attendance/clock-out', async (req, res) => {
  const { employeeId, email } = req.body;
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });

  try {
    if (mongoose.connection.readyState === 1) {
      const emp = await Employee.findOne({ $or: [{ id: employeeId }, { email: email ? email.toLowerCase().trim() : '' }] });
      if (emp) {
        emp.status = 'Clocked Out';
        const activeLog = emp.recentLogs?.find(l => l.status === 'Active' || !l.clockOutTime) || (emp.recentLogs && emp.recentLogs[0]);
        if (activeLog) {
          const inTime = activeLog.clockInTime || timeStr;
          activeLog.clockOutTime = timeStr;
          activeLog.hours = `${inTime} - ${timeStr}`;
          activeLog.duration = 'Completed Shift';
          activeLog.status = 'Completed';
        }
        await emp.save();
        return res.json({ message: 'Clocked out successfully', employee: emp });
      }
    }
  } catch (e) {}

  let emp = memEmployees.find(e => e.id === employeeId || (email && e.email.toLowerCase() === email.toLowerCase()));
  if (emp) {
    emp.status = 'Clocked Out';
    const activeLog = emp.recentLogs?.find(l => l.status === 'Active' || !l.clockOutTime) || (emp.recentLogs && emp.recentLogs[0]);
    if (activeLog) {
      const inTime = activeLog.clockInTime || timeStr;
      activeLog.clockOutTime = timeStr;
      activeLog.hours = `${inTime} - ${timeStr}`;
      activeLog.duration = 'Completed Shift';
      activeLog.status = 'Completed';
    }
    return res.json({ message: 'Clocked out successfully', employee: emp });
  }

  res.status(404).json({ error: 'Employee not found' });
});

// Submit Manual Project Timesheet Entry
app.post('/api/attendance/timesheet-entry', async (req, res) => {
  const { employeeId, email, projectName, hours, notes, date } = req.body;
  const now = new Date();
  const dateStr = date || now.toLocaleDateString('en-IN', { month: 'short', day: '2-digit', year: 'numeric', timeZone: 'Asia/Kolkata' });

  const projectEntry = {
    id: `TS-${Math.floor(1000 + Math.random() * 9000)}`,
    type: 'project_log',
    date: dateStr,
    projectName: projectName || 'General Work',
    hours: hours || '4.0 hrs',
    notes: notes || 'Daily work log',
    duration: hours || '4.0 hrs',
    status: 'Submitted',
    createdAt: now.toISOString()
  };

  try {
    if (mongoose.connection.readyState === 1) {
      const emp = await Employee.findOneAndUpdate(
        { $or: [{ id: employeeId }, { email: email ? email.toLowerCase().trim() : '' }] },
        { $push: { recentLogs: { $each: [projectEntry], $position: 0 } } },
        { new: true }
      );
      if (emp) return res.status(201).json({ message: 'Timesheet log saved successfully', log: projectEntry });
    }
  } catch (e) {}

  let emp = memEmployees.find(e => e.id === employeeId || (email && e.email.toLowerCase() === email.toLowerCase()));
  if (emp) {
    if (!emp.recentLogs) emp.recentLogs = [];
    emp.recentLogs.unshift(projectEntry);
    return res.status(201).json({ message: 'Timesheet log saved successfully', log: projectEntry });
  }

  res.status(404).json({ error: 'Employee not found' });
});

// HR changes yearly leave quota for employee
app.put('/api/hr/employees/:id/leave-quota', async (req, res) => {
  const { id } = req.params;
  const { ptoDays, sickDays, baseSalary } = req.body;

  const updateData = {};
  if (ptoDays !== undefined) updateData.ptoDays = Number(ptoDays);
  if (sickDays !== undefined) updateData.sickDays = Number(sickDays);
  if (baseSalary !== undefined) updateData.baseSalary = Number(baseSalary);

  try {
    if (mongoose.connection.readyState === 1) {
      const updated = await Employee.findOneAndUpdate({ id }, updateData, { new: true });
      if (updated) {
        await createNotification({
          targetRole: 'Employee',
          recipientId: id,
          title: 'Leave Quota Updated',
          message: `Your HR updated your leave quota: ${ptoDays !== undefined ? ptoDays + ' Paid Days, ' : ''}${sickDays !== undefined ? sickDays + ' Sick Days' : ''}.`,
          type: 'quota_update'
        });
        return res.json(updated);
      }
    }
  } catch (e) {}

  const emp = memEmployees.find(e => e.id === id);
  if (emp) {
    if (ptoDays !== undefined) emp.ptoDays = Number(ptoDays);
    if (sickDays !== undefined) emp.sickDays = Number(sickDays);
    if (baseSalary !== undefined) emp.baseSalary = Number(baseSalary);

    await createNotification({
      targetRole: 'Employee',
      recipientId: id,
      title: 'Leave Quota Updated',
      message: `Your HR updated your leave quota: ${ptoDays !== undefined ? ptoDays + ' Paid Days, ' : ''}${sickDays !== undefined ? sickDays + ' Sick Days' : ''}.`,
      type: 'quota_update'
    });

    return res.json(emp);
  }
  res.status(404).json({ error: 'Employee not found' });
});

// Admin updates assigned HR for an employee
app.put('/api/admin/employees/:id/assign-hr', async (req, res) => {
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
  if (emp) {
    Object.assign(emp, updateFields);
    return res.json(emp);
  }
  res.status(404).json({ error: 'Employee not found' });
});

// ----------------------------------------------------
// 3. LEAVE REQUESTS & HR APPROVAL (INCLUDING LWP)
// ----------------------------------------------------

// Submit leave request by Employee
app.post('/api/approvals', async (req, res) => {
  const { employeeId, employeeName, type, details, subDetails, startDate, endDate, totalDays, isLwp } = req.body;

  // Find employee to obtain assigned HR
  let emp = memEmployees.find(e => e.id === employeeId || e.name === employeeName);
  if (!emp && mongoose.connection.readyState === 1) {
    try { emp = await Employee.findOne({ $or: [{ id: employeeId }, { name: employeeName }] }); } catch (e) {}
  }

  const assignedHrId = emp ? emp.assignedHrId : 'HR-0010';
  const assignedHrName = emp ? emp.assignedHrName : 'Sarah Chen';
  const assignedHrEmail = emp ? emp.assignedHrEmail : 'sarah.chen@jrkc.com';

  const daysCount = Number(totalDays) || 1;
  const isLwpLeave = isLwp || type === 'LWP' || type === 'Leave Without Pay';

  const newApproval = {
    id: `REQ-${Math.floor(100 + Math.random() * 900)}`,
    employeeId: emp ? emp.id : employeeId,
    employeeName: employeeName || (emp ? emp.name : 'Employee'),
    role: emp ? emp.role : 'Employee',
    avatar: emp ? emp.avatar : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
    type: type || (isLwpLeave ? 'LWP Leave' : 'Annual Leave'),
    details: details || `${daysCount} Day(s) Leave`,
    subDetails: subDetails || '',
    assignedHrId,
    assignedHrName,
    assignedHrEmail,
    startDate: startDate || '',
    endDate: endDate || '',
    totalDays: daysCount,
    isLwp: isLwpLeave,
    lwpDays: isLwpLeave ? daysCount : 0,
    status: 'pending_hr',
    dateSubmitted: 'Just now'
  };

  try {
    if (mongoose.connection.readyState === 1) {
      const created = await Approval.create(newApproval);
      sendLeaveRequestAlert(created, assignedHrEmail).catch(err => console.error('Leave email error:', err));
      await createNotification({
        targetRole: 'HR',
        recipientId: assignedHrId,
        title: 'New Leave Request (Pending HR)',
        message: `${newApproval.employeeName} requested ${newApproval.type} (${newApproval.totalDays} day(s)). HR review required.`,
        type: 'leave_request'
      });
      await createNotification({
        targetRole: 'Admin',
        title: 'Leave Request Submitted',
        message: `${newApproval.employeeName} submitted a leave request (assigned to HR ${assignedHrName}).`,
        type: 'leave_request'
      });
      return res.status(201).json(created);
    }
  } catch (e) {}

  memApprovals.unshift(newApproval);
  sendLeaveRequestAlert(newApproval, assignedHrEmail).catch(err => console.error('Leave email error:', err));
  await createNotification({
    targetRole: 'HR',
    recipientId: assignedHrId,
    title: 'New Leave Request (Pending HR)',
    message: `${newApproval.employeeName} requested ${newApproval.type} (${newApproval.totalDays} day(s)). HR review required.`,
    type: 'leave_request'
  });
  await createNotification({
    targetRole: 'Admin',
    title: 'Leave Request Submitted',
    message: `${newApproval.employeeName} submitted a leave request (assigned to HR ${assignedHrName}).`,
    type: 'leave_request'
  });

  res.status(201).json(newApproval);
});

// HR / Admin lists approvals (filtered by assigned HR or status)
app.get('/api/approvals', async (req, res) => {
  const { hrId, status } = req.query;

  try {
    if (mongoose.connection.readyState === 1) {
      let query = {};
      if (hrId) query.assignedHrId = hrId;
      if (status) query.status = status;
      const approvals = await Approval.find(query).sort({ createdAt: -1 });
      return res.json(approvals);
    }
  } catch (e) {}

  let list = [...memApprovals];
  if (hrId) list = list.filter(a => a.assignedHrId === hrId);
  if (status) list = list.filter(a => a.status === status);
  res.json(list);
});

// HR & Admin Leave Approval Endpoint (Sequential 2-step approval: pending_hr -> pending_admin -> approved)
app.patch('/api/approvals/:id', async (req, res) => {
  const { id } = req.params;
  const { status, action, userRole, approverName } = req.body;

  let item = null;
  try {
    if (mongoose.connection.readyState === 1) {
      item = await Approval.findOne({ id });
    }
  } catch (e) {}

  if (!item) {
    item = memApprovals.find(a => a.id === id);
  }

  if (!item) {
    return res.status(404).json({ error: 'Approval request not found' });
  }

  let nextStatus = status;

  // Determine multi-stage status transition logic
  if (item.type === 'Profile Picture Approval' || item.type === 'Photo Change') {
    if (status === 'approved' || action === 'hr_approve' || action === 'admin_approve') {
      nextStatus = 'approved';
      item.hrApprovedBy = approverName || 'HR Manager';
      item.hrApprovedAt = new Date().toISOString();
    } else if (status === 'rejected') {
      nextStatus = 'rejected';
    }
  } else if (action === 'hr_approve' || (status === 'pending_admin') || (status === 'approved' && (item.status === 'pending_hr' || item.status === 'pending') && userRole === 'HR')) {
    nextStatus = 'pending_admin';
    item.hrApprovedBy = approverName || 'HR Manager';
    item.hrApprovedAt = new Date().toISOString();
  } else if (action === 'admin_approve' || (status === 'approved' && item.status === 'pending_admin') || (status === 'approved' && userRole === 'Admin')) {
    nextStatus = 'approved';
    item.adminApprovedBy = approverName || 'Admin Director';
    item.adminApprovedAt = new Date().toISOString();
  } else if (status === 'rejected') {
    nextStatus = 'rejected';
  } else if (status === 'cancelled') {
    nextStatus = 'cancelled';
  }

  item.status = nextStatus;

  // Update employee leave balance or photo ONLY when approved
  let emp = memEmployees.find(e => e.id === item.employeeId || e.name === item.employeeName);

  if (nextStatus === 'approved' && emp) {
    if (item.type === 'Profile Picture Approval' || item.type === 'Photo Change') {
      const photoToApply = item.newAvatarUrl || item.subDetails;
      if (photoToApply) {
        emp.avatar = photoToApply;
        emp.pendingAvatar = null;
        emp.photoStatus = 'approved';
      }
    } else if (item.isLwp || item.type.includes('LWP')) {
      emp.lwpDaysTaken = (emp.lwpDaysTaken || 0) + item.totalDays;
    } else if (item.type.includes('Annual') || item.type.includes('PTO')) {
      emp.ptoDaysTaken = (emp.ptoDaysTaken || 0) + item.totalDays;
    } else if (item.type.includes('Sick')) {
      emp.sickDaysTaken = (emp.sickDaysTaken || 0) + item.totalDays;
    }
  } else if (nextStatus === 'rejected' && emp && (item.type === 'Profile Picture Approval' || item.type === 'Photo Change')) {
    emp.pendingAvatar = null;
    emp.photoStatus = 'rejected';
  }

  try {
    if (mongoose.connection.readyState === 1) {
      await Approval.findOneAndUpdate(
        { id },
        {
          status: nextStatus,
          hrApprovedBy: item.hrApprovedBy,
          hrApprovedAt: item.hrApprovedAt,
          adminApprovedBy: item.adminApprovedBy,
          adminApprovedAt: item.adminApprovedAt
        }
      );
      if (nextStatus === 'approved' && emp) {
        if (item.type === 'Profile Picture Approval' || item.type === 'Photo Change') {
          const photoToApply = item.newAvatarUrl || item.subDetails;
          await Employee.findOneAndUpdate(
            { $or: [{ id: emp.id }, { email: emp.email }] },
            { avatar: photoToApply, pendingAvatar: null, photoStatus: 'approved' }
          );
        } else {
          await Employee.findOneAndUpdate(
            { $or: [{ id: emp.id }, { email: emp.email }] },
            { lwpDaysTaken: emp.lwpDaysTaken, ptoDaysTaken: emp.ptoDaysTaken, sickDaysTaken: emp.sickDaysTaken }
          );
        }
      } else if (nextStatus === 'rejected' && emp && (item.type === 'Profile Picture Approval' || item.type === 'Photo Change')) {
        await Employee.findOneAndUpdate(
          { $or: [{ id: emp.id }, { email: emp.email }] },
          { pendingAvatar: null, photoStatus: 'rejected' }
        );
      }
    }
  } catch (e) {}

  // Notifications & Alerts
  const empEmail = emp ? emp.email : `${item.employeeName.toLowerCase().replace(' ', '.')}@luxehr.com`;

  if (nextStatus === 'pending_admin') {
    await createNotification({
      targetRole: 'Admin',
      title: 'Leave Request Passed HR Review',
      message: `${item.employeeName}'s ${item.type} request was approved by HR (${item.hrApprovedBy || 'HR'}). Pending Admin final approval.`,
      type: 'leave_request'
    });
    await createNotification({
      targetRole: 'Employee',
      recipientEmail: empEmail,
      title: 'Leave Approved by HR',
      message: `Your ${item.type} request has been approved by HR and forwarded to Admin for final sign-off.`,
      type: 'leave_approval'
    });
  } else if (nextStatus === 'approved') {
    sendLeaveStatusNotification(item, empEmail).catch(err => console.error('Leave decision email error:', err));
    await createNotification({
      targetRole: 'Employee',
      recipientEmail: empEmail,
      title: 'Leave Fully Approved! 🎉',
      message: `Your leave request for ${item.type} (${item.totalDays} day(s)) has received final approval from Admin.`,
      type: 'leave_approval'
    });
    await createNotification({
      targetRole: 'HR',
      recipientId: item.assignedHrId,
      title: 'Leave Finalized by Admin',
      message: `${item.employeeName}'s ${item.type} request was granted final approval by Admin.`,
      type: 'leave_approval'
    });
  } else if (nextStatus === 'rejected') {
    sendLeaveStatusNotification(item, empEmail).catch(err => console.error('Leave decision email error:', err));
    await createNotification({
      targetRole: 'Employee',
      recipientEmail: empEmail,
      title: 'Leave Request Rejected',
      message: `Your leave request for ${item.type} was rejected.`,
      type: 'leave_rejection'
    });
  }

  res.json(item);
});

// ----------------------------------------------------
// 4. PAYSLIP GENERATION, LWP CALCULATION & EMAIL DISPATCH
// ----------------------------------------------------

// Generate Payslip & Send Email to Employee (with CC to HR & Admin)
app.post('/api/payslips/generate', async (req, res) => {
  const { employeeId, payPeriod, workingDaysInMonth, customLwpDays } = req.body;

  let emp = memEmployees.find(e => e.id === employeeId);
  if (!emp && mongoose.connection.readyState === 1) {
    try { emp = await Employee.findOne({ id: employeeId }); } catch (e) {}
  }

  if (!emp) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  const totalDaysInMonth = Number(workingDaysInMonth) || 30;
  const lwpDays = customLwpDays !== undefined ? Number(customLwpDays) : (emp.lwpDaysTaken || 0);

  const baseSalary = emp.baseSalary || 65000;
  const perDaySalary = Math.round((baseSalary / totalDaysInMonth) * 100) / 100;
  const lwpDeduction = Math.round(perDaySalary * lwpDays * 100) / 100;

  const allowances = emp.allowances || 5000;
  const taxDeductions = emp.taxDeductions || 3000;

  const grossSalary = baseSalary + allowances;
  const totalDeductions = lwpDeduction + taxDeductions;
  const netPay = grossSalary - totalDeductions;

  const newPayslip = {
    id: `PAY-${Math.floor(1000 + Math.random() * 9000)}`,
    employeeId: emp.id,
    employeeName: emp.name,
    employeeEmail: emp.email,
    department: emp.department,
    role: emp.role,
    assignedHrName: emp.assignedHrName || 'Sarah Chen',
    payPeriod: payPeriod || 'October 2026',
    payDate: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
    workingDaysInMonth: totalDaysInMonth,
    baseSalary,
    perDaySalary,
    lwpDays,
    lwpDeduction,
    allowances,
    taxDeductions,
    totalDeductions,
    grossSalary,
    netPay,
    emailStatus: 'sent',
    sentAt: new Date()
  };

  try {
    if (mongoose.connection.readyState === 1) {
      await Payslip.create(newPayslip);
    }
  } catch (e) {}

  memPayslips.unshift(newPayslip);

  // Send Email with payslip to Employee (CC to Assigned HR & Admin)
  sendPayslipEmail(newPayslip, emp.assignedHrEmail).catch(err => console.error('Payslip email error:', err));

  // In-app notifications
  await createNotification({
    targetRole: 'Employee',
    recipientEmail: emp.email,
    title: 'New Payslip Available',
    message: `Your payslip for ${newPayslip.payPeriod} has been generated and sent to your email. Net Pay: $${netPay.toLocaleString()}. (LWP Deduction: $${lwpDeduction}).`,
    type: 'payslip'
  });

  await createNotification({
    targetRole: 'HR',
    recipientId: emp.assignedHrId,
    title: 'Payslip Dispatched',
    message: `Payslip for ${emp.name} (${newPayslip.payPeriod}) generated & emailed successfully.`,
    type: 'payslip'
  });

  await createNotification({
    targetRole: 'Admin',
    title: 'Payroll Dispatched',
    message: `Payslip for ${emp.name} dispatched for ${newPayslip.payPeriod}. Net Pay: $${netPay.toLocaleString()}.`,
    type: 'payslip'
  });

  res.status(201).json({ message: 'Payslip generated and sent to email successfully', payslip: newPayslip });
});

// Get payslips for employee (with automatic month-by-month history generation)
app.get('/api/payslips/employee/:employeeId', async (req, res) => {
  const { employeeId } = req.params;
  let list = [];
  try {
    if (mongoose.connection.readyState === 1) {
      list = await Payslip.find({ employeeId }).sort({ createdAt: -1 });
    }
  } catch (e) {}

  if (list.length === 0) {
    list = memPayslips.filter(p => p.employeeId === employeeId);
  }

  // If still empty, auto-generate past 6 months of historical payslips for employee
  if (list.length === 0) {
    let emp = memEmployees.find(e => e.id === employeeId);
    if (!emp && mongoose.connection.readyState === 1) {
      try { emp = await Employee.findOne({ id: employeeId }); } catch (e) {}
    }

    const empName = emp ? emp.name : 'Employee';
    const empEmail = emp ? emp.email : 'employee@jrkc.com';
    const dept = emp ? emp.department : 'Engineering';
    const role = emp ? emp.role : 'Specialist';
    const baseSalary = emp?.baseSalary || 72000;
    const allowances = emp?.allowances || 6000;
    const taxDeductions = emp?.taxDeductions || 3500;
    const lwpDaysTotal = emp?.lwpDaysTaken || 0;

    const monthsList = [
      { month: 'October', year: 2026, lwp: lwpDaysTotal, payDate: '31 Oct 2026' },
      { month: 'September', year: 2026, lwp: 0, payDate: '30 Sep 2026' },
      { month: 'August', year: 2026, lwp: 1, payDate: '31 Aug 2026' },
      { month: 'July', year: 2026, lwp: 0, payDate: '31 Jul 2026' },
      { month: 'June', year: 2026, lwp: 0, payDate: '30 Jun 2026' },
      { month: 'May', year: 2026, lwp: 2, payDate: '31 May 2026' }
    ];

    const generatedHistory = monthsList.map((m, idx) => {
      const daysInMonth = 26;
      const perDaySalary = Math.round((baseSalary / daysInMonth) * 100) / 100;
      const lwpDeduction = Math.round(perDaySalary * m.lwp * 100) / 100;
      const grossSalary = baseSalary + allowances;
      const totalDeductions = lwpDeduction + taxDeductions;
      const netPay = grossSalary - totalDeductions;

      return {
        id: `PAY-HIST-${Math.floor(1000 + Math.random() * 9000)}-${idx}`,
        employeeId: employeeId,
        employeeName: empName,
        employeeEmail: empEmail,
        department: dept,
        role: role,
        assignedHrName: emp?.assignedHrName || 'Sarah HR',
        payPeriod: `${m.month} ${m.year}`,
        month: m.month,
        year: m.year,
        payDate: m.payDate,
        workingDaysInMonth: daysInMonth,
        baseSalary,
        perDaySalary,
        lwpDays: m.lwp,
        lwpDeduction,
        allowances,
        taxDeductions,
        totalDeductions,
        grossSalary,
        netPay,
        emailStatus: 'sent',
        sentAt: new Date()
      };
    });

    memPayslips.push(...generatedHistory);
    list = generatedHistory;
  }

  res.json(list);
});

// Get all payslips (for Admin/HR)
app.get('/api/payslips', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const list = await Payslip.find().sort({ createdAt: -1 });
      return res.json(list);
    }
  } catch (e) {}

  res.json(memPayslips);
});

// ----------------------------------------------------
// 5. NOTIFICATIONS ENDPOINTS
// ----------------------------------------------------

app.get('/api/notifications', async (req, res) => {
  const { targetRole, recipientEmail, recipientId } = req.query;

  try {
    if (mongoose.connection.readyState === 1) {
      let query = {};
      if (targetRole) {
        query.$or = [
          { targetRole: targetRole },
          { targetRole: 'All' },
          { recipientEmail: recipientEmail },
          { recipientId: recipientId }
        ];
      }
      const list = await Notification.find(query).sort({ createdAt: -1 });
      return res.json(list);
    }
  } catch (e) {}

  let list = [...memNotifications];
  if (targetRole) {
    list = list.filter(n =>
      n.targetRole === targetRole ||
      n.targetRole === 'All' ||
      (recipientEmail && n.recipientEmail === recipientEmail) ||
      (recipientId && n.recipientId === recipientId)
    );
  }
  res.json(list);
});

app.patch('/api/notifications/:id/read', async (req, res) => {
  const { id } = req.params;
  try {
    if (mongoose.connection.readyState === 1) {
      const updated = await Notification.findOneAndUpdate({ id }, { read: true }, { new: true });
      if (updated) return res.json(updated);
    }
  } catch (e) {}

  const n = memNotifications.find(x => x.id === id);
  if (n) {
    n.read = true;
    return res.json(n);
  }
  res.status(404).json({ error: 'Notification not found' });
});

// ----------------------------------------------------
// 6. ANNOUNCEMENTS, BANK DETAILS & TAX DOCS
// ----------------------------------------------------

app.get('/api/announcements', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const list = await Announcement.find().sort({ createdAt: -1 });
      return res.json(list);
    }
  } catch (e) {}
  res.json(memAnnouncements);
});

app.get('/api/bank-details', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const bank = await BankDetails.findOne();
      if (bank) return res.json(bank);
    }
  } catch (e) {}
  res.json(memBankDetails);
});

app.get('/api/payslips', async (req, res) => {
  const { employeeId } = req.query;
  try {
    if (mongoose.connection.readyState === 1) {
      const query = employeeId ? { $or: [{ employeeId }, { employeeEmail: employeeId }] } : {};
      const list = await Payslip.find(query).sort({ createdAt: -1 });
      return res.json(list);
    }
  } catch (e) {}

  let list = [...memPayslips];
  if (employeeId) {
    list = list.filter(p => p.employeeId === employeeId || p.employeeEmail === employeeId);
  }
  res.json(list);
});

app.post('/api/payslips/generate', async (req, res) => {
  const { employeeId, payPeriod } = req.body;

  let emp = memEmployees.find(e => e.id === employeeId || e.email === employeeId);
  if (!emp && mongoose.connection.readyState === 1) {
    emp = await Employee.findOne({ $or: [{ id: employeeId }, { email: employeeId }] });
  }

  const empName = emp ? emp.name : 'SACHIN SHARMA';
  const empEmail = emp ? emp.email : 'sachin.sharma@jrkcrail.com';
  const role = emp ? emp.role : 'SITE ENGINEER';
  const department = emp ? emp.department : 'Engineering & Construction';
  const period = payPeriod || 'May-26';

  const basic = emp?.baseSalary || 14000;
  const salaryOfAttendance = basic;
  const employerPf = Math.round(basic * 0.12); // ₹1,680
  const hra = Math.round(basic * 0.4); // ₹5,600
  const da = 3350;
  const sa = 6420;
  const totalCtc = salaryOfAttendance + employerPf + hra + da + sa; // ₹31,050

  const esi = 0;
  const advance = 0;
  const incomeTax = 0;
  const loan = 0;
  const employeePf = employerPf; // ₹1,680
  const other = 0;
  const totalDeductions = employerPf + employeePf + esi + advance + incomeTax + loan + other; // ₹3,360
  const netPay = totalCtc - totalDeductions; // ₹27,690

  const newSlip = {
    id: `PAY-${Math.floor(10000 + Math.random() * 90000)}`,
    serialNo: `${Math.floor(10000 + Math.random() * 90000)}`,
    employeeId: emp?.idCardNo || emp?.id || 'JRKCRIPL/004',
    employeeName: empName,
    employeeEmail: empEmail,
    role: role,
    department: department,
    payPeriod: period,
    payDate: new Date().toLocaleDateString('en-IN'),
    workingDaysInMonth: 30,
    attendance: 30,
    station: 'KARAMBELI',
    baseSalary: basic,
    basic: basic,
    salaryOfAttendance: salaryOfAttendance,
    employerPf: employerPf,
    hra: hra,
    da: da,
    sa: sa,
    totalCtc: totalCtc,
    esi: esi,
    advance: advance,
    incomeTax: incomeTax,
    loan: loan,
    employeePf: employeePf,
    other: other,
    totalDeductions: totalDeductions,
    grossSalary: totalCtc,
    netPay: netPay,
    amountInWords: 'Rupees TwentySeven Thousand Six Hundred Ninety Only',
    emailStatus: 'sent'
  };

  try {
    if (mongoose.connection.readyState === 1) {
      await Payslip.create(newSlip);
    }
  } catch (e) {}

  memPayslips.unshift(newSlip);

  // Email payslip statement
  sendPayslipEmail(newSlip, emp?.assignedHrEmail).catch(err => console.error('Payslip email error:', err));

  res.json({ message: 'Payslip generated successfully', payslip: newSlip });
});

// POST /api/payslips/:id/mark-paid
// HR Marks Salary as Paid to Employee. Schedules PDF Email Dispatch after 4.5 hours delay!
app.post('/api/payslips/:id/mark-paid', async (req, res) => {
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
        {
          disbursementStatus: immediate ? 'dispatched' : 'paid_pending_dispatch',
          markedPaidAt: now,
          scheduledDispatchTime: scheduledTime,
          emailStatus: immediate ? 'sent' : 'scheduled',
          sentAt: immediate ? now : null
        },
        { new: true }
      );
    }
  } catch (e) {}

  if (!updatedPayslip) {
    const slip = memPayslips.find(p => p.id === id || p._id === id);
    if (slip) {
      slip.disbursementStatus = immediate ? 'dispatched' : 'paid_pending_dispatch';
      slip.markedPaidAt = now;
      slip.scheduledDispatchTime = scheduledTime;
      slip.emailStatus = immediate ? 'sent' : 'scheduled';
      if (immediate) slip.sentAt = now;
      updatedPayslip = slip;
    }
  }

  if (!updatedPayslip) {
    return res.status(404).json({ error: 'Payslip record not found' });
  }

  // Create HR Notification
  const hrNotif = {
    id: `NOTIF-${Date.now()}`,
    title: 'Salary Disbursement Marked as Paid 💳',
    message: immediate
      ? `Salary payment for ${updatedPayslip.employeeName} (${updatedPayslip.payPeriod}) marked as paid and payslip emailed immediately.`
      : `Salary payment for ${updatedPayslip.employeeName} (${updatedPayslip.payPeriod}) marked as paid. Payslip PDF will automatically be emailed in ${delayHours} hours.`,
    targetRole: 'HR',
    recipientEmail: updatedPayslip.assignedHrEmail || 'hr@jrkc.com',
    createdAt: new Date().toISOString(),
    read: false
  };
  memNotifications.unshift(hrNotif);

  if (immediate) {
    sendDelayedPayslipDisbursementEmail(updatedPayslip).catch(e => console.error('Error emailing payslip:', e));
  }

  res.json({
    message: immediate
      ? 'Salary marked as paid and payslip dispatched immediately.'
      : `Salary marked as paid. Payslip email scheduled for automatic dispatch in ${delayHours} hours.`,
    payslip: updatedPayslip
  });
});

// Automatic Delayed Dispatch Worker (Runs every 1 minute)
// Automatically dispatches payslip emails when scheduledDispatchTime elapses!
setInterval(async () => {
  try {
    const now = new Date();
    
    // Check MongoDB if connected
    if (mongoose.connection.readyState === 1) {
      const pendingMongoSlips = await Payslip.find({
        disbursementStatus: 'paid_pending_dispatch',
        scheduledDispatchTime: { $lte: now }
      });

      for (const slip of pendingMongoSlips) {
        slip.disbursementStatus = 'dispatched';
        slip.emailStatus = 'sent';
        slip.dispatchedAt = now;
        slip.sentAt = now;
        await slip.save();

        // Dispatch Email
        sendDelayedPayslipDisbursementEmail(slip).catch(err => console.error('Delayed email dispatch error:', err));

        // Create Employee In-App Notification
        const empNotif = {
          id: `NOTIF-${Date.now()}`,
          title: 'Monthly Salary Statement Disbursed 📑',
          message: `Your official salary statement for ${slip.payPeriod} has been verified and emailed to ${slip.employeeEmail}.`,
          targetRole: 'Employee',
          recipientEmail: slip.employeeEmail,
          recipientId: slip.employeeId,
          createdAt: now.toISOString(),
          read: false
        };
        try { await Notification.create(empNotif); } catch(e){}
        memNotifications.unshift(empNotif);
      }
    }

    // Check Memory Store
    const pendingMemSlips = memPayslips.filter(p =>
      p.disbursementStatus === 'paid_pending_dispatch' &&
      p.scheduledDispatchTime &&
      new Date(p.scheduledDispatchTime) <= now
    );

    for (const slip of pendingMemSlips) {
      slip.disbursementStatus = 'dispatched';
      slip.emailStatus = 'sent';
      slip.dispatchedAt = now;
      slip.sentAt = now;

      sendDelayedPayslipDisbursementEmail(slip).catch(err => console.error('Delayed email dispatch error:', err));

      const empNotif = {
        id: `NOTIF-${Date.now()}`,
        title: 'Monthly Salary Statement Disbursed 📑',
        message: `Your official salary statement for ${slip.payPeriod} has been verified and emailed to ${slip.employeeEmail}.`,
        targetRole: 'Employee',
        recipientEmail: slip.employeeEmail,
        recipientId: slip.employeeId,
        createdAt: now.toISOString(),
        read: false
      };
      memNotifications.unshift(empNotif);
    }
  } catch (e) {
    console.error('Error in delayed payslip worker:', e);
  }
}, 60 * 1000);

app.listen(PORT, () => {
  console.log(`🚀 JRKC HR Portal REST API Backend listening on http://localhost:${PORT}`);
});
