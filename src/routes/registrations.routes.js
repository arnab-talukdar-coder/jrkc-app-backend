import express from 'express';
import { User } from '../models/User.js';
import { RegistrationRequest } from '../models/RegistrationRequest.js';
import { Notification } from '../models/Notification.js';
import { authenticateToken, requireRole, generateToken, sanitizeString } from '../middleware/auth.js';
import { sendApprovalWithCredentials, sendRejectionEmail } from '../services/emailService.js';
import crypto from 'crypto';

const router = express.Router();

// ── GET /api/v2/registrations  (HR and Director) ──────────────────────────
router.get('/', authenticateToken, requireRole('HR', 'Director'), async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};

    // HR only sees their assigned requests
    if (req.user.userRole === 'HR') {
      filter.assignedHrId = req.user.id;
      filter.status = status || 'pending_hr';
    } else {
      // Director sees all, or filter by status
      if (status) filter.status = status;
    }

    const requests = await RegistrationRequest.find(filter).sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch registration requests.' });
  }
});

// ── POST /api/v2/registrations/:id/approve  (HR: forward to director; Director: create user) ──
router.post('/:id/approve', authenticateToken, requireRole('HR', 'Director'), async (req, res) => {
  try {
    const request = await RegistrationRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ error: 'Registration request not found.' });

    if (request.status === 'approved') return res.status(400).json({ error: 'Already approved.' });

    // HR approves an Employee request → forward to Director
    if (req.user.userRole === 'HR') {
      if (request.status !== 'pending_hr') {
        return res.status(400).json({ error: 'This request is not pending HR review.' });
      }
      request.status = 'pending_director';
      request.hrReviewedBy = req.user.id;
      request.hrReviewedAt = new Date();
      await request.save();

      // Notify Director
      await Notification.create({
        targetRole: 'Director',
        title: 'Registration Pending Your Approval',
        message: `HR has approved ${request.name}'s registration. Final approval required.`,
        type: 'registration',
        refId: request._id.toString(),
      });

      return res.json({ message: 'Forwarded to Director for final approval.', request });
    }

    // Director gives final approval → create the user account
    if (req.user.userRole === 'Director') {
      if (request.status !== 'pending_director' && request.status !== 'pending_hr') {
        return res.status(400).json({ error: 'This request is not pending Director review.' });
      }

      // Check for duplicate email
      const existingUser = await User.findOne({ email: request.email });
      if (existingUser) return res.status(409).json({ error: 'A user with this email already exists.' });

      // Password assignment (uses custom password if chosen during HR/Director registration)
      const userPassword = request.customPassword || (crypto.randomBytes(5).toString('hex').toUpperCase() + '!');
      const mustChangePassword = !request.customPassword;

      // Find HR to assign
      let assignedHr = null;
      if (request.requestedRole === 'Employee') {
        if (request.assignedHrId) {
          assignedHr = await User.findById(request.assignedHrId).select('name email');
        }
        if (!assignedHr) {
          assignedHr = await User.findOne({ userRole: 'HR', accountStatus: 'approved' }).select('name email');
        }
      }

      const idCardNo = `JRKCRIPL/${Math.floor(100 + Math.random() * 900)}`;
      const joiningDate = new Date().toLocaleDateString('en-IN');

      const newUser = await User.create({
        name: request.name,
        email: request.email,
        phone: request.phone,
        department: request.department,
        designation: request.designation,
        userRole: request.requestedRole,
        password: userPassword,
        mustChangePassword,
        accountStatus: 'approved',
        idCardNo,
        joiningDate,
        assignedHrId:    assignedHr?._id?.toString() || '',
        assignedHrName:  assignedHr?.name || '',
        assignedHrEmail: assignedHr?.email || '',
      });

      // Update request
      request.status = 'approved';
      request.directorApprovedBy = req.user.id;
      request.directorApprovedAt = new Date();
      request.createdUserId = newUser._id.toString();
      await request.save();

      // Send credentials email
      sendApprovalWithCredentials(newUser, tempPassword)
        .catch(e => console.error('Approval email error:', e.message));

      // Notify HR
      if (assignedHr) {
        await Notification.create({
          targetUserId: assignedHr._id.toString(),
          targetRole: 'HR',
          title: 'New Employee Approved',
          message: `${newUser.name} has been approved. Please configure their salary structure.`,
          type: 'registration',
          refId: newUser._id.toString(),
        });
      }

      return res.json({
        message: 'Registration approved. Employee account created and credentials sent via email.',
        userId: newUser._id,
      });
    }
  } catch (err) {
    console.error('Approve registration error:', err);
    res.status(500).json({ error: 'Approval failed.' });
  }
});

// ── POST /api/v2/registrations/:id/reject ─────────────────────────────────
router.post('/:id/reject', authenticateToken, requireRole('HR', 'Director'), async (req, res) => {
  try {
    const { reason } = req.body;
    const request = await RegistrationRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ error: 'Registration request not found.' });

    request.status = 'rejected';
    request.rejectedBy = req.user.id;
    request.rejectedAt = new Date();
    request.rejectionReason = reason || '';
    await request.save();

    sendRejectionEmail({ name: request.name, email: request.email }, reason)
      .catch(e => console.error('Rejection email error:', e.message));

    res.json({ message: 'Registration request rejected.' });
  } catch (err) {
    res.status(500).json({ error: 'Rejection failed.' });
  }
});

export default router;
