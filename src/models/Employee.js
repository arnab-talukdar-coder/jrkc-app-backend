import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const LogSchema = new mongoose.Schema({
  id: String,
  type: String,
  date: String,
  hours: String,
  duration: String,
  createdAt: String,
  clockInTime: String,
  clockInTimestamp: String,
  clockOutTime: String,
  clockOutTimestamp: String,
  projectName: String,
  notes: String,
  status: String,
  // GPS tracking fields
  clockInLatitude: Number,
  clockInLongitude: Number,
  clockOutLatitude: Number,
  clockOutLongitude: Number,
  deviceInfo: String
}, { _id: false });

const LocationSchema = new mongoose.Schema({
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  address: { type: String, default: '' },
  geofenceRadius: { type: Number, default: 50 } // meters
}, { _id: false });

const EmployeeSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  role: { type: String, required: true },
  userRole: { type: String, enum: ['Admin', 'HR', 'Employee'], default: 'Employee' },
  department: { type: String, required: true },
  avatar: String,
  pendingAvatar: String,
  photoStatus: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
  status: { type: String, default: 'Clocked Out' },
  accountStatus: { type: String, enum: ['pending_approval', 'approved', 'rejected'], default: 'pending_approval' },
  agreedToTerms: { type: Boolean, default: true },
  termsAcceptedAt: String,
  termsVersion: { type: String, default: 'v1.0' },
  password: { type: String, default: null },
  clockTime: String,
  clockInTimestamp: String,
  clockOutTimestamp: String,
  returnsDate: String,

  // Leave balances
  ptoDays: { type: Number, default: 18 },       // Earned Leave (EL)
  ptoDaysTaken: { type: Number, default: 0 },
  sickDays: { type: Number, default: 10 },       // Sick Leave (SL)
  sickDaysTaken: { type: Number, default: 0 },
  casualDays: { type: Number, default: 10 },     // Casual Leave (CL)
  casualDaysTaken: { type: Number, default: 0 },
  optionalDays: { type: Number, default: 2 },    // Optional Leave
  optionalDaysTaken: { type: Number, default: 0 },
  lwpDaysTaken: { type: Number, default: 0 },

  // Contact
  email: { type: String, required: true, unique: true },
  phone: String,
  dateOfBirth: String,
  dob: String,
  bloodGroup: String,
  station: String,
  idCardNo: String,
  validity: String,
  reportingManager: String,

  // HR Assignment
  assignedHrId: String,
  assignedHrName: String,
  assignedHrEmail: String,

  // Dates
  joiningDate: String,

  // Salary
  baseSalary: { type: Number, default: 0 },
  allowances: { type: Number, default: 0 },
  taxDeductions: { type: Number, default: 0 },
  salaryStructure: {
    basic: { type: Number, default: 0 },
    hra: { type: Number, default: 0 },
    da: { type: Number, default: 0 },
    sa: { type: Number, default: 0 },
    conveyance: { type: Number, default: 0 },
    otherAllowances: { type: Number, default: 0 },
    employerPf: { type: Number, default: 0 },
    employeePf: { type: Number, default: 0 },
    esi: { type: Number, default: 0 },
    professionalTax: { type: Number, default: 0 },
    tds: { type: Number, default: 0 }
  },

  // GPS / Location
  assignedLocation: LocationSchema,
  assignedProjectId: String,
  assignedProjectName: String,

  // FCM Push Token
  fcmToken: String,
  expoPushToken: String,

  // Attendance Logs
  recentLogs: [LogSchema],

  // Authentication
  refreshToken: String
}, { timestamps: true });

// Indexes for performance
// Note: email is already indexed via unique: true
EmployeeSchema.index({ userRole: 1 });
EmployeeSchema.index({ department: 1 });
EmployeeSchema.index({ assignedHrId: 1 });
EmployeeSchema.index({ accountStatus: 1 });

// Hash password before saving (only if modified)
EmployeeSchema.pre('save', async function () {
  if (this.isModified('password') && this.password && !this.password.startsWith('$2b$') && !this.password.startsWith('$2a$')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
});

// Compare password
EmployeeSchema.methods.comparePassword = async function (candidate) {
  if (!this.password) return false;
  return bcrypt.compare(candidate, this.password);
};

export const Employee = mongoose.model('Employee', EmployeeSchema);
