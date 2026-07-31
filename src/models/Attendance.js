import mongoose from 'mongoose';

const AttendanceSchema = new mongoose.Schema({
  employeeId: { type: String, required: true },
  employeeEmail: { type: String, required: true },
  date: { type: String, required: true }, // Format: YYYY-MM-DD
  status: { type: String, enum: ['CLOCKED_IN', 'CLOCKED_OUT'], required: true },
  
  clockInTime: { type: String, required: true }, // E.g., '09:00 AM'
  clockInTimestamp: { type: Date, required: true },
  clockInLocation: {
    latitude: { type: Number },
    longitude: { type: Number }
  },
  
  clockOutTime: { type: String, default: null }, // E.g., '06:00 PM'
  clockOutTimestamp: { type: Date, default: null },
  clockOutLocation: {
    latitude: { type: Number },
    longitude: { type: Number }
  },
  
  assignedRadius: { type: Number, default: 50 },
  deviceInfo: { type: String, default: '' },
  
  // Total duration in minutes (calculated on clock out)
  durationMinutes: { type: Number, default: 0 }
}, { timestamps: true });

// Ensure we can quickly find today's attendance for an employee
AttendanceSchema.index({ employeeId: 1, date: 1 });
AttendanceSchema.index({ employeeEmail: 1, date: 1 });

export const Attendance = mongoose.model('Attendance', AttendanceSchema);
