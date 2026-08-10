import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  registerEmployee,
  registerAdmin,
  initAdminAccounts,
  login,
  refreshToken,
  changePassword
} from '../controllers/authController.js';

const router = express.Router();

router.post('/register', registerEmployee);
router.post('/register-admin', registerAdmin);
router.post(['/setup-admin-users', '/init-admin-accounts'], initAdminAccounts);
router.post('/login', login);
router.post('/refresh', refreshToken);
router.post('/change-password', authenticateToken, changePassword);

export default router;
