import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import {
  registerPushToken,
  getEmployees,
  onboardEmployee,
  requestPhotoChange,
  updateEmployeeQuotaSalary,
  updateEmployeeProfile
} from '../controllers/employeeController.js';

const router = express.Router();

// Base path: /api/employees
router.put('/push-token', authenticateToken, registerPushToken);
router.get('/', authenticateToken, getEmployees);
router.post('/', authenticateToken, requireRole('Admin', 'HR'), onboardEmployee);
router.post('/photo-request', authenticateToken, requestPhotoChange);

// Profile and Quota Updates
router.put('/:id', authenticateToken, requireRole('Admin', 'HR', 'Director'), updateEmployeeProfile);

export default router;
