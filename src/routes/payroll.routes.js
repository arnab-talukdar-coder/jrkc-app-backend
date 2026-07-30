import express from 'express';
import { Payslip } from '../models/Payslip.js';
import { User } from '../models/User.js';
import { AttendanceLog } from '../models/AttendanceLog.js';
import { Leave } from '../models/Leave.js';
import { Holiday } from '../models/Holiday.js';
import { Notification } from '../models/Notification.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { calculatePayslip, calculateLWP, getWorkingDaysInMonth } from '../services/payrollCalculator.js';
import { sendPayslipEmail } from '../services/emailService.js';

const router = express.Router();

const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

// ── POST /api/v2/payroll/generate  (HR: auto-generate payslips for a month) ─
router.post('/generate', authenticateToken, requireRole('HR', 'Director'), async (req, res) => {
  try {
    const { month, year } = req.body;  // month: 1-12, year: 2026
    if (!month || !year) return res.status(400).json({ error: 'Month and year are required.' });

    const monthIdx = Number(month) - 1;
    const yr = Number(year);
    const monthName = MONTH_NAMES[monthIdx];
    const payPeriod = `${monthName} ${yr}`;
    const workingDays = getWorkingDaysInMonth(yr, monthIdx);

    // Get all approved employees
    const employees = await User.find({ accountStatus: 'approved', userRole: 'Employee', salaryApproved: true })
      .select('name email department designation idCardNo station salaryStructure');

    // Get all holidays in this month
    const mm = String(month).padStart(2, '0');
    const holidays = await Holiday.find({ date: new RegExp(`^${yr}-${mm}`) });

    const results = [];
    const errors = [];

    for (const emp of employees) {
      try {
        // Check if payslip already exists
        const existing = await Payslip.findOne({ userIdStr: emp._id.toString(), month: monthName, year: yr });
        if (existing) {
          errors.push({ employee: emp.name, error: 'Payslip already exists for this period.' });
          continue;
        }

        // Get attendance logs
        const attendanceLogs = await AttendanceLog.find({
          userIdStr: emp._id.toString(),
          date: new RegExp(`^${yr}-${mm}`)
        });

        // Get approved leaves
        const approvedLeaves = await Leave.find({
          userIdStr: emp._id.toString(),
          status: 'approved',
          $or: [
            { startDate: new RegExp(`^${yr}-${mm}`) },
            { endDate: new RegExp(`^${yr}-${mm}`) },
          ]
        });

        // Calculate LWP
        const { lwpDays, presentDays } = calculateLWP(yr, monthIdx, attendanceLogs, approvedLeaves, holidays);

        // Count extra (Sunday) working days
        const extraDays = attendanceLogs.filter(l => l.isExtraDay && l.status === 'complete').length;

        // Calculate payslip
        const calc = calculatePayslip(
          emp.salaryStructure,
          presentDays,
          lwpDays,
          workingDays,
          extraDays
        );

        const payslip = await Payslip.create({
          userId: emp._id,
          userIdStr: emp._id.toString(),
          employeeName: emp.name,
          employeeEmail: emp.email,
          department: emp.department,
          designation: emp.designation,
          idCardNo: emp.idCardNo,
          station: emp.station,
          payPeriod,
          month: monthName,
          year: yr,
          workingDaysInMonth: workingDays,
          presentDays,
          lwpDays,
          lwpDeduction: calc.lwpDeduction,
          extraDays,
          ...calc,
          generatedBy: req.user.id,
          generatedByName: req.user.name,
          disbursementStatus: 'draft',
        });

        results.push({ employee: emp.name, payslipId: payslip._id, netPay: calc.netPay });
      } catch (empErr) {
        errors.push({ employee: emp.name, error: empErr.message });
      }
    }

    res.json({
      message: `Payroll generated for ${payPeriod}.`,
      generated: results.length,
      errors: errors.length,
      results,
      errors,
    });
  } catch (err) {
    console.error('Generate payroll error:', err);
    res.status(500).json({ error: 'Payroll generation failed.' });
  }
});

// ── GET /api/v2/payroll/payslips  (HR/Director: list all payslips) ─────────
router.get('/payslips', authenticateToken, requireRole('HR', 'Director'), async (req, res) => {
  try {
    const { month, year, status, userId } = req.query;
    const filter = {};
    if (month && year) { filter.month = MONTH_NAMES[Number(month) - 1]; filter.year = Number(year); }
    if (status) filter.disbursementStatus = status;
    if (userId) filter.userIdStr = userId;

    const payslips = await Payslip.find(filter).sort({ createdAt: -1 }).limit(500);
    res.json(payslips);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch payslips.' });
  }
});

// ── GET /api/v2/payroll/my  (Employee: own payslips) ──────────────────────
router.get('/my', authenticateToken, async (req, res) => {
  try {
    const payslips = await Payslip.find({ userIdStr: req.user.id, disbursementStatus: 'disbursed' })
      .sort({ year: -1, createdAt: -1 });
    res.json(payslips);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch payslips.' });
  }
});

// ── POST /api/v2/payroll/:id/disburse  (HR: disburse → email employee) ─────
router.post('/:id/disburse', authenticateToken, requireRole('HR', 'Director'), async (req, res) => {
  try {
    const payslip = await Payslip.findById(req.params.id);
    if (!payslip) return res.status(404).json({ error: 'Payslip not found.' });
    if (payslip.disbursementStatus === 'disbursed') {
      return res.status(400).json({ error: 'Payslip already disbursed.' });
    }

    payslip.disbursementStatus = 'disbursed';
    payslip.disbursedBy = req.user.id;
    payslip.disbursedAt = new Date();
    payslip.payDate = new Date().toLocaleDateString('en-IN');
    await payslip.save();

    // Send payslip email
    const employee = await User.findById(payslip.userId).select('email name');
    if (employee) {
      sendPayslipEmail(employee, payslip, null)
        .catch(e => console.error('Payslip email error:', e.message));

      await Notification.create({
        targetUserId: payslip.userIdStr,
        targetRole: 'Employee',
        title: `Payslip Disbursed — ${payslip.payPeriod}`,
        message: `Your salary of ₹${payslip.netPay?.toLocaleString('en-IN')} for ${payslip.payPeriod} has been processed.`,
        type: 'payslip',
        refId: payslip._id.toString(),
      });
    }

    res.json({ message: 'Payslip disbursed and email sent.', payslip });
  } catch (err) {
    res.status(500).json({ error: 'Disbursement failed.' });
  }
});

// ── GET /api/v2/payroll/:id  (Get single payslip) ─────────────────────────
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const payslip = await Payslip.findById(req.params.id);
    if (!payslip) return res.status(404).json({ error: 'Payslip not found.' });

    // Employee can only see their own
    if (req.user.userRole === 'Employee' && payslip.userIdStr !== req.user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    res.json(payslip);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch payslip.' });
  }
});

export default router;
