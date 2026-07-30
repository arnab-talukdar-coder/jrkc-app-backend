import express from 'express';
import { Notification } from '../models/Notification.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// ── GET /api/v2/notifications  (own + role-based) ─────────────────────────
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const notifications = await Notification.find({
      $or: [
        { targetUserId: req.user.id },
        { targetRole: req.user.userRole },
        { targetRole: 'All' },
      ]
    })
    .sort({ createdAt: -1 })
    .limit(Number(limit));

    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notifications.' });
  }
});

// ── PATCH /api/v2/notifications/:id/read ──────────────────────────────────
router.patch('/:id/read', authenticateToken, async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, {
      $addToSet: { readBy: req.user.id }
    });
    res.json({ message: 'Marked as read.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark as read.' });
  }
});

// ── PATCH /api/v2/notifications/read-all ──────────────────────────────────
router.patch('/read-all', authenticateToken, async (req, res) => {
  try {
    await Notification.updateMany(
      {
        $or: [{ targetUserId: req.user.id }, { targetRole: req.user.userRole }],
        readBy: { $ne: req.user.id }
      },
      { $addToSet: { readBy: req.user.id } }
    );
    res.json({ message: 'All marked as read.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed.' });
  }
});

// ── GET /api/v2/notifications/unread-count ────────────────────────────────
router.get('/unread-count', authenticateToken, async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      $or: [{ targetUserId: req.user.id }, { targetRole: req.user.userRole }, { targetRole: 'All' }],
      readBy: { $ne: req.user.id }
    });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: 'Failed.' });
  }
});

export default router;
