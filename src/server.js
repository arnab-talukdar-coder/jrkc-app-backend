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
  sendPayslipEmail
} from './services/emailService.js';
import {
  INITIAL_EMPLOYEES,
  INITIAL_APPROVALS,
  INITIAL_ANNOUNCEMENTS,
  INITIAL_BANK_DETAILS,
  INITIAL_TAX_DOCS,
  INITIAL_PAYROLL,
  INITIAL_REGISTRATION_REQUESTS
} from './data/initialData.js';

const app = express();
const PORT = process.env.PORT || 5000;
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'http://localhost:8081',
    'http://localhost:8082',
    'http://localhost:8080',
    'http://localhost:19006',
    'http://127.0.0.1:8081',
    'http://127.0.0.1:8082'
  ];

  if (origin && (allowedOrigins.includes(origin) || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1'))) {
    res.header('Access-Control-Allow-Origin', origin);
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }

  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
}));
app.use(express.json());

// In-memory fallback stores
let memEmployees = [...INITIAL_EMPLOYEES];
let memApprovals = [...INITIAL_APPROVALS];
let memAnnouncements = [...INITIAL_ANNOUNCEMENTS];
let memBankDetails = { ...INITIAL_BANK_DETAILS };
let memRegistrationRequests = [...INITIAL_REGISTRATION_REQUESTS];
let memPayslips = [];
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

// Health Check Endpoint
app.get('/api/health', (req, res) => {
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
  const { name, email, phone, department, role, requestedUserRole, assignedHrId, assignedHrName } = req.body;

  if (!name || !email || !department) {
    return res.status(400).json({ error: 'Name, email, and department are required' });
  }

  const newReg = {
    id: `REG-${Math.floor(100 + Math.random() * 900)}`,
    name,
    email,
    phone: phone || '',
    department,
    role: role || 'Employee',
    requestedUserRole: requestedUserRole || 'Employee',
    assignedHrId: assignedHrId || 'HR-0010',
    assignedHrName: assignedHrName || 'Sarah Chen',
    status: 'pending_approval',
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

  if (!user.password) {
    return res.status(401).json({ error: 'Password not set. Please contact Admin to reset your password.' });
  }

  // Verify password
  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) {
    return res.status(401).json({ error: 'Incorrect password. Please try again.' });
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

  const tempPassword = Math.random().toString(36).slice(-8).toUpperCase() + Math.floor(10 + Math.random() * 90);
  const hashedTempPassword = await bcrypt.hash(tempPassword, 10);

  const newEmp = {
    id: `EMP-${Math.floor(1000 + Math.random() * 9000)}`,
    name: regItem.name,
    email: regItem.email,
    phone: regItem.phone,
    department: regItem.department,
    role: regItem.role,
    userRole: regItem.requestedUserRole || 'Employee',
    status: 'Clocked Out',
    accountStatus: 'approved',
    password: hashedTempPassword,
    ptoDays: 15,
    sickDays: 5,
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

  // Trigger emails to Employee & Assigned HR (with temp password)
  sendEmployeeApprovalEmail({ ...newEmp, tempPassword }, hrObj.email).catch(err => console.error('Welcome email error:', err));

  // Notifications
  await createNotification({
    targetRole: 'Employee',
    recipientEmail: newEmp.email,
    title: 'Account Approved ✅',
    message: `Your registration was approved. Temp password: ${tempPassword}. Please login and change your password immediately.`,
    type: 'registration'
  });

  await createNotification({
    targetRole: 'HR',
    recipientId: hrObj.id,
    title: 'New Employee Assigned',
    message: `${newEmp.name} has been approved and assigned to your HR roster.`,
    type: 'registration'
  });

  res.json({ message: 'Registration request approved', employee: newEmp });
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
    status: 'pending',
    dateSubmitted: 'Just now'
  };

  try {
    if (mongoose.connection.readyState === 1) {
      const created = await Approval.create(newApproval);
      sendLeaveRequestAlert(created, assignedHrEmail).catch(err => console.error('Leave email error:', err));
      await createNotification({
        targetRole: 'HR',
        recipientId: assignedHrId,
        title: 'New Leave Request',
        message: `${newApproval.employeeName} requested ${newApproval.type} (${newApproval.totalDays} day(s)).`,
        type: 'leave_request'
      });
      await createNotification({
        targetRole: 'Admin',
        title: 'Leave Request Submitted',
        message: `${newApproval.employeeName} submitted a leave request to HR ${assignedHrName}.`,
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
    title: 'New Leave Request',
    message: `${newApproval.employeeName} requested ${newApproval.type} (${newApproval.totalDays} day(s)).`,
    type: 'leave_request'
  });
  await createNotification({
    targetRole: 'Admin',
    title: 'Leave Request Submitted',
    message: `${newApproval.employeeName} submitted a leave request to HR ${assignedHrName}.`,
    type: 'leave_request'
  });

  res.status(201).json(newApproval);
});

// HR lists approvals (filtered by assigned HR or status)
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

// HR Approves or Rejects Leave Request
app.patch('/api/approvals/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // 'approved' | 'rejected'

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

  item.status = status;

  // If approved and it is LWP or Paid Leave, update employee leave count
  let emp = memEmployees.find(e => e.id === item.employeeId || e.name === item.employeeName);
  if (status === 'approved' && emp) {
    if (item.isLwp || item.type.includes('LWP')) {
      emp.lwpDaysTaken = (emp.lwpDaysTaken || 0) + item.totalDays;
    } else if (item.type.includes('Annual') || item.type.includes('PTO')) {
      emp.ptoDays = Math.max(0, (emp.ptoDays || 15) - item.totalDays);
    } else if (item.type.includes('Sick')) {
      emp.sickDays = Math.max(0, (emp.sickDays || 5) - item.totalDays);
    }
  }

  try {
    if (mongoose.connection.readyState === 1) {
      await Approval.findOneAndUpdate({ id }, { status });
      if (status === 'approved' && emp) {
        await Employee.findOneAndUpdate(
          { id: emp.id },
          { lwpDaysTaken: emp.lwpDaysTaken, ptoDays: emp.ptoDays, sickDays: emp.sickDays }
        );
      }
    }
  } catch (e) {}

  // Send Email & Notifications
  const empEmail = emp ? emp.email : `${item.employeeName.toLowerCase().replace(' ', '.')}@luxehr.com`;
  sendLeaveStatusNotification(item, empEmail).catch(err => console.error('Leave decision email error:', err));

  await createNotification({
    targetRole: 'Employee',
    recipientEmail: empEmail,
    title: `Leave Request ${status.toUpperCase()}`,
    message: `Your leave request for ${item.type} (${item.totalDays} day(s)) has been ${status} by HR.`,
    type: status === 'approved' ? 'leave_approval' : 'leave_rejection'
  });

  await createNotification({
    targetRole: 'Admin',
    title: `Leave Request Decision`,
    message: `HR ${item.assignedHrName || ''} marked leave request for ${item.employeeName} as ${status}.`,
    type: 'system'
  });

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

// Get payslips for employee
app.get('/api/payslips/employee/:employeeId', async (req, res) => {
  const { employeeId } = req.params;
  try {
    if (mongoose.connection.readyState === 1) {
      const list = await Payslip.find({ employeeId }).sort({ createdAt: -1 });
      if (list.length > 0) return res.json(list);
    }
  } catch (e) {}

  const list = memPayslips.filter(p => p.employeeId === employeeId);
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

app.get('/api/tax-docs', (req, res) => res.json(taxDocs));
app.get('/api/payroll', (req, res) => res.json(payroll));

app.listen(PORT, () => {
  console.log(`🚀 JRKC HR Portal REST API Backend listening on http://localhost:${PORT}`);
});
