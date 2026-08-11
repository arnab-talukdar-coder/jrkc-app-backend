import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import {
  generateAutoPayslip,
  generatePayslip,
  getEmployeePayslips,
  getPayslips,
  markPayslipPaid
} from '../controllers/payslipController.js';

const router = express.Router();

router.post('/generate-auto', authenticateToken, requireRole('Admin', 'HR'), generateAutoPayslip);
router.post('/generate', authenticateToken, requireRole('Admin', 'HR'), generatePayslip);
router.get(['/employee/:employeeId', '/employee/*'], authenticateToken, getEmployeePayslips);
router.get('/', authenticateToken, getPayslips);
router.post('/:id/mark-paid', authenticateToken, requireRole('Admin', 'HR'), markPayslipPaid);

export default router;
