import mongoose from 'mongoose';

const PayslipSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  employeeId: { type: String, required: true },
  employeeName: { type: String, required: true },
  employeeEmail: { type: String, required: true },
  department: String,
  role: String,
  assignedHrName: String,
  payPeriod: { type: String, required: true }, // e.g. "August 2026"
  month: String,
  year: Number,
  payDate: String,
  workingDaysInMonth: { type: Number, default: 26 },
  // Attendance: both system-calculated and HR-adjusted stored separately
  calculatedAttendanceDays: { type: Number, default: 0 },
  adjustedAttendanceDays: { type: Number, default: null }, // null = no adjustment made
  attendance: { type: Number, default: 26 }, // final used value (adjusted ?? calculated)
  lwpDays: { type: Number, default: 0 },
  lwpDeduction: { type: Number, default: 0 },
  station: { type: String, default: 'KARAMBELI' },
  serialNo: { type: String, default: '27644' },
  // Earnings — all as separate fields for historical snapshot integrity
  baseSalary: { type: Number, required: true },
  basic: { type: Number, default: 0 },
  salaryOfAttendance: { type: Number, default: 0 },
  hra: { type: Number, default: 0 },
  da: { type: Number, default: 0 },
  sa: { type: Number, default: 0 },
  conveyance: { type: Number, default: 0 },
  otherAllowances: { type: Number, default: 0 },
  incentive: { type: Number, default: 0 },
  otherEarnings: { type: Number, default: 0 },
  // CTC
  employerPf: { type: Number, default: 0 },
  totalCtc: { type: Number, default: 0 },
  // Deductions — stored separately
  employeePf: { type: Number, default: 0 },
  esi: { type: Number, default: 0 },
  professionalTax: { type: Number, default: 0 },
  tds: { type: Number, default: 0 },
  advance: { type: Number, default: 0 },           // salary advance recovery
  salaryAdvanceRecovery: { type: Number, default: 0 },
  advanceOutstandingBalance: { type: Number, default: 0 },
  incomeTax: { type: Number, default: 0 },
  loan: { type: Number, default: 0 },
  other: { type: Number, default: 0 },             // other deductions
  // Totals
  totalDeductions: { type: Number, required: true },
  grossSalary: { type: Number, required: true },
  netPay: { type: Number, required: true },
  amountInWords: String,
  // Status
  disbursementStatus: { type: String, enum: ['pending_disbursement', 'paid_pending_dispatch', 'dispatched'], default: 'pending_disbursement' },
  markedPaidAt: Date,
  scheduledDispatchTime: Date,
  dispatchedAt: Date,
  emailStatus: { type: String, enum: ['pending', 'scheduled', 'sent', 'failed'], default: 'pending' },
  sentAt: Date
}, { timestamps: true });

// Unique compound index prevents duplicate payslips for same employee+month
PayslipSchema.index({ employeeId: 1, payPeriod: 1 }, { unique: true, sparse: false });

export const Payslip = mongoose.model('Payslip', PayslipSchema);
