import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { updateEmployeeQuotaSalary, updateEmployeeProfile } from '../controllers/employeeController.js';

const router = express.Router();

// Base path: /api/hr/employees
router.put('/:id/leave-quota', authenticateToken, requireRole('Admin', 'HR', 'Director'), updateEmployeeQuotaSalary);
router.put('/:id/salary', authenticateToken, requireRole('Admin', 'HR', 'Director'), updateEmployeeQuotaSalary);
router.put('/:id/profile', authenticateToken, requireRole('Admin', 'HR', 'Director'), updateEmployeeProfile);

export default router;
