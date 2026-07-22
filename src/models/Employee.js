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
  department: { type: String, required: true },
  avatar: String,
  status: { type: String, default: 'Clocked Out' },
  clockTime: String,
  returnsDate: String,
  ptoDays: { type: Number, default: 15 },
  sickDays: { type: Number, default: 5 },
  email: String,
  phone: String,
  dateOfBirth: String,
  reportingManager: String,
  joiningDate: String,
  recentLogs: [LogSchema]
}, { timestamps: true });

export const Employee = mongoose.model('Employee', EmployeeSchema);
