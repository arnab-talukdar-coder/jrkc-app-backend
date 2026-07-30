import express from 'express';
import { Holiday } from '../models/Holiday.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// ── GET /api/v2/holidays  (all users) ─────────────────────────────────────
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { year, type } = req.query;
    const filter = {};
    if (year) filter.date = new RegExp(`^${year}`);
    if (type) filter.type = type;
    const holidays = await Holiday.find(filter).sort({ date: 1 });
    res.json(holidays);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch holidays.' });
  }
});

// ── POST /api/v2/holidays  (HR: add holiday) ──────────────────────────────
router.post('/', authenticateToken, requireRole('HR', 'Director'), async (req, res) => {
  try {
    const { date, name, description, type } = req.body;
    if (!date || !name) return res.status(400).json({ error: 'Date and name are required.' });

    const existing = await Holiday.findOne({ date });
    if (existing) return res.status(409).json({ error: `A holiday already exists on ${date}.` });

    const holiday = await Holiday.create({
      date,
      name,
      description: description || '',
      type: type || 'Company',
      addedBy: req.user.id,
      addedByName: req.user.name,
    });
    res.status(201).json(holiday);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add holiday.' });
  }
});

// ── DELETE /api/v2/holidays/:id  (HR: delete holiday) ─────────────────────
router.delete('/:id', authenticateToken, requireRole('HR', 'Director'), async (req, res) => {
  try {
    const holiday = await Holiday.findByIdAndDelete(req.params.id);
    if (!holiday) return res.status(404).json({ error: 'Holiday not found.' });
    res.json({ message: 'Holiday deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete holiday.' });
  }
});

export default router;
