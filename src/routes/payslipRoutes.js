import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import {
  generateAutoPayslip,
  generatePayslip,
  previewPayslip,
  getAttendanceSummary,
  getEmployeePayslips,
  getPayslips,
  markPayslipPaid
} from '../controllers/payslipController.js';

const router = express.Router();

// Specific routes first (before /:id wildcard)
router.post('/generate-auto', authenticateToken, requireRole('Admin', 'HR', 'Director'), generateAutoPayslip);
router.post('/generate', authenticateToken, requireRole('Admin', 'HR', 'Director'), generatePayslip);
router.post('/preview', authenticateToken, requireRole('Admin', 'HR', 'Director'), previewPayslip);
router.get('/attendance-summary', authenticateToken, requireRole('Admin', 'HR', 'Director'), getAttendanceSummary);
router.get(['/employee/:employeeId', '/employee/*'], authenticateToken, getEmployeePayslips);
router.get('/', authenticateToken, getPayslips);

// Parameterized routes last
router.post('/:id/mark-paid', authenticateToken, requireRole('Admin', 'HR', 'Director'), markPayslipPaid);

export default router;
