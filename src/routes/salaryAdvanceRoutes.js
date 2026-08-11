import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import {
  requestAdvance,
  getEmployeeAdvance,
  getAdminAdvances,
  approveAdvance,
  rejectAdvance
} from '../controllers/salaryAdvanceController.js';

const router = express.Router();

router.post('/request', authenticateToken, requestAdvance);
router.get(['/employee/:employeeId', '/employee/*'], authenticateToken, getEmployeeAdvance);
router.get('/admin/requests', authenticateToken, requireRole('Admin', 'HR'), getAdminAdvances);
router.post('/:id/approve', authenticateToken, requireRole('Admin'), approveAdvance);
router.post('/:id/reject', authenticateToken, requireRole('Admin'), rejectAdvance);

export default router;
