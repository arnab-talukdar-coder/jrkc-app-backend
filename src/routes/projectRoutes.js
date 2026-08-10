import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import {
  getProjects,
  createProject,
  updateProject,
  deleteProject
} from '../controllers/projectController.js';

const router = express.Router();

router.get('/', authenticateToken, getProjects);
router.post('/', authenticateToken, requireRole('Admin', 'HR'), createProject);
router.put('/:id', authenticateToken, requireRole('Admin', 'HR'), updateProject);
router.delete('/:id', authenticateToken, requireRole('Admin', 'HR'), deleteProject);

export default router;
