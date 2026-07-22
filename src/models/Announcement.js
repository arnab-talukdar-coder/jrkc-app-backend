import mongoose from 'mongoose';

const AnnouncementSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  type: String,
  time: String,
  title: { type: String, required: true },
  summary: { type: String, required: true },
  image: String
}, { timestamps: true });

export const Announcement = mongoose.model('Announcement', AnnouncementSchema);
