import mongoose from 'mongoose';
import { Project } from '../models/Project.js';
import { Employee } from '../models/Employee.js';
import { sanitizeString } from '../middleware/auth.js';

export const getProjects = async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const projects = await Project.find().sort({ createdAt: -1 });
      const activeEmps = await Employee.find({}, { id: 1, idCardNo: 1 });
      const validEmpIds = new Set(activeEmps.flatMap(e => [e.id, e.idCardNo].filter(Boolean)));

      const sanitizedProjects = projects.map(p => {
        const obj = p.toObject();
        obj.assignedEmployeeIds = (obj.assignedEmployeeIds || []).filter(id => validEmpIds.has(id));
        return obj;
      });

      return res.json(sanitizedProjects);
    }
  } catch (e) {
    console.error('Error fetching projects:', e);
  }
  res.json([]);
};

export const createProject = async (req, res) => {
  try {
    const { name, latitude, longitude, geofenceRadius, address, description, assignedEmployeeIds } = req.body;
    if (!name || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Project name, latitude, and longitude are required.' });
    }

    const projectId = `PROJ-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newProject = new Project({
      id: projectId,
      name: sanitizeString(name),
      latitude: Number(latitude),
      longitude: Number(longitude),
      geofenceRadius: Number(geofenceRadius) || 50,
      address: sanitizeString(address || ''),
      description: sanitizeString(description || ''),
      assignedEmployeeIds: Array.isArray(assignedEmployeeIds) ? assignedEmployeeIds : [],
      createdBy: req.user.name || req.user.id || 'HR/Director'
    });

    if (mongoose.connection.readyState === 1) {
      await newProject.save();

      if (Array.isArray(assignedEmployeeIds) && assignedEmployeeIds.length > 0) {
        await Employee.updateMany(
          { id: { $in: assignedEmployeeIds } },
          {
            $set: {
              assignedProjectId: projectId,
              assignedProjectName: name,
              assignedLocation: {
                latitude: Number(latitude),
                longitude: Number(longitude),
                address: address || name,
                geofenceRadius: Number(geofenceRadius) || 50
              }
            }
          }
        );
      }
    }

    return res.status(201).json(newProject);
  } catch (e) {
    console.error('Error creating project:', e);
    return res.status(500).json({ error: e.message || 'Failed to create project' });
  }
};

export const updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, latitude, longitude, geofenceRadius, address, description, assignedEmployeeIds } = req.body;

    if (mongoose.connection.readyState === 1) {
      const project = await Project.findOne({ id });
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      if (name) project.name = sanitizeString(name);
      if (latitude !== undefined) project.latitude = Number(latitude);
      if (longitude !== undefined) project.longitude = Number(longitude);
      if (geofenceRadius !== undefined) project.geofenceRadius = Number(geofenceRadius);
      if (address !== undefined) project.address = sanitizeString(address);
      if (description !== undefined) project.description = sanitizeString(description);

      const prevAssigned = project.assignedEmployeeIds || [];
      const newAssigned = Array.isArray(assignedEmployeeIds) ? assignedEmployeeIds : prevAssigned;
      project.assignedEmployeeIds = newAssigned;

      await project.save();

      const unassigned = prevAssigned.filter(empId => !newAssigned.includes(empId));
      if (unassigned.length > 0) {
        await Employee.updateMany(
          { id: { $in: unassigned }, assignedProjectId: id },
          { $unset: { assignedProjectId: '', assignedProjectName: '', assignedLocation: '' } }
        );
      }

      if (newAssigned.length > 0) {
        await Employee.updateMany(
          { id: { $in: newAssigned } },
          {
            $set: {
              assignedProjectId: id,
              assignedProjectName: project.name,
              assignedLocation: {
                latitude: project.latitude,
                longitude: project.longitude,
                address: project.address || project.name,
                geofenceRadius: project.geofenceRadius
              }
            }
          }
        );
      }

      return res.json(project);
    }
    res.json({ message: 'Project memory mode not fully supported' });
  } catch (e) {
    console.error('Error updating project:', e);
    return res.status(500).json({ error: e.message || 'Failed to update project' });
  }
};

export const deleteProject = async (req, res) => {
  try {
    const { id } = req.params;
    if (mongoose.connection.readyState === 1) {
      const project = await Project.findOneAndDelete({ id });
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      await Employee.updateMany(
        { assignedProjectId: id },
        { $unset: { assignedProjectId: '', assignedProjectName: '', assignedLocation: '' } }
      );

      return res.json({ message: 'Project deleted successfully' });
    }
    res.json({ message: 'Project memory mode not fully supported' });
  } catch (e) {
    console.error('Error deleting project:', e);
    return res.status(500).json({ error: e.message || 'Failed to delete project' });
  }
};
