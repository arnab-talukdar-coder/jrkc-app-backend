import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { getNotifications, markRead } from '../controllers/notificationController.js';

const router = express.Router();

router.get('/', authenticateToken, getNotifications);
router.patch('/:id/read', authenticateToken, markRead);

export default router;
