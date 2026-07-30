import express from 'express';
import { User } from '../models/User.js';
import { authenticateToken, requireRole, sanitizeString } from '../middleware/auth.js';

const router = express.Router();

// ── GET /api/v2/users  (HR/Director: list all approved employees) ──────────
router.get('/', authenticateToken, requireRole('HR', 'Director'), async (req, res) => {
  try {
    const { department, search, role } = req.query;
    const filter = { accountStatus: 'approved' };

    if (department && department !== 'All') filter.department = new RegExp(`^${department}$`, 'i');
    if (role && role !== 'All') filter.userRole = role;
    if (search) {
      const q = search.toString();
      filter.$or = [
        { name: new RegExp(q, 'i') },
        { email: new RegExp(q, 'i') },
        { designation: new RegExp(q, 'i') },
        { department: new RegExp(q, 'i') },
      ];
    }

    // HR only sees their assigned employees
    if (req.user.userRole === 'HR') {
      filter.$or = filter.$or || undefined;
      // Don't restrict for HR — they need to see all employees they manage
    }

    const users = await User.find(filter).select('-password').sort({ name: 1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users.' });
  }
});

// ── GET /api/v2/users/me  (own profile) ───────────────────────────────────
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile.' });
  }
});

// ── PATCH /api/v2/users/me  (update own profile) ──────────────────────────
router.patch('/me', authenticateToken, async (req, res) => {
  try {
    const allowed = ['phone', 'dateOfBirth', 'bloodGroup', 'fcmToken'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = sanitizeString(req.body[key]);
    }

    const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true }).select('-password');
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Profile update failed.' });
  }
});

// ── GET /api/v2/users/:id  (HR/Director: specific employee) ───────────────
router.get('/:id', authenticateToken, requireRole('HR', 'Director'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user.' });
  }
});

// ── PATCH /api/v2/users/:id  (HR: update employee info) ───────────────────
router.patch('/:id', authenticateToken, requireRole('HR', 'Director'), async (req, res) => {
  try {
    const allowed = ['phone', 'department', 'designation', 'dateOfBirth', 'bloodGroup',
                     'station', 'validity', 'idCardNo', 'joiningDate', 'assignedHrId',
                     'assignedHrName', 'assignedHrEmail'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = sanitizeString(String(req.body[key]));
    }

    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Update failed.' });
  }
});

// ── POST /api/v2/users/me/photo-request  (employee submits photo) ─────────
router.post('/me/photo-request', authenticateToken, async (req, res) => {
  try {
    const { avatarUrl } = req.body;
    if (!avatarUrl) return res.status(400).json({ error: 'Avatar URL is required.' });

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { pendingAvatar: avatarUrl, photoStatus: 'pending' },
      { new: true }
    ).select('-password');

    // TODO: notify HR

    res.json({ message: 'Photo submitted for HR approval.', user });
  } catch (err) {
    res.status(500).json({ error: 'Photo request failed.' });
  }
});

// ── POST /api/v2/users/:id/approve-photo  (HR approves/rejects photo) ─────
router.post('/:id/approve-photo', authenticateToken, requireRole('HR', 'Director'), async (req, res) => {
  try {
    const { action } = req.body;  // 'approve' | 'reject'
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    if (action === 'approve') {
      user.avatar = user.pendingAvatar;
      user.pendingAvatar = '';
      user.photoStatus = 'approved';
    } else {
      user.pendingAvatar = '';
      user.photoStatus = 'rejected';
    }
    await user.save();

    res.json({ message: `Photo ${action === 'approve' ? 'approved' : 'rejected'}.` });
  } catch (err) {
    res.status(500).json({ error: 'Photo action failed.' });
  }
});

// ── PATCH /api/v2/users/:id/geofence  (Director: assign GPS location) ─────
router.patch('/:id/geofence', authenticateToken, requireRole('Director'), async (req, res) => {
  try {
    const { latitude, longitude, address, geofenceRadius } = req.body;
    if (!latitude || !longitude) return res.status(400).json({ error: 'Latitude and longitude required.' });

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { assignedLocation: { latitude: Number(latitude), longitude: Number(longitude), address: address || '', geofenceRadius: Number(geofenceRadius) || 100 } },
      { new: true }
    ).select('-password');

    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ message: 'Geofence assigned.', user });
  } catch (err) {
    res.status(500).json({ error: 'Geofence assignment failed.' });
  }
});

export default router;
