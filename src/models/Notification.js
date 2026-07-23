import mongoose from 'mongoose';

const NotificationSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  targetRole: { type: String, enum: ['Admin', 'HR', 'Employee', 'All'], required: true },
  recipientId: String, // optional specific employee or HR id
  recipientEmail: String,
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, enum: ['registration', 'leave_request', 'leave_approval', 'leave_rejection', 'payslip', 'quota_update', 'system'], default: 'system' },
  read: { type: Boolean, default: false },
  createdAtDate: { type: String, default: () => new Date().toLocaleString() }
}, { timestamps: true });

export const Notification = mongoose.model('Notification', NotificationSchema);
