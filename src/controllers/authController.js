import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Employee } from '../models/Employee.js';
import { RegistrationRequest } from '../models/RegistrationRequest.js';
import { memEmployees, memRegistrationRequests, saveDiskStore } from '../data/store.js';
import { validateEmail, sanitizeString } from '../middleware/auth.js';
import {
  sendAdminRegistrationAlert,
  sendRegistrationConfirmationToEmployee,
  sendEmployeeApprovalEmail
} from '../services/emailService.js';
import { createNotification } from '../services/notificationService.js';

const JWT_SECRET = process.env.JWT_SECRET || 'jrkc-hrms-secret-2026';

export const registerEmployee = async (req, res) => {
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
};

export const registerAdmin = async (req, res) => {
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
  res.json({ message: 'Admin registered successfully', token, user: newAdmin });
};

export const initAdminAccounts = async (req, res) => {
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
};

export const login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  let user = null;
  try { if (mongoose.connection.readyState === 1) user = await Employee.findOne({ email: email.toLowerCase().trim() }); } catch (e) {}
  if (!user) user = memEmployees.find(e => e.email?.toLowerCase() === email.toLowerCase().trim());
  if (!user) return res.status(401).json({ error: 'No account found with this email. Please register first or contact Admin.' });
  if (user.accountStatus !== 'approved') return res.status(403).json({ error: 'Your account is pending Admin approval.' });

  let passwordMatch = false;
  if (user.password) {
    if (user.password.startsWith('$2b$') || user.password.startsWith('$2a$')) {
      passwordMatch = await bcrypt.compare(password, user.password);
    } else if (user.password === password) {
      passwordMatch = true;
    }
  } else {
    return res.status(401).json({ error: 'Your account has no password set. Please contact Admin or HR to reset your password before logging in.' });
  }

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

  if (user.password && !user.password.startsWith('$2b$')) {
    const upgraded = await bcrypt.hash(password, 10);
    try { if (mongoose.connection.readyState === 1) await Employee.findOneAndUpdate({ email: user.email }, { password: upgraded }); } catch (e) {}
  }

  const token = jwt.sign({ id: user.id, email: user.email, userRole: user.userRole, name: user.name }, JWT_SECRET, { expiresIn: '1h' });
  const refreshToken = jwt.sign({ id: user.id, type: 'refresh' }, JWT_SECRET, { expiresIn: '7d' });

  try { 
    if (mongoose.connection.readyState === 1) await Employee.findOneAndUpdate({ email: user.email }, { refreshToken }); 
  } catch (e) {}
  user.refreshToken = refreshToken;

  res.json({
    message: 'Login successful', token, refreshToken,
    user: {
      id: user.id, name: user.name, email: user.email, userRole: user.userRole,
      role: user.role, department: user.department, accountStatus: user.accountStatus,
      avatar: user.avatar, ptoDays: user.ptoDays, sickDays: user.sickDays,
      casualDays: user.casualDays, station: user.station, assignedLocation: user.assignedLocation
    }
  });
};

export const refreshToken = async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ error: 'Refresh token is required' });

  try {
    const decoded = jwt.verify(refreshToken, JWT_SECRET);
    if (decoded.type !== 'refresh') return res.status(401).json({ error: 'Invalid token type' });

    let user = null;
    try { if (mongoose.connection.readyState === 1) user = await Employee.findOne({ id: decoded.id, refreshToken }); } catch (e) {}
    if (!user) user = memEmployees.find(e => e.id === decoded.id && e.refreshToken === refreshToken);

    if (!user) return res.status(401).json({ error: 'Invalid or expired refresh token' });
    if (user.accountStatus !== 'approved') return res.status(403).json({ error: 'Account inactive' });

    const newToken = jwt.sign({ id: user.id, email: user.email, userRole: user.userRole, name: user.name }, JWT_SECRET, { expiresIn: '1h' });
    const newRefreshToken = jwt.sign({ id: user.id, type: 'refresh' }, JWT_SECRET, { expiresIn: '7d' });

    try { 
      if (mongoose.connection.readyState === 1) await Employee.findOneAndUpdate({ id: user.id }, { refreshToken: newRefreshToken }); 
    } catch (e) {}
    user.refreshToken = newRefreshToken;

    res.json({ token: newToken, refreshToken: newRefreshToken });
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
};

export const changePassword = async (req, res) => {
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
};
