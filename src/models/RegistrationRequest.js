import mongoose from 'mongoose';

const RegistrationRequestSchema = new mongoose.Schema({
  // Applicant info
  name:       { type: String, required: true, trim: true },
  email:      { type: String, required: true, lowercase: true, trim: true },
  phone:      { type: String, default: '' },
  department: { type: String, default: '' },
  designation:{ type: String, default: '' },      // job title / role
  requestedRole: { type: String, enum: ['Director', 'HR', 'Employee'], default: 'Employee' },

  // HR assignment (set on creation, based on available HR)
  assignedHrId:   { type: String, default: '' },
  assignedHrName: { type: String, default: '' },

  // Status lifecycle
  // pending_hr → HR reviews first
  // pending_director → Director does final approval (for HR/Director roles)
  // approved → User account created
  // rejected
  status: {
    type: String,
    enum: ['pending_hr', 'pending_director', 'approved', 'rejected'],
    default: 'pending_hr'
  },

  hrReviewedBy:    { type: String, default: '' },
  hrReviewedAt:    { type: Date, default: null },
  directorApprovedBy: { type: String, default: '' },
  directorApprovedAt: { type: Date, default: null },
  rejectedBy:      { type: String, default: '' },
  rejectedAt:      { type: Date, default: null },
  rejectionReason: { type: String, default: '' },

  // Created user ID after approval
  createdUserId: { type: String, default: '' },

}, { timestamps: true });

RegistrationRequestSchema.index({ email: 1 });
RegistrationRequestSchema.index({ status: 1 });
RegistrationRequestSchema.index({ assignedHrId: 1 });

export const RegistrationRequest = mongoose.model('RegistrationRequest', RegistrationRequestSchema);
