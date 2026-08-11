import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { Employee } from '../models/Employee.js';
import { Approval } from '../models/Approval.js';
import { memEmployees, memApprovals, saveDiskStore } from '../data/store.js';
import { validateEmail, sanitizeString } from '../middleware/auth.js';
import { sendRegistrationConfirmationToEmployee } from '../services/emailService.js';
import { createNotification } from '../services/notificationService.js';
import { generateNextEmployeeId } from '../utils/idGenerator.js';

export const registerPushToken = async (req, res) => {
  const { pushToken } = req.body;
  if (!pushToken) return res.status(400).json({ error: 'Push token is required' });

  try {
    if (mongoose.connection.readyState === 1) {
      await Employee.findOneAndUpdate({ email: req.user.email }, { expoPushToken: pushToken });
    }
  } catch (e) {}

  const emp = memEmployees.find(e => e.email === req.user.email);
  if (emp) { emp.expoPushToken = pushToken; saveDiskStore(); }

  res.json({ message: 'Push token registered successfully' });
};

export const getEmployees = async (req, res) => {
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
    }

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
};

export const onboardEmployee = async (req, res) => {
  const { name, email, phone, department, role, userRole, joiningDate, dateOfBirth, dob, bloodGroup, station, validity, salaryStructure } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });
  if (!validateEmail(email)) return res.status(400).json({ error: 'Invalid email address' });

  // Auto-generate a secure random password
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#!';
  let plainPassword = '';
  for (let i = 0; i < 10; i++) plainPassword += chars[Math.floor(Math.random() * chars.length)];

  const hashedPassword = await bcrypt.hash(plainPassword, 10);
  const newEmpId = await generateNextEmployeeId(memEmployees);

  const newEmp = {
    id: newEmpId,
    name: sanitizeString(name), email: email.toLowerCase().trim(), phone: phone || '',
    department: sanitizeString(department) || 'Operations', role: sanitizeString(role) || 'Site Engineer',
    userRole: userRole || 'Employee', status: 'Clocked Out', accountStatus: 'approved',
    password: hashedPassword,
    ptoDays: 18, sickDays: 10, casualDays: 10, lwpDaysTaken: 0,
    joiningDate: joiningDate || new Date().toLocaleDateString('en-IN'),
    dateOfBirth: dateOfBirth || dob || '', dob: dob || dateOfBirth || '',
    bloodGroup: bloodGroup || '', station: station || '',
    idCardNo: newEmpId, validity: validity || '',
    salaryStructure: salaryStructure || { basic: 0, hra: 0, da: 0, sa: 0, employerPf: 0, employeePf: 0 },
    recentLogs: []
  };

  try { if (mongoose.connection.readyState === 1) await Employee.create(newEmp); } catch (e) { console.error('Onboard error:', e.message); }
  memEmployees.unshift(newEmp);
  saveDiskStore();

  // Send welcome email with auto-generated password
  try {
    await sendRegistrationConfirmationToEmployee({
      name: newEmp.name,
      email: newEmp.email,
      password: plainPassword,
      role: newEmp.role,
      department: newEmp.department,
      employeeId: newEmp.id
    });
    console.log(`📧 Welcome email with password sent to ${newEmp.email}`);
  } catch (emailErr) {
    console.error('⚠️ Failed to send welcome email:', emailErr.message);
  }

  res.status(201).json({ ...newEmp, password: undefined });
};

export const requestPhotoChange = async (req, res) => {
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
};

export const updateEmployeeQuotaSalary = async (req, res) => {
  const rawId = req.params.id || req.params[0];
  const id = rawId ? decodeURIComponent(rawId.replace(/^\/+/, '').replace(/\/(leave-quota|salary)$/, '')) : '';
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
      const updated = await Employee.findOneAndUpdate({ $or: [{ id }, { idCardNo: id }] }, updateData, { new: true });
      if (updated) {
        await createNotification({ targetRole: 'Employee', recipientId: id, title: 'Salary & Quota Updated', message: `Your salary structure / leave quota has been updated.`, type: 'quota_update' });
        return res.json(updated);
      }
    }
  } catch (e) {}
  const emp = memEmployees.find(e => e.id === id || e.idCardNo === id);
  if (emp) {
    Object.assign(emp, updateData);
    saveDiskStore();
    await createNotification({ targetRole: 'Employee', recipientId: id, title: 'Salary & Quota Updated', message: `Your salary structure / leave quota has been updated.`, type: 'quota_update' });
    return res.json(emp);
  }
  res.status(404).json({ error: 'Employee not found' });
};

export const updateEmployeeProfile = async (req, res) => {
  const rawId = req.params.id || req.params[0];
  const id = rawId ? decodeURIComponent(rawId.replace(/^\/+/, '').replace(/\/profile$/, '')) : '';
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
};
