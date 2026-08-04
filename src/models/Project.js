import mongoose from 'mongoose';

const ProjectSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  geofenceRadius: { type: Number, default: 50 }, // meters
  address: { type: String, default: '' },
  description: { type: String, default: '' },
  assignedEmployeeIds: { type: [String], default: [] },
  createdBy: { type: String, default: '' }
}, { timestamps: true });

ProjectSchema.index({ id: 1 });
ProjectSchema.index({ name: 1 });

export const Project = mongoose.model('Project', ProjectSchema);
