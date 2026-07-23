import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const LogSchema = new mongoose.Schema({
  date: String,
  hours: String,
  duration: String,
  status: String
}, { _id: false });

const EmployeeSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  role: { type: String, required: true },
  userRole: { type: String, enum: ['Admin', 'HR', 'Employee'], default: 'Employee' },
  department: { type: String, required: true },
  avatar: String,
  status: { type: String, default: 'Clocked Out' },
  accountStatus: { type: String, enum: ['pending_approval', 'approved', 'rejected'], default: 'pending_approval' },
  password: { type: String, default: null }, // set after approval
  clockTime: String,
  returnsDate: String,
  ptoDays: { type: Number, default: 15 },
  sickDays: { type: Number, default: 5 },
  lwpDaysTaken: { type: Number, default: 0 },
  email: { type: String, required: true, unique: true },
  phone: String,
  dateOfBirth: String,
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
