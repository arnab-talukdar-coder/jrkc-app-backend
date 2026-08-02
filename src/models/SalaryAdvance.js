import mongoose from 'mongoose';

const RepaymentInstallmentSchema = new mongoose.Schema({
  installmentNo: { type: Number, required: true },
  payPeriod: { type: String, required: true }, // e.g. "June 2026"
  year: { type: Number, required: true },
  month: { type: String, required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'paid'], default: 'pending' },
  paidAt: Date,
  payslipId: String
}, { _id: false });

const SalaryAdvanceSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  employeeId: { type: String, required: true },
  employeeName: { type: String, required: true },
  employeeEmail: { type: String, required: true },
  department: String,
  role: String,
  grossMonthlySalary: { type: Number, required: true },
  maxEligibleAdvance: { type: Number, required: true },
  requestedAmount: { type: Number, required: true },
  approvedAmount: { type: Number, default: 0 },
  reason: { type: String, required: true },
  preferredRepaymentPeriod: { type: Number, enum: [3, 6, 12], default: 3 },
  approvedRepaymentPeriod: { type: Number, enum: [3, 6, 12], default: 3 },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'cancelled', 'completed'], default: 'pending' },
  repaymentSchedule: [RepaymentInstallmentSchema],
  amountRepaid: { type: Number, default: 0 },
  outstandingBalance: { type: Number, default: 0 },
  installmentsPaid: { type: Number, default: 0 },
  totalInstallments: { type: Number, default: 3 },
  requestDate: { type: String, required: true },
  approvalDate: String,
  approvedBy: String,
  rejectionReason: String,
  remarks: String
}, { timestamps: true });

SalaryAdvanceSchema.index({ employeeId: 1, status: 1 });

export const SalaryAdvance = mongoose.model('SalaryAdvance', SalaryAdvanceSchema);
