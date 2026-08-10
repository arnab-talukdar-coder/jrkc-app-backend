import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import {
  getAnnouncements,
  getBankDetails,
  getHrSettingsAlias,
  updateHrSettingsAlias
} from '../controllers/miscController.js';

const router = express.Router();

router.get('/announcements', authenticateToken, getAnnouncements);
router.get('/bank-details', authenticateToken, getBankDetails);

// Alias routes for /api/hr-settings
router.get('/hr-settings', authenticateToken, requireRole('Admin', 'HR'), getHrSettingsAlias);
router.put('/hr-settings', authenticateToken, requireRole('Admin', 'HR'), updateHrSettingsAlias);

export default router;
