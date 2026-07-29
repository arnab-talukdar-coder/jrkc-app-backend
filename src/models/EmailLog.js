import mongoose from 'mongoose';

const EmailLogSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  to: { type: String, required: true },
  cc: { type: String, default: '' },
  subject: { type: String, required: true },
  type: {
    type: String,
    enum: ['registration', 'welcome', 'password_reset', 'leave_submitted', 'leave_approved', 'leave_rejected', 'payslip', 'salary_released', 'notification', 'announcement'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'sent', 'failed', 'retrying'],
    default: 'pending'
  },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 3 },
  lastError: { type: String, default: '' },
  sentAt: { type: Date, default: null },
  nextRetryAt: { type: Date, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

EmailLogSchema.index({ status: 1, nextRetryAt: 1 });
EmailLogSchema.index({ to: 1, type: 1 });

export const EmailLog = mongoose.model('EmailLog', EmailLogSchema);
