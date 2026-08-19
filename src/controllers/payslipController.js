import mongoose from 'mongoose';
import { Employee } from '../models/Employee.js';
import { Payslip } from '../models/Payslip.js';
import { Attendance } from '../models/Attendance.js';
import { HRSettings } from '../models/HRSettings.js';
import { Approval } from '../models/Approval.js';
import { SalaryAdvance } from '../models/SalaryAdvance.js';
import { memEmployees, memPayslips, memApprovals, memSalaryAdvances, saveDiskStore } from '../data/store.js';
import { calculateSalaryForEmployee } from '../services/payrollService.js';
import { sendPayslipEmail, sendDelayedPayslipDisbursementEmail } from '../services/emailService.js';
import { createNotification } from '../services/notificationService.js';

/**
 * Shared helper: fetch all data needed to calculate a payslip for an employee.
 */
async function fetchPayrollDependencies(emp, year, month) {
  const monthIdx = ['January','February','March','April','May','June','July','August','September','October','November','December']
    .findIndex(m => m.toLowerCase().startsWith(String(month).toLowerCase().trim()));
  const realMonthIdx = monthIdx !== -1 ? monthIdx : new Date().getMonth();
  const yyyy = String(year);
  const mm = String(realMonthIdx + 1).padStart(2, '0');
  const monthPrefix = `${yyyy}-${mm}`;

  let lwpBasis = 'basic';
  let approvals = [];
  let salaryAdvances = [];
  let attendanceRecords = [];

  try {
    if (mongoose.connection.readyState === 1) {
      const s = await HRSettings.findOne({ id: 'HR_SETTINGS_GLOBAL' });
      if (s?.lwpDeductionBasis) lwpBasis = s.lwpDeductionBasis;
    }
  } catch (e) {}

  try {
    if (mongoose.connection.readyState === 1) {
      approvals = await Approval.find({ employeeId: emp.id });
    } else {
      approvals = memApprovals.filter(a => a.employeeId === emp.id);
    }
  } catch (e) {}

  try {
    if (mongoose.connection.readyState === 1) {
      salaryAdvances = await SalaryAdvance.find({ employeeId: emp.id, status: 'approved' });
    } else {
      salaryAdvances = memSalaryAdvances.filter(a => a.employeeId === emp.id && a.status === 'approved');
    }
  } catch (e) {}

  // Fetch actual attendance records from the Attendance collection
  try {
    if (mongoose.connection.readyState === 1) {
      attendanceRecords = await Attendance.find({
        $or: [{ employeeId: emp.id }, { employeeEmail: emp.email }],
        date: { $regex: `^${monthPrefix}` }
      });
    }
  } catch (e) {}

  return { lwpBasis, approvals, salaryAdvances, attendanceRecords };
}

/**
 * Build a payslip object from calculated values and optional HR overrides.
 * HR overrides are applied AFTER the base calculation (payslip-specific values only).
 */
function applyOverridesAndBuild(emp, calc, overrides = {}) {
  // Apply HR overrides to individual salary components
  const basic            = overrides.basic            !== undefined ? Number(overrides.basic)            : calc.basic;
  const hra              = overrides.hra              !== undefined ? Number(overrides.hra)              : calc.hra;
  const da               = overrides.da               !== undefined ? Number(overrides.da)               : calc.da;
  const sa               = overrides.sa               !== undefined ? Number(overrides.sa)               : calc.sa;
  const conveyance       = overrides.conveyance       !== undefined ? Number(overrides.conveyance)       : calc.conveyance;
  const otherAllowances  = overrides.otherAllowances  !== undefined ? Number(overrides.otherAllowances)  : calc.otherAllowances;
  const incentive        = overrides.incentive        !== undefined ? Number(overrides.incentive)        : 0;
  const otherEarnings    = overrides.otherEarnings    !== undefined ? Number(overrides.otherEarnings)    : 0;
  const employeePf       = overrides.employeePf       !== undefined ? Number(overrides.employeePf)       : calc.employeePf;
  const esi              = overrides.esi              !== undefined ? Number(overrides.esi)              : calc.esi;
  const professionalTax  = overrides.professionalTax  !== undefined ? Number(overrides.professionalTax)  : calc.professionalTax;
  const tds              = overrides.tds              !== undefined ? Number(overrides.tds)              : calc.tds;
  const other            = overrides.other            !== undefined ? Number(overrides.other)            : 0;

  // Attendance override
  const attendanceDays   = overrides.attendanceDays   !== undefined ? Number(overrides.attendanceDays)   : calc.attendance;
  const lwpDays          = overrides.lwpDays          !== undefined ? Number(overrides.lwpDays)          : calc.lwpDays;
  const lwpDeduction     = overrides.lwpDeduction     !== undefined ? Number(overrides.lwpDeduction)     : calc.lwpDeduction;

  // Recalculate totals from final component values
  const grossSalary = basic + hra + da + sa + conveyance + otherAllowances + incentive + otherEarnings;
  const advanceRecovery = calc.salaryAdvanceRecovery; // advance is always from actual advance record
  const totalDeductions = employeePf + esi + professionalTax + tds + lwpDeduction + advanceRecovery + other;
  const netPay = Math.max(0, grossSalary - totalDeductions);
  const totalCtc = grossSalary + (calc.employerPf || 0);

  return {
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
    station: emp.station || 'KARAMBELI',
    workingDaysInMonth: calc.workingDaysInMonth,
    calculatedAttendanceDays: calc.calculatedAttendanceDays,
    adjustedAttendanceDays: overrides.attendanceDays !== undefined ? Number(overrides.attendanceDays) : calc.adjustedAttendanceDays,
    attendance: attendanceDays,
    lwpDays,
    lwpDeduction,
    baseSalary: basic,
    basic,
    salaryOfAttendance: Math.max(0, basic - lwpDeduction),
    hra,
    da,
    sa,
    conveyance,
    otherAllowances,
    incentive,
    otherEarnings,
    employerPf: calc.employerPf || 0,
    totalCtc,
    employeePf,
    esi,
    professionalTax,
    tds,
    advance: advanceRecovery,
    salaryAdvanceRecovery: advanceRecovery,
    advanceOutstandingBalance: calc.advanceOutstandingBalance || 0,
    incomeTax: tds,
    loan: 0,
    other,
    totalDeductions,
    grossSalary,
    netPay,
    amountInWords: `Rupees ${netPay.toLocaleString('en-IN')} Only`
  };
}

// ─── Attendance Summary ──────────────────────────────────────────────────────
/**
 * GET /payslips/attendance-summary?employeeId=X&month=August&year=2026
 * Returns attendance stats from the Attendance collection for HR to review before issuing.
 */
export const getAttendanceSummary = async (req, res) => {
  const { employeeId, month, year } = req.query;
  if (!employeeId || !month || !year) {
    return res.status(400).json({ error: 'employeeId, month, and year are required.' });
  }

  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const monthIdx = MONTH_NAMES.findIndex(m => m.toLowerCase().startsWith(String(month).toLowerCase().trim()));
  if (monthIdx === -1) return res.status(400).json({ error: 'Invalid month.' });

  const yyyy = String(year);
  const mm = String(monthIdx + 1).padStart(2, '0');
  const monthPrefix = `${yyyy}-${mm}`;

  // Calculate total working (Mon-Sat) days in the month
  const totalDaysInMonth = new Date(Number(year), monthIdx + 1, 0).getDate();
  let workingDays = 0;
  for (let d = 1; d <= totalDaysInMonth; d++) {
    if (new Date(Number(year), monthIdx, d).getDay() !== 0) workingDays++;
  }

  let attendedDates = new Set();
  let presentCount = 0;
  try {
    if (mongoose.connection.readyState === 1) {
      const records = await Attendance.find({
        $or: [{ employeeId }, { employeeEmail: employeeId }],
        date: { $regex: `^${monthPrefix}` }
      });
      records.forEach(r => {
        if (r.date) attendedDates.add(r.date);
      });
      presentCount = attendedDates.size;
    }
  } catch (e) {}

  const absentDays = Math.max(0, workingDays - presentCount);

  return res.json({
    employeeId,
    month: MONTH_NAMES[monthIdx],
    year: Number(year),
    workingDays,
    calculatedAttendanceDays: presentCount,
    absentDays,
    lwpDays: absentDays
  });
};

// ─── Preview (no DB save) ────────────────────────────────────────────────────
/**
 * POST /payslips/preview
 * Calculates and returns a payslip breakdown WITHOUT saving to DB.
 * Used by HR to review/edit values before issuing.
 */
export const previewPayslip = async (req, res) => {
  const { employeeId, year = new Date().getFullYear(), month, overrides = {} } = req.body;
  if (!employeeId || !month) return res.status(400).json({ error: 'employeeId and month are required.' });

  let emp = memEmployees.find(e => e.id === employeeId);
  if (!emp && mongoose.connection.readyState === 1) {
    try { emp = await Employee.findOne({ id: employeeId }); } catch (e) {}
  }
  if (!emp) return res.status(404).json({ error: 'Employee not found' });

  const { lwpBasis, approvals, salaryAdvances, attendanceRecords } = await fetchPayrollDependencies(emp, year, month);
  const calc = calculateSalaryForEmployee(emp, Number(year), month, lwpBasis, approvals, null, salaryAdvances, null, attendanceRecords);
  const preview = applyOverridesAndBuild(emp, calc, overrides);

  return res.json({ preview });
};

// ─── Generate (issue) ────────────────────────────────────────────────────────
/**
 * POST /payslips/generate-auto
 * Issues a payslip. Accepts optional HR overrides for salary components and attendance.
 * Returns 409 if payslip for this employee+month already exists.
 */
export const generateAutoPayslip = async (req, res) => {
  const { employeeId, year = new Date().getFullYear(), month, overrides = {} } = req.body;
  if (!employeeId || !month) return res.status(400).json({ error: 'employeeId and month are required.' });

  let emp = memEmployees.find(e => e.id === employeeId);
  if (!emp && mongoose.connection.readyState === 1) {
    try { emp = await Employee.findOne({ id: employeeId }); } catch (e) {}
  }
  if (!emp) return res.status(404).json({ error: 'Employee not found' });

  const { lwpBasis, approvals, salaryAdvances, attendanceRecords } = await fetchPayrollDependencies(emp, year, month);
  const calc = calculateSalaryForEmployee(emp, Number(year), month, lwpBasis, approvals, null, salaryAdvances, null, attendanceRecords);
  const payslipData = applyOverridesAndBuild(emp, calc, overrides);

  const payslipId = `PAY-${year}-${String(month).toUpperCase()}-${emp.id}`;
  payslipData.id = payslipId;
  payslipData.serialNo = `${Math.floor(10000 + Math.random() * 90000)}`;
  payslipData.disbursementStatus = 'pending_disbursement';
  payslipData.emailStatus = 'pending';

  // ── Duplicate prevention ─────────────────────────────────────────────────
  // Check DB first
  if (mongoose.connection.readyState === 1) {
    try {
      const existing = await Payslip.findOne({ employeeId: emp.id, payPeriod: payslipData.payPeriod });
      if (existing) {
        return res.status(409).json({
          error: `A payslip for ${emp.name} (${payslipData.payPeriod}) already exists. To re-issue, please delete the existing payslip first.`,
          existingPayslipId: existing.id
        });
      }
    } catch (e) {}
  }
  // Check memory
  const existingMem = memPayslips.find(p => p.employeeId === emp.id && p.payPeriod === payslipData.payPeriod);
  if (existingMem) {
    return res.status(409).json({
      error: `A payslip for ${emp.name} (${payslipData.payPeriod}) already exists.`,
      existingPayslipId: existingMem.id
    });
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  try {
    if (mongoose.connection.readyState === 1) {
      await Payslip.create(payslipData);
    }
  } catch (e) {
    // Handle duplicate key error from unique index
    if (e.code === 11000) {
      return res.status(409).json({
        error: `A payslip for ${emp.name} (${payslipData.payPeriod}) already exists.`
      });
    }
    console.error('Error saving payslip:', e);
  }

  memPayslips.unshift(payslipData);
  saveDiskStore();

  // Notify
  sendPayslipEmail(payslipData, emp.assignedHrEmail || '').catch(err => console.error('Payslip email error:', err));
  await createNotification({ targetRole: 'Employee', recipientEmail: emp.email, title: 'Payslip Issued 📄', message: `Your payslip for ${payslipData.payPeriod} has been generated. Net Pay: ₹${payslipData.netPay.toLocaleString('en-IN')}.`, type: 'payslip' });

  return res.status(201).json({ message: 'Payslip generated successfully', payslip: payslipData });
};

// ─── (Legacy) generatePayslip — redirects to generateAutoPayslip ─────────────
export const generatePayslip = async (req, res) => {
  const { employeeId, payPeriod, attendance, customLwpDays, esi, advance, incomeTax, loan, other } = req.body;
  // Parse the payPeriod string (e.g. "August 2026") to month/year
  const parts = String(payPeriod || '').split(' ');
  const month = parts[0] || 'August';
  const year = parts[1] ? Number(parts[1]) : new Date().getFullYear();

  const overrides = {};
  if (attendance !== undefined && attendance !== null && attendance !== '') overrides.attendanceDays = Number(attendance);
  if (customLwpDays !== undefined && customLwpDays !== null && customLwpDays !== '') overrides.lwpDays = Number(customLwpDays);
  if (esi !== undefined) overrides.esi = Number(esi) || 0;
  if (advance !== undefined) overrides.advance = Number(advance) || 0;
  if (incomeTax !== undefined) overrides.tds = Number(incomeTax) || 0;
  if (loan !== undefined) overrides.loan = Number(loan) || 0;
  if (other !== undefined) overrides.other = Number(other) || 0;

  req.body = { employeeId, year, month, overrides };
  return generateAutoPayslip(req, res);
};

// ─── Get Payslips ────────────────────────────────────────────────────────────
export const getEmployeePayslips = async (req, res) => {
  const rawId = req.params.employeeId || req.params[0];
  const employeeId = rawId ? decodeURIComponent(rawId.replace(/^\/+/, '')) : '';
  try {
    if (mongoose.connection.readyState === 1) {
      const list = await Payslip.find({ $or: [{ employeeId }, { employeeEmail: employeeId }] }).sort({ createdAt: -1 });
      if (list.length > 0) return res.json(list);
    }
  } catch (e) {}
  res.json(memPayslips.filter(p => p.employeeId === employeeId || p.employeeEmail === employeeId));
};

export const getPayslips = async (req, res) => {
  const { employeeId } = req.query;
  const requestingRole = req.user?.userRole;
  const requestingId = req.user?.id;
  const requestingEmail = req.user?.email;
  const isHrOrAdmin = requestingRole === 'Admin' || requestingRole === 'HR';

  try {
    if (mongoose.connection.readyState === 1) {
      let query;
      if (isHrOrAdmin) {
        query = employeeId ? { $or: [{ employeeId }, { employeeEmail: employeeId }] } : {};
      } else {
        query = { $or: [{ employeeId: requestingId }, { employeeEmail: requestingEmail }] };
      }
      return res.json(await Payslip.find(query).sort({ createdAt: -1 }));
    }
  } catch (e) {}

  let list = [...memPayslips];
  if (isHrOrAdmin) {
    if (employeeId) list = list.filter(p => p.employeeId === employeeId || p.employeeEmail === employeeId);
  } else {
    list = list.filter(p => p.employeeId === requestingId || p.employeeEmail === requestingEmail);
  }
  res.json(list);
};

// ─── Mark Payslip Paid ───────────────────────────────────────────────────────
export const markPayslipPaid = async (req, res) => {
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
      slip.markedPaidAt = now;
      slip.scheduledDispatchTime = scheduledTime;
      slip.emailStatus = immediate ? 'sent' : 'scheduled';
      if (immediate) slip.sentAt = now;
      updatedPayslip = slip;
      saveDiskStore();
    }
  }

  if (!updatedPayslip) return res.status(404).json({ error: 'Payslip not found' });
  if (immediate) sendDelayedPayslipDisbursementEmail(updatedPayslip).catch(e => console.error('Payslip email error:', e));

  // Settle salary advance installment on mark-paid
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
      console.error('Error settling advance installment:', err);
    }
  }

  await createNotification({ targetRole: 'HR', title: 'Salary Disbursement Marked 💳', message: immediate ? `Salary for ${updatedPayslip.employeeName} paid & emailed.` : `Salary for ${updatedPayslip.employeeName} marked as paid. Email in ${delayHours}h.`, type: 'payslip' });
  res.json({ message: immediate ? 'Paid and dispatched.' : `Paid. Email in ${delayHours}h.`, payslip: updatedPayslip });
};
