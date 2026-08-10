import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import {
  getHolidays,
  createHoliday,
  updateHoliday,
  deleteHoliday
} from '../controllers/holidayController.js';

const router = express.Router();

router.get('/', authenticateToken, getHolidays);
router.post('/', authenticateToken, requireRole('Admin', 'HR'), createHoliday);
router.put('/:id', authenticateToken, requireRole('Admin', 'HR'), updateHoliday);
router.delete('/:id', authenticateToken, requireRole('Admin', 'HR'), deleteHoliday);

export default router;
