import mongoose from 'mongoose';

const NotificationSchema = new mongoose.Schema({
  // Target — can be by role (broadcast) or by specific user
  targetRole:   { type: String, enum: ['Director', 'HR', 'Employee', 'All'], default: 'All' },
  targetUserId: { type: String, default: '' },  // empty = all in role

  title:   { type: String, required: true },
  message: { type: String, required: true },
  type: {
    type: String,
    enum: ['registration', 'leave_request', 'leave_approved', 'leave_rejected',
           'payslip', 'salary_configured', 'salary_approved',
           'attendance', 'announcement', 'photo_request', 'photo_approved', 'general'],
    default: 'general'
  },

  isRead:    { type: Boolean, default: false },
  readAt:    { type: Date, default: null },
  readBy:    { type: [String], default: [] },  // array of userIdStr who read it

  // Link back to source entity
  refId:   { type: String, default: '' },
  refModel:{ type: String, default: '' },

}, { timestamps: true });

NotificationSchema.index({ targetUserId: 1, isRead: 1 });
NotificationSchema.index({ targetRole: 1, createdAt: -1 });

export const Notification = mongoose.model('Notification', NotificationSchema);
