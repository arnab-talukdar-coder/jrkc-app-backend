import mongoose from 'mongoose';

const ApprovalSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  employeeId: String,
  employeeName: { type: String, required: true },
  role: String,
  avatar: String,
  type: { type: String, required: true },
  details: String,
  subDetails: String,
  assignedHrId: String,
  assignedHrName: String,
  assignedHrEmail: String,
  startDate: String,
  endDate: String,
  totalDays: { type: Number, default: 1 },
  isLwp: { type: Boolean, default: false },
  lwpDays: { type: Number, default: 0 },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  dateSubmitted: String
}, { timestamps: true });

export const Approval = mongoose.model('Approval', ApprovalSchema);
