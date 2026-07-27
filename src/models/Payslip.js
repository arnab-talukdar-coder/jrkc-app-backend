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
  attendance: { type: Number, default: 30 },
  station: { type: String, default: 'KARAMBELI' },
  serialNo: { type: String, default: '27644' },
  baseSalary: { type: Number, required: true },
  basic: { type: Number, default: 14000 },
  salaryOfAttendance: { type: Number, default: 14000 },
  employerPf: { type: Number, default: 1680 },
  hra: { type: Number, default: 5600 },
  da: { type: Number, default: 3350 },
  sa: { type: Number, default: 6420 },
  totalCtc: { type: Number, default: 31050 },
  esi: { type: Number, default: 0 },
  advance: { type: Number, default: 0 },
  incomeTax: { type: Number, default: 0 },
  loan: { type: Number, default: 0 },
  employeePf: { type: Number, default: 1680 },
  other: { type: Number, default: 0 },
  totalDeductions: { type: Number, required: true },
  grossSalary: { type: Number, required: true },
  netPay: { type: Number, required: true },
  amountInWords: String,
  disbursementStatus: { type: String, enum: ['pending_disbursement', 'paid_pending_dispatch', 'dispatched'], default: 'pending_disbursement' },
  markedPaidAt: Date,
  scheduledDispatchTime: Date,
  dispatchedAt: Date,
  emailStatus: { type: String, enum: ['pending', 'scheduled', 'sent', 'failed'], default: 'pending' },
  sentAt: Date
}, { timestamps: true });

export const Payslip = mongoose.model('Payslip', PayslipSchema);
