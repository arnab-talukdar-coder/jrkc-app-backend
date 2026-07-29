import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const LogSchema = new mongoose.Schema({
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
  status: String
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
  password: { type: String, default: null }, // set after approval
  clockTime: String,
  clockInTimestamp: String,
  clockOutTimestamp: String,
  returnsDate: String,
  ptoDays: { type: Number, default: 18 }, // EL (Earned Leave)
  ptoDaysTaken: { type: Number, default: 0 },
  sickDays: { type: Number, default: 10 }, // SL (Sick Leave)
  sickDaysTaken: { type: Number, default: 0 },
  casualDays: { type: Number, default: 10 }, // CL (Casual Leave)
  casualDaysTaken: { type: Number, default: 0 },
  lwpDaysTaken: { type: Number, default: 0 },
  email: { type: String, required: true, unique: true },
  phone: String,
  dateOfBirth: String,
  dob: String,
  bloodGroup: String,
  station: String,
  idCardNo: String,
  validity: String,
  reportingManager: String,
  assignedHrId: String,
  assignedHrName: String,
  assignedHrEmail: String,
  joiningDate: String,
  baseSalary: { type: Number, default: 60000 },
  allowances: { type: Number, default: 5000 },
  taxDeductions: { type: Number, default: 2000 },
  recentLogs: [LogSchema]
}, { timestamps: true });

// Hash password before saving
EmployeeSchema.pre('save', async function (next) {
  if (this.isModified('password') && this.password) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

// Compare password
EmployeeSchema.methods.comparePassword = async function (candidate) {
  if (!this.password) return false;
  return bcrypt.compare(candidate, this.password);
};

export const Employee = mongoose.model('Employee', EmployeeSchema);
