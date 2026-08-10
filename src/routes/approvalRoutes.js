import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import {
  submitLeaveRequest,
  listApprovals,
  approveRejectLeave,
  regularizeAttendance
} from '../controllers/approvalController.js';

const router = express.Router();

router.post('/', authenticateToken, submitLeaveRequest);
router.get('/', authenticateToken, listApprovals);
router.patch('/:id', authenticateToken, requireRole('Admin', 'HR', 'Director'), approveRejectLeave);
router.post('/regularize', authenticateToken, regularizeAttendance);

export default router;
