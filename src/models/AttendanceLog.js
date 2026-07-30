import mongoose from 'mongoose';

// Separate collection for attendance — NOT embedded in User
// This is critical for scalability and accurate payroll calculation

const AttendanceLogSchema = new mongoose.Schema({
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userIdStr:  { type: String, required: true },  // string ID for quick lookup
  userName:   { type: String, default: '' },
  department: { type: String, default: '' },

  // Date of attendance (YYYY-MM-DD)
  date: { type: String, required: true },

  // Clock times
  clockIn:  { type: Date, default: null },
  clockOut: { type: Date, default: null },

  // GPS coordinates at clock in/out
  clockInLat:  { type: Number, default: null },
  clockInLng:  { type: Number, default: null },
  clockOutLat: { type: Number, default: null },
  clockOutLng: { type: Number, default: null },

  // Computed
  hoursWorked: { type: Number, default: 0 },

  // Status: complete = both in & out, incomplete = only in
  status: { type: String, enum: ['active', 'complete', 'incomplete'], default: 'active' },

  // Sunday = extra working day
  isExtraDay: { type: Boolean, default: false },

  // Device info
  deviceInfo: { type: String, default: '' },

}, { timestamps: true });

// Compound unique: one record per user per date
AttendanceLogSchema.index({ userId: 1, date: 1 }, { unique: true });
AttendanceLogSchema.index({ userIdStr: 1, date: 1 });
AttendanceLogSchema.index({ date: 1 });

export const AttendanceLog = mongoose.model('AttendanceLog', AttendanceLogSchema);
