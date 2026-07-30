import express from 'express';
import { AttendanceLog } from '../models/AttendanceLog.js';
import { User } from '../models/User.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// ── POST /api/v2/attendance/clock-in ─────────────────────────────────────
router.post('/clock-in', authenticateToken, async (req, res) => {
  try {
    const { latitude, longitude, deviceInfo } = req.body;

    const user = await User.findById(req.user.id).select('clockStatus assignedLocation name department');
    if (!user) return res.status(404).json({ error: 'User not found.' });

    // Prevent duplicate punch
    if (user.clockStatus === 'Clocked In') {
      return res.status(400).json({ error: 'Already clocked in. Please clock out first.' });
    }

    // GPS geofence check
    if (user.assignedLocation && latitude !== undefined && longitude !== undefined) {
      const dist = getDistanceMeters(
        latitude, longitude,
        user.assignedLocation.latitude, user.assignedLocation.longitude
      );
      if (dist > (user.assignedLocation.geofenceRadius || 100)) {
        return res.status(403).json({
          error: `You are ${Math.round(dist)}m away from the work location. Must be within ${user.assignedLocation.geofenceRadius || 100}m to clock in.`,
          distance: Math.round(dist),
          required: user.assignedLocation.geofenceRadius || 100,
        });
      }
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const dayOfWeek = now.getDay();
    const isExtraDay = dayOfWeek === 0; // Sunday

    // Upsert attendance log for today
    const log = await AttendanceLog.findOneAndUpdate(
      { userId: req.user.id, date: dateStr },
      {
        $set: {
          userIdStr: req.user.id,
          userName: user.name,
          department: user.department,
          clockIn: now,
          clockInLat: latitude !== undefined ? Number(latitude) : null,
          clockInLng: longitude !== undefined ? Number(longitude) : null,
          status: 'active',
          isExtraDay,
          deviceInfo: deviceInfo || '',
        }
      },
      { new: true, upsert: true }
    );

    // Update user clock status
    await User.findByIdAndUpdate(req.user.id, {
      clockStatus: 'Clocked In',
      clockInTime: now,
    });

    res.json({ message: 'Clocked in successfully.', log });
  } catch (err) {
    console.error('Clock in error:', err);
    res.status(500).json({ error: 'Clock in failed.' });
  }
});

// ── POST /api/v2/attendance/clock-out ────────────────────────────────────
router.post('/clock-out', authenticateToken, async (req, res) => {
  try {
    const { latitude, longitude, deviceInfo } = req.body;

    const user = await User.findById(req.user.id).select('clockStatus clockInTime name');
    if (!user) return res.status(404).json({ error: 'User not found.' });

    if (user.clockStatus !== 'Clocked In') {
      return res.status(400).json({ error: 'Not currently clocked in.' });
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);

    const log = await AttendanceLog.findOne({ userId: req.user.id, date: dateStr });
    if (!log) return res.status(404).json({ error: 'No clock-in record found for today.' });

    const hoursWorked = log.clockIn
      ? Math.round(((now - log.clockIn) / 3600000) * 100) / 100
      : 0;

    await AttendanceLog.findByIdAndUpdate(log._id, {
      clockOut: now,
      clockOutLat: latitude !== undefined ? Number(latitude) : null,
      clockOutLng: longitude !== undefined ? Number(longitude) : null,
      hoursWorked,
      status: 'complete',
    });

    await User.findByIdAndUpdate(req.user.id, {
      clockStatus: 'Clocked Out',
      clockInTime: null,
    });

    res.json({ message: 'Clocked out successfully.', hoursWorked });
  } catch (err) {
    console.error('Clock out error:', err);
    res.status(500).json({ error: 'Clock out failed.' });
  }
});

// ── GET /api/v2/attendance/my  (employee: own history) ────────────────────
router.get('/my', authenticateToken, async (req, res) => {
  try {
    const { month, year, limit = 60 } = req.query;
    const filter = { userId: req.user.id };

    if (month && year) {
      const mm = String(month).padStart(2, '0');
      filter.date = new RegExp(`^${year}-${mm}`);
    } else if (year) {
      filter.date = new RegExp(`^${year}`);
    }

    const logs = await AttendanceLog.find(filter)
      .sort({ date: -1 })
      .limit(Number(limit));

    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch attendance.' });
  }
});

// ── GET /api/v2/attendance  (HR/Director: all employees) ─────────────────
router.get('/', authenticateToken, requireRole('HR', 'Director'), async (req, res) => {
  try {
    const { userId, month, year, date } = req.query;
    const filter = {};

    if (userId) filter.userIdStr = userId;
    if (date) filter.date = date;
    else if (month && year) {
      const mm = String(month).padStart(2, '0');
      filter.date = new RegExp(`^${year}-${mm}`);
    }

    const logs = await AttendanceLog.find(filter).sort({ date: -1 }).limit(500);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch attendance.' });
  }
});

// ── GET /api/v2/attendance/today  (all clocked in now — for HR dashboard) ──
router.get('/today', authenticateToken, requireRole('HR', 'Director'), async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const logs = await AttendanceLog.find({ date: today }).sort({ clockIn: -1 });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch today attendance.' });
  }
});

// ── Utility: Haversine distance in meters ─────────────────────────────────
function getDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default router;
