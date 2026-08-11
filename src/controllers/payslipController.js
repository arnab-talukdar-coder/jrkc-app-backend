import mongoose from 'mongoose';
import { Employee } from '../models/Employee.js';
import { Payslip } from '../models/Payslip.js';
import { HRSettings } from '../models/HRSettings.js';
import { Approval } from '../models/Approval.js';
import { SalaryAdvance } from '../models/SalaryAdvance.js';
import { memEmployees, memPayslips, memApprovals, memSalaryAdvances, memNotifications, saveDiskStore } from '../data/store.js';
import { calculateSalaryForEmployee } from '../services/payrollService.js';
import { sendPayslipEmail, sendDelayedPayslipDisbursementEmail } from '../services/emailService.js';
import { createNotification } from '../services/notificationService.js';

export const generateAutoPayslip = async (req, res) => {
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
};

export const generatePayslip = async (req, res) => {
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
};

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
};
