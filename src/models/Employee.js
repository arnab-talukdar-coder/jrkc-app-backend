import mongoose from 'mongoose';

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
  accountStatus: { type: String, enum: ['pending_approval', 'approved', 'rejected'], default: 'approved' },
  clockTime: String,
  returnsDate: String,
  ptoDays: { type: Number, default: 15 },
  sickDays: { type: Number, default: 5 },
  lwpDaysTaken: { type: Number, default: 0 },
  email: String,
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

export const Employee = mongoose.model('Employee', EmployeeSchema);
