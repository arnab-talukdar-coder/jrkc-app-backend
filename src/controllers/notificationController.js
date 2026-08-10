import mongoose from 'mongoose';
import { Notification } from '../models/Notification.js';
import { memNotifications } from '../data/store.js';

export const getNotifications = async (req, res) => {
  const { targetRole, recipientEmail, recipientId } = req.query;
  try {
    if (mongoose.connection.readyState === 1) {
      let query = {};
      if (targetRole) {
        query.$or = [{ targetRole }, { targetRole: 'All' }, ...(recipientEmail ? [{ recipientEmail }] : []), ...(recipientId ? [{ recipientId }] : [])];
      }
      return res.json(await Notification.find(query).sort({ createdAt: -1 }).limit(100));
    }
  } catch (e) {}
  let list = [...memNotifications];
  if (targetRole) list = list.filter(n => n.targetRole === targetRole || n.targetRole === 'All' || (recipientEmail && n.recipientEmail === recipientEmail) || (recipientId && n.recipientId === recipientId));
  res.json(list.slice(0, 100));
};

export const markRead = async (req, res) => {
  const { id } = req.params;
  try {
    if (mongoose.connection.readyState === 1) {
      const updated = await Notification.findOneAndUpdate({ id }, { read: true }, { new: true });
      if (updated) return res.json(updated);
    }
  } catch (e) {}
  const n = memNotifications.find(x => x.id === id);
  if (n) { n.read = true; return res.json(n); }
  res.status(404).json({ error: 'Notification not found' });
};
