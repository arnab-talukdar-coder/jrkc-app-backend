import mongoose from 'mongoose';

const RegistrationRequestSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: String,
  department: { type: String, required: true },
  role: { type: String, required: true },
  requestedUserRole: { type: String, enum: ['Admin', 'HR', 'Employee'], default: 'Employee' },
  password: String,
  assignedHrId: String,
  assignedHrName: String,
  status: { type: String, enum: ['pending_approval', 'approved', 'rejected'], default: 'pending_approval' },
  rejectionReason: String,
  dateSubmitted: { type: String, default: () => new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) }
}, { timestamps: true });

export const RegistrationRequest = mongoose.model('RegistrationRequest', RegistrationRequestSchema);
