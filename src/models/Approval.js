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
  newAvatarUrl: String,
  startDate: String,
  endDate: String,
  totalDays: { type: Number, default: 1 },
  isLwp: { type: Boolean, default: false },
  lwpDays: { type: Number, default: 0 },
  // Attendance Regularization fields
  regularizationDate: String,
  missedType: String, // Missed Clock In, Missed Clock Out, Incorrect Attendance
  requestedClockIn: String,
  requestedClockOut: String,
  reason: String,
  status: { 
    type: String, 
    enum: ['pending', 'pending_hr', 'pending_admin', 'approved', 'rejected', 'cancelled', 'cancellation_pending'], 
    default: 'pending_hr' 
  },
  hrApprovedBy: String,
  hrApprovedAt: String,
  adminApprovedBy: String,
  adminApprovedAt: String,
  dateSubmitted: String
}, { timestamps: true });

export const Approval = mongoose.model('Approval', ApprovalSchema);
