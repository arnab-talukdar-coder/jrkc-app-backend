import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { getHrSettings, updateHrSettings } from '../controllers/approvalController.js';

const router = express.Router();

router.get('/', authenticateToken, getHrSettings);
router.put('/', authenticateToken, requireRole('Admin', 'HR'), updateHrSettings);

export default router;
