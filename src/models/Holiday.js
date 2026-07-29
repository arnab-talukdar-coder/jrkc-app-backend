import mongoose from 'mongoose';

const HolidaySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  date: { type: Date, required: true },
  type: {
    type: String,
    enum: ['national', 'company', 'regional', 'optional'],
    default: 'company'
  },
  year: { type: Number, required: true },
  description: { type: String, default: '' },
  createdBy: { type: String, default: '' }
}, { timestamps: true });

HolidaySchema.index({ date: 1 });
HolidaySchema.index({ year: 1, type: 1 });

export const Holiday = mongoose.model('Holiday', HolidaySchema);
