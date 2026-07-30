import mongoose from 'mongoose';

// Separate salary structure collection — HR configures, Director approves
const SalaryStructureSchema = new mongoose.Schema({
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userIdStr:  { type: String, required: true, unique: true },
  userName:   { type: String, required: true },
  department: { type: String, default: '' },

  // Earnings
  basic:            { type: Number, default: 0 },
  hra:              { type: Number, default: 0 },
  da:               { type: Number, default: 0 },
  specialAllowance: { type: Number, default: 0 },
  conveyance:       { type: Number, default: 0 },
  medical:          { type: Number, default: 0 },
  otherAllowances:  { type: Number, default: 0 },

  // Deductions
  employerPf:      { type: Number, default: 0 },
  employeePf:      { type: Number, default: 0 },
  esi:             { type: Number, default: 0 },
  professionalTax: { type: Number, default: 0 },
  tds:             { type: Number, default: 0 },
  otherDeductions: { type: Number, default: 0 },

  // Computed
  grossSalary:    { type: Number, default: 0 },
  totalCtc:       { type: Number, default: 0 },
  netSalary:      { type: Number, default: 0 },

  // Approval workflow
  status: {
    type: String,
    enum: ['draft', 'pending_director', 'approved'],
    default: 'draft'
  },
  configuredBy:    { type: String, default: '' },  // HR user ID
  configuredByName:{ type: String, default: '' },
  configuredAt:    { type: Date, default: null },

  approvedBy:      { type: String, default: '' },  // Director user ID
  approvedByName:  { type: String, default: '' },
  approvedAt:      { type: Date, default: null },

  // Revision history
  lastUpdatedBy:   { type: String, default: '' },
  lastUpdatedAt:   { type: Date, default: null },

}, { timestamps: true });

SalaryStructureSchema.index({ userIdStr: 1 });
SalaryStructureSchema.index({ status: 1 });

export const SalaryStructure = mongoose.model('SalaryStructure', SalaryStructureSchema);
