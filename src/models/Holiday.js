import mongoose from 'mongoose';

const HolidaySchema = new mongoose.Schema({
  date:        { type: String, required: true, unique: true },  // YYYY-MM-DD
  name:        { type: String, required: true },
  description: { type: String, default: '' },
  type: {
    type: String,
    enum: ['National', 'Company', 'Regional', 'Optional'],
    default: 'Company'
  },
  addedBy:     { type: String, default: '' },  // HR user ID
  addedByName: { type: String, default: '' },
}, { timestamps: true });

HolidaySchema.index({ date: 1 });
HolidaySchema.index({ type: 1 });

export const Holiday = mongoose.model('Holiday', HolidaySchema);
