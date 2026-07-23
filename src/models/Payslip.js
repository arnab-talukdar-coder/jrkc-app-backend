import mongoose from 'mongoose';

const PayslipSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  employeeId: { type: String, required: true },
  employeeName: { type: String, required: true },
  employeeEmail: { type: String, required: true },
  department: String,
  role: String,
  assignedHrName: String,
  payPeriod: { type: String, required: true }, // e.g. "October 2026"
  payDate: String,
  workingDaysInMonth: { type: Number, default: 30 },
  baseSalary: { type: Number, required: true },
  perDaySalary: { type: Number, required: true },
  lwpDays: { type: Number, default: 0 },
  lwpDeduction: { type: Number, default: 0 },
  allowances: { type: Number, default: 0 },
  taxDeductions: { type: Number, default: 0 },
  otherDeductions: { type: Number, default: 0 },
  totalDeductions: { type: Number, required: true },
  grossSalary: { type: Number, required: true },
  netPay: { type: Number, required: true },
  emailStatus: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
  sentAt: Date
}, { timestamps: true });

export const Payslip = mongoose.model('Payslip', PayslipSchema);
