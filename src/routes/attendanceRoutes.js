import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  getStatus,
  clockIn,
  clockOut,
  getHistory
} from '../controllers/attendanceController.js';

const router = express.Router();

// All attendance routes require authentication
router.use(authenticateToken);

// Get current day's attendance status
router.get('/status', getStatus);

// Clock In
router.post('/clock-in', clockIn);

// Clock Out
router.post('/clock-out', clockOut);

// Get Attendance History
router.get('/history', getHistory);

export default router;
