import mongoose from 'mongoose';

const HRSettingsSchema = new mongoose.Schema({
  id: { type: String, default: 'HR_SETTINGS_GLOBAL', unique: true },

  // Payroll Configuration
  payrollWindowStart: { type: Number, default: 1, min: 1, max: 7 },
  payrollWindowEnd: { type: Number, default: 7, min: 1, max: 10 },
  payrollCurrency: { type: String, default: '₹' },

  // Working Days Configuration
  workingDays: {
    type: [String],
    default: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  },

  // Office Timings
  officeStartTime: { type: String, default: '09:00' },
  officeEndTime: { type: String, default: '18:00' },

  // Leave Policies (default allocations per year)
  defaultEarnedLeave: { type: Number, default: 18 },
  defaultSickLeave: { type: Number, default: 10 },
  defaultCasualLeave: { type: Number, default: 10 },
  defaultOptionalLeave: { type: Number, default: 2 },

  // Geofence Configuration
  defaultGeofenceRadius: { type: Number, default: 50 },

  // Departments
  departments: {
    type: [String],
    default: ['Management', 'Human Resources', 'Engineering', 'Operations', 'Finance', 'Administration']
  },

  // Designations
  designations: {
    type: [String],
    default: ['Director', 'HR Manager', 'Manager', 'Senior Engineer', 'Engineer', 'Technician', 'Operator', 'Staff']
  },

  // Company Info
  companyName: { type: String, default: 'JRKC Rail Infra Private Limited' },
  companyCIN: { type: String, default: '' },
  companyAddress: { type: String, default: '' },

  updatedBy: { type: String, default: '' }
}, { timestamps: true });

export const HRSettings = mongoose.model('HRSettings', HRSettingsSchema);
