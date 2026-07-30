import express from 'express';
import { Leave } from '../models/Leave.js';
import { User } from '../models/User.js';
import { Notification } from '../models/Notification.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { sendLeaveSubmittedEmail, sendLeaveStatusEmail } from '../services/emailService.js';

const router = express.Router();

// ── POST /api/v2/leaves  (Employee: apply leave) ──────────────────────────
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { leaveType, startDate, endDate, reason } = req.body;
    if (!leaveType || !startDate || !endDate) {
      return res.status(400).json({ error: 'Leave type, start date and end date are required.' });
    }

    const user = await User.findById(req.user.id).select('name department earnedLeave sickLeave casualLeave optionalLeave email');
    if (!user) return res.status(404).json({ error: 'User not found.' });

    // Calculate working days (Mon–Sat)
    const totalDays = countWorkingDays(new Date(startDate), new Date(endDate));
    if (totalDays <= 0) return res.status(400).json({ error: 'Selected dates have no working days.' });

    // Check leave balance
    const balanceError = checkLeaveBalance(user, leaveType, totalDays);
    if (balanceError) return res.status(400).json({ error: balanceError });

    // Check for overlapping leaves
    const overlap = await Leave.findOne({
      userIdStr: req.user.id,
      status: { $in: ['pending_hr', 'pending_director', 'approved'] },
      $or: [
        { startDate: { $lte: endDate }, endDate: { $gte: startDate } }
      ]
    });
    if (overlap) return res.status(400).json({ error: 'You already have an active leave request for overlapping dates.' });

    const leave = await Leave.create({
      userId: req.user.id,
      userIdStr: req.user.id,
      userName: user.name,
      department: user.department,
      leaveType,
      startDate,
      endDate,
      totalDays,
      reason: reason || '',
      status: 'pending_hr',
    });

    // Send confirmation email
    sendLeaveSubmittedEmail(user, leave).catch(e => console.error('Leave email error:', e.message));

    // Notify HR
    const hrs = await User.find({ userRole: 'HR', accountStatus: 'approved' }).select('_id');
    for (const hr of hrs) {
      await Notification.create({
        targetUserId: hr._id.toString(),
        targetRole: 'HR',
        title: 'Leave Request',
        message: `${user.name} applied for ${leaveType} (${totalDays} day${totalDays > 1 ? 's' : ''}) from ${startDate} to ${endDate}.`,
        type: 'leave_request',
        refId: leave._id.toString(),
      });
    }

    res.status(201).json({ message: 'Leave request submitted.', leave });
  } catch (err) {
    console.error('Apply leave error:', err);
    res.status(500).json({ error: 'Failed to submit leave request.' });
  }
});

// ── GET /api/v2/leaves/my  (Employee: own leaves) ─────────────────────────
router.get('/my', authenticateToken, async (req, res) => {
  try {
    const { status, year } = req.query;
    const filter = { userIdStr: req.user.id };
    if (status) filter.status = status;
    if (year) {
      filter.$or = [
        { startDate: new RegExp(`^${year}`) },
        { endDate: new RegExp(`^${year}`) },
      ];
    }
    const leaves = await Leave.find(filter).sort({ createdAt: -1 });
    res.json(leaves);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch leaves.' });
  }
});

// ── GET /api/v2/leaves  (HR/Director: all leaves) ─────────────────────────
router.get('/', authenticateToken, requireRole('HR', 'Director'), async (req, res) => {
  try {
    const { status, userId, month, year } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (userId) filter.userIdStr = userId;
    if (month && year) {
      const mm = String(month).padStart(2, '0');
      filter.$or = [
        { startDate: new RegExp(`^${year}-${mm}`) },
        { endDate: new RegExp(`^${year}-${mm}`) },
      ];
    }

    const leaves = await Leave.find(filter).sort({ createdAt: -1 }).limit(500);
    res.json(leaves);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch leaves.' });
  }
});

// ── PATCH /api/v2/leaves/:id/hr-action  (HR: approve/reject) ──────────────
router.patch('/:id/hr-action', authenticateToken, requireRole('HR'), async (req, res) => {
  try {
    const { action, remarks } = req.body;
    if (!['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ error: 'Action must be "approved" or "rejected".' });
    }

    const leave = await Leave.findById(req.params.id);
    if (!leave) return res.status(404).json({ error: 'Leave not found.' });
    if (leave.status !== 'pending_hr') {
      return res.status(400).json({ error: 'This leave is not pending HR review.' });
    }

    leave.hrReviewedBy = req.user.id;
    leave.hrReviewedAt = new Date();
    leave.hrAction = action;
    leave.hrRemarks = remarks || '';

    if (action === 'approved') {
      // Forward to Director for final approval
      leave.status = 'pending_director';

      // Notify Director
      await Notification.create({
        targetRole: 'Director',
        title: 'Leave Pending Your Approval',
        message: `HR approved ${leave.userName}'s ${leave.leaveType} request. Final approval required.`,
        type: 'leave_request',
        refId: leave._id.toString(),
      });
    } else {
      leave.status = 'rejected';
      leave.directorRemarks = remarks || '';

      // Notify employee
      const employee = await User.findById(leave.userId).select('email name');
      if (employee) {
        sendLeaveStatusEmail(employee, leave).catch(() => {});
        await Notification.create({
          targetUserId: leave.userIdStr,
          targetRole: 'Employee',
          title: 'Leave Request Rejected',
          message: `Your ${leave.leaveType} request (${leave.startDate} to ${leave.endDate}) has been rejected by HR.`,
          type: 'leave_rejected',
          refId: leave._id.toString(),
        });
      }
    }

    await leave.save();
    res.json({ message: `Leave ${action}.`, leave });
  } catch (err) {
    res.status(500).json({ error: 'HR action failed.' });
  }
});

// ── PATCH /api/v2/leaves/:id/director-action  (Director: final approve/reject) ──
router.patch('/:id/director-action', authenticateToken, requireRole('Director'), async (req, res) => {
  try {
    const { action, remarks } = req.body;
    if (!['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ error: 'Action must be "approved" or "rejected".' });
    }

    const leave = await Leave.findById(req.params.id);
    if (!leave) return res.status(404).json({ error: 'Leave not found.' });
    if (leave.status !== 'pending_director') {
      return res.status(400).json({ error: 'This leave is not pending Director review.' });
    }

    leave.directorReviewedBy = req.user.id;
    leave.directorReviewedAt = new Date();
    leave.directorAction = action;
    leave.directorRemarks = remarks || '';
    leave.status = action;  // 'approved' or 'rejected'

    await leave.save();

    // Notify employee
    const employee = await User.findById(leave.userId).select('email name');
    if (employee) {
      sendLeaveStatusEmail(employee, leave).catch(() => {});
      await Notification.create({
        targetUserId: leave.userIdStr,
        targetRole: 'Employee',
        title: `Leave ${action === 'approved' ? 'Approved' : 'Rejected'}`,
        message: `Your ${leave.leaveType} (${leave.startDate} to ${leave.endDate}) has been ${action} by Director.`,
        type: action === 'approved' ? 'leave_approved' : 'leave_rejected',
        refId: leave._id.toString(),
      });
    }

    res.json({ message: `Leave ${action} by Director.`, leave });
  } catch (err) {
    res.status(500).json({ error: 'Director action failed.' });
  }
});

// ── DELETE /api/v2/leaves/:id  (Employee: cancel pending request) ──────────
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const leave = await Leave.findOne({ _id: req.params.id, userIdStr: req.user.id });
    if (!leave) return res.status(404).json({ error: 'Leave not found.' });
    if (!['pending_hr', 'pending_director'].includes(leave.status)) {
      return res.status(400).json({ error: 'Only pending leaves can be cancelled.' });
    }
    leave.status = 'cancelled';
    leave.cancelledAt = new Date();
    await leave.save();
    res.json({ message: 'Leave request cancelled.' });
  } catch (err) {
    res.status(500).json({ error: 'Cancellation failed.' });
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────

function countWorkingDays(startDate, endDate) {
  let count = 0;
  const current = new Date(startDate);
  while (current <= endDate) {
    if (current.getDay() !== 0) count++;  // Skip Sunday
    current.setDate(current.getDate() + 1);
  }
  return count;
}

function checkLeaveBalance(user, leaveType, days) {
  const map = {
    'Earned Leave':   { field: 'earnedLeave' },
    'Sick Leave':     { field: 'sickLeave' },
    'Casual Leave':   { field: 'casualLeave' },
    'Optional Leave': { field: 'optionalLeave' },
    'LWP':            null,  // No balance needed
  };

  const entry = map[leaveType];
  if (!entry) return null;  // LWP — no balance check

  const available = user[entry.field] || 0;
  if (days > available) {
    return `Insufficient ${leaveType} balance. Available: ${available} day${available !== 1 ? 's' : ''}.`;
  }
  return null;
}

export default router;
