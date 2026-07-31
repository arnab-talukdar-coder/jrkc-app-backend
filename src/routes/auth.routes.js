import express from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { RegistrationRequest } from '../models/RegistrationRequest.js';
import { Notification } from '../models/Notification.js';
import { generateToken, authenticateToken, validateEmail, sanitizeString } from '../middleware/auth.js';
import { sendWelcomeEmail, sendNewRegistrationAlert } from '../services/emailService.js';

const router = express.Router();

// ── POST /api/v2/auth/register ─────────────────────────────────────────────
// Public. Creates a RegistrationRequest (not a User yet).
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, department, designation, requestedRole, roleKey, password } = req.body;

    if (!name || !email) return res.status(400).json({ error: 'Name and email are required.' });
    if (!validateEmail(email)) return res.status(400).json({ error: 'Invalid email address.' });

    const cleanEmail = email.toLowerCase().trim();

    // Check for existing user
    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) return res.status(409).json({ error: 'An account with this email already exists.' });

    // Check for pending request
    const existingReq = await RegistrationRequest.findOne({ email: cleanEmail, status: { $in: ['pending_hr', 'pending_director'] } });
    if (existingReq) return res.status(409).json({ error: 'A registration request is already pending for this email.' });

    // Validate role key & password for Director / HR
    const normalizedRole = requestedRole || 'Employee';
    if (normalizedRole === 'Director') {
      if (roleKey !== (process.env.DIRECTOR_REGISTRATION_KEY || 'JRKC-DIRECTOR-2026')) {
        return res.status(403).json({ error: 'Invalid Director registration key.' });
      }
      if (!password || password.length < 8) {
        return res.status(400).json({ error: 'Password is required and must be at least 8 characters.' });
      }
    }
    if (normalizedRole === 'HR') {
      if (roleKey !== (process.env.HR_REGISTRATION_KEY || 'JRKC-HR-2026')) {
        return res.status(403).json({ error: 'Invalid HR registration key.' });
      }
      if (!password || password.length < 8) {
        return res.status(400).json({ error: 'Password is required and must be at least 8 characters.' });
      }
    }

    // Auto-approve Director and HR roles since valid secret registration key was verified
    if (normalizedRole === 'Director' || normalizedRole === 'HR') {
      const idCardNo = `JRKCRIPL/${normalizedRole.toUpperCase().substring(0, 3)}/${Math.floor(100 + Math.random() * 900)}`;
      const joiningDate = new Date().toLocaleDateString('en-IN');

      const newUser = await User.create({
        name: sanitizeString(name),
        email: cleanEmail,
        phone: phone || '',
        department: sanitizeString(department) || '',
        designation: sanitizeString(designation) || '',
        userRole: normalizedRole,
        password,
        mustChangePassword: false,
        accountStatus: 'approved',
        idCardNo,
        joiningDate,
      });

      await RegistrationRequest.create({
        name: sanitizeString(name),
        email: cleanEmail,
        phone: phone || '',
        department: sanitizeString(department) || '',
        designation: sanitizeString(designation) || '',
        requestedRole: normalizedRole,
        status: 'approved',
        directorApprovedAt: new Date(),
        createdUserId: newUser._id.toString(),
      });

      return res.status(201).json({
        message: `${normalizedRole} account created and approved automatically! You can log in now.`,
        id: newUser._id,
        autoApproved: true,
      });
    }

    // Find an HR to assign (for Employee requests)
    let assignedHrId = '', assignedHrName = '';
    if (normalizedRole === 'Employee') {
      const hr = await User.findOne({ userRole: 'HR', accountStatus: 'approved' }).select('_id name email');
      if (hr) {
        assignedHrId = hr._id.toString();
        assignedHrName = hr.name;
      }
    }

    const regRequest = await RegistrationRequest.create({
      name: sanitizeString(name),
      email: cleanEmail,
      phone: phone || '',
      department: sanitizeString(department) || '',
      designation: sanitizeString(designation) || '',
      requestedRole: normalizedRole,
      assignedHrId,
      assignedHrName,
      status: 'pending_hr',
    });

    // Send welcome email to applicant
    sendWelcomeEmail({ name: regRequest.name, email: regRequest.email, designation: regRequest.designation, department: regRequest.department })
      .catch(e => console.error('Welcome email error:', e.message));

    // Alert HR (for employee registrations)
    if (assignedHrId) {
      const hrUser = await User.findById(assignedHrId).select('email');
      if (hrUser) {
        sendNewRegistrationAlert(hrUser.email, regRequest)
          .catch(e => console.error('HR alert email error:', e.message));
      }
    }

    // Create notification for HR
    await Notification.create({
      targetRole: 'HR',
      title: 'New Registration Request',
      message: `${regRequest.name} (${normalizedRole}) has submitted a registration request.`,
      type: 'registration',
      refId: regRequest._id.toString(),
    });

    res.status(201).json({
      message: 'Registration submitted. You will receive login credentials via email after approval.',
      id: regRequest._id,
      autoApproved: false,
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// ── POST /api/v2/auth/login ────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

    if (user.accountStatus !== 'approved') {
      if (user.accountStatus === 'pending_hr' || user.accountStatus === 'pending_director') {
        return res.status(403).json({ error: 'Your account is pending approval. You will receive login credentials via email.' });
      }
      return res.status(403).json({ error: 'Your account has been rejected. Please contact HR.' });
    }

    const valid = await user.comparePassword(password);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });

    const token = generateToken({
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      userRole: user.userRole,
    });

    res.json({
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        userRole: user.userRole,
        department: user.department,
        designation: user.designation,
        avatar: user.avatar,
        mustChangePassword: user.mustChangePassword,
        accountStatus: user.accountStatus,
        clockStatus: user.clockStatus,
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ── POST /api/v2/auth/change-password ────────────────────────────────────
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new passwords are required.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const valid = await user.comparePassword(currentPassword);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect.' });

    user.password = newPassword;
    user.mustChangePassword = false;
    await user.save();

    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Password change failed.' });
  }
});

// ── GET /api/v2/auth/me ───────────────────────────────────────────────────
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile.' });
  }
});

export default router;
