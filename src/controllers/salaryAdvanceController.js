import mongoose from 'mongoose';
import { Employee } from '../models/Employee.js';
import { SalaryAdvance } from '../models/SalaryAdvance.js';
import { Approval } from '../models/Approval.js';
import { memEmployees, memSalaryAdvances, memApprovals, saveDiskStore } from '../data/store.js';
import { calculateGrossSalary, generateRepaymentSchedule } from '../services/payrollService.js';
import { createNotification } from '../services/notificationService.js';

export const requestAdvance = async (req, res) => {
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
};

export const getEmployeeAdvance = async (req, res) => {
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
};

export const getAdminAdvances = async (req, res) => {
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
};

export const approveAdvance = async (req, res) => {
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
};

export const rejectAdvance = async (req, res) => {
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
};
