import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const SalaryStructureEmbedSchema = new mongoose.Schema({
  basic:           { type: Number, default: 0 },
  hra:             { type: Number, default: 0 },
  da:              { type: Number, default: 0 },
  specialAllowance:{ type: Number, default: 0 },
  conveyance:      { type: Number, default: 0 },
  medical:         { type: Number, default: 0 },
  otherAllowances: { type: Number, default: 0 },
  employerPf:      { type: Number, default: 0 },
  employeePf:      { type: Number, default: 0 },
  esi:             { type: Number, default: 0 },
  professionalTax: { type: Number, default: 0 },
  tds:             { type: Number, default: 0 },
  otherDeductions: { type: Number, default: 0 },
}, { _id: false });

const LocationSchema = new mongoose.Schema({
  latitude:       { type: Number, required: true },
  longitude:      { type: Number, required: true },
  address:        { type: String, default: '' },
  geofenceRadius: { type: Number, default: 100 },  // meters
}, { _id: false });

const UserSchema = new mongoose.Schema({
  // Core identity
  name:       { type: String, required: true, trim: true },
  email:      { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone:      { type: String, default: '' },
  password:   { type: String, default: null },

  // Role
  userRole:   { type: String, enum: ['Director', 'HR', 'Employee'], default: 'Employee' },

  // Job info
  designation:  { type: String, default: '' },   // e.g. "Site Supervisor"
  department:   { type: String, default: '' },
  joiningDate:  { type: String, default: '' },
  station:      { type: String, default: '' },
  idCardNo:     { type: String, default: '' },
  validity:     { type: String, default: '' },

  // Personal
  dateOfBirth:  { type: String, default: '' },
  bloodGroup:   { type: String, default: '' },

  // HR assignment
  assignedHrId:    { type: String, default: '' },
  assignedHrName:  { type: String, default: '' },
  assignedHrEmail: { type: String, default: '' },

  // Account lifecycle
  accountStatus: {
    type: String,
    enum: ['pending_hr', 'pending_director', 'approved', 'rejected'],
    default: 'pending_hr'
  },
  mustChangePassword: { type: Boolean, default: false },

  // Avatar
  avatar:       { type: String, default: '' },
  pendingAvatar:{ type: String, default: '' },
  photoStatus:  { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },

  // Clock status
  clockStatus:  { type: String, enum: ['Clocked In', 'Clocked Out'], default: 'Clocked Out' },
  clockInTime:  { type: Date, default: null },

  // Leave balances
  earnedLeave:  { type: Number, default: 18 },
  sickLeave:    { type: Number, default: 10 },
  casualLeave:  { type: Number, default: 10 },
  optionalLeave:{ type: Number, default: 2 },

  // Salary (set via SalaryStructure collection)
  salaryConfigured: { type: Boolean, default: false },
  salaryApproved:   { type: Boolean, default: false },
  salaryStructure:  { type: SalaryStructureEmbedSchema, default: () => ({}) },

  // GPS geofence assigned by Director
  assignedLocation: { type: LocationSchema, default: null },

  // FCM push token
  fcmToken: { type: String, default: '' },

}, { timestamps: true });

// Indexes
UserSchema.index({ email: 1 });
UserSchema.index({ userRole: 1 });
UserSchema.index({ department: 1 });
UserSchema.index({ accountStatus: 1 });
UserSchema.index({ assignedHrId: 1 });

// Hash password before save
UserSchema.pre('save', async function (next) {
  if (this.isModified('password') && this.password &&
      !this.password.startsWith('$2b$') && !this.password.startsWith('$2a$')) {
    this.password = await bcrypt.hash(this.password, 12);
  }
  next();
});

UserSchema.methods.comparePassword = async function (candidate) {
  if (!this.password) return false;
  return bcrypt.compare(candidate, this.password);
};

export const User = mongoose.model('User', UserSchema);
