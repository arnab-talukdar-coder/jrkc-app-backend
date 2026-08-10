import mongoose from 'mongoose';
import { Employee } from '../models/Employee.js';
import { Approval } from '../models/Approval.js';
import { HRSettings } from '../models/HRSettings.js';
import { memEmployees, memApprovals, saveDiskStore } from '../data/store.js';
import { sanitizeString } from '../middleware/auth.js';
import { sendLeaveRequestAlert, sendLeaveStatusNotification } from '../services/emailService.js';
import { createNotification } from '../services/notificationService.js';

export const submitLeaveRequest = async (req, res) => {
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
};

export const listApprovals = async (req, res) => {
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
};

export const approveRejectLeave = async (req, res) => {
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
};

export const regularizeAttendance = async (req, res) => {
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
};

export const getHrSettings = async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const settings = await HRSettings.findOne({ id: 'HR_SETTINGS_GLOBAL' });
      if (settings) return res.json(settings);
    }
  } catch (e) {}
  res.json({ id: 'HR_SETTINGS_GLOBAL', lwpDeductionBasis: 'basic', workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] });
};

export const updateHrSettings = async (req, res) => {
  const updates = req.body;
  try {
    if (mongoose.connection.readyState === 1) {
      const updated = await HRSettings.findOneAndUpdate({ id: 'HR_SETTINGS_GLOBAL' }, updates, { new: true, upsert: true });
      return res.json(updated);
    }
  } catch (e) {}
  res.json({ id: 'HR_SETTINGS_GLOBAL', ...updates });
};
