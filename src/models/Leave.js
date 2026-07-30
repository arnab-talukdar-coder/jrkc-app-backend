import mongoose from 'mongoose';

const LeaveSchema = new mongoose.Schema({
  // Applicant
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userIdStr:  { type: String, required: true },
  userName:   { type: String, required: true },
  department: { type: String, default: '' },

  // Leave details
  leaveType: {
    type: String,
    enum: ['Earned Leave', 'Sick Leave', 'Casual Leave', 'Optional Leave', 'LWP'],
    required: true
  },
  startDate:   { type: String, required: true },  // YYYY-MM-DD
  endDate:     { type: String, required: true },  // YYYY-MM-DD
  totalDays:   { type: Number, required: true },
  reason:      { type: String, default: '' },

  // Two-stage approval workflow
  // pending_hr → HR acts first
  // pending_director → Director does final approval
  // approved | rejected
  status: {
    type: String,
    enum: ['pending_hr', 'pending_director', 'approved', 'rejected', 'cancelled'],
    default: 'pending_hr'
  },

  // HR action
  hrReviewedBy: { type: String, default: '' },
  hrReviewedAt: { type: Date, default: null },
  hrAction:     { type: String, enum: ['approved', 'rejected', ''], default: '' },
  hrRemarks:    { type: String, default: '' },

  // Director action
  directorReviewedBy: { type: String, default: '' },
  directorReviewedAt: { type: Date, default: null },
  directorAction:     { type: String, enum: ['approved', 'rejected', ''], default: '' },
  directorRemarks:    { type: String, default: '' },

  // Cancellation
  cancelledAt:     { type: Date, default: null },
  cancellationNote:{ type: String, default: '' },

}, { timestamps: true });

LeaveSchema.index({ userIdStr: 1, status: 1 });
LeaveSchema.index({ status: 1 });
LeaveSchema.index({ startDate: 1, endDate: 1 });

export const Leave = mongoose.model('Leave', LeaveSchema);
