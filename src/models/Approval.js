import mongoose from 'mongoose';

const ApprovalSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  employeeName: { type: String, required: true },
  role: String,
  avatar: String,
  type: { type: String, required: true },
  details: String,
  subDetails: String,
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  dateSubmitted: String
}, { timestamps: true });

export const Approval = mongoose.model('Approval', ApprovalSchema);
