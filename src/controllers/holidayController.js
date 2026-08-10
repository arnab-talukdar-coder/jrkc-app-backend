import mongoose from 'mongoose';
import { Holiday } from '../models/Holiday.js';
import { memHolidays, saveDiskStore } from '../data/store.js';
import { sanitizeString } from '../middleware/auth.js';

export const getHolidays = async (req, res) => {
  const { year } = req.query;
  try {
    if (mongoose.connection.readyState === 1) {
      const query = year ? { year: Number(year) } : {};
      return res.json(await Holiday.find(query).sort({ date: 1 }));
    }
  } catch (e) {}
  let list = [...memHolidays];
  if (year) list = list.filter(h => h.year === Number(year));
  res.json(list.sort((a, b) => new Date(a.date) - new Date(b.date)));
};

export const createHoliday = async (req, res) => {
  const { name, date, type, description } = req.body;
  if (!name || !date) return res.status(400).json({ error: 'Name and date are required' });

  const holidayDate = new Date(date);
  const holiday = {
    id: `HOL-${Date.now().toString(36).toUpperCase()}`,
    name: sanitizeString(name), date: holidayDate,
    type: type || 'company', year: holidayDate.getFullYear(),
    description: sanitizeString(description) || '',
    createdBy: req.user.name || ''
  };

  try { if (mongoose.connection.readyState === 1) { await Holiday.create(holiday); return res.status(201).json(holiday); } } catch (e) {}
  memHolidays.push(holiday);
  saveDiskStore();
  res.status(201).json(holiday);
};

export const updateHoliday = async (req, res) => {
  const { id } = req.params;
  const { name, date, type, description } = req.body;
  const updateData = {};
  if (name) updateData.name = sanitizeString(name);
  if (date) { updateData.date = new Date(date); updateData.year = new Date(date).getFullYear(); }
  if (type) updateData.type = type;
  if (description !== undefined) updateData.description = sanitizeString(description);

  try {
    if (mongoose.connection.readyState === 1) {
      const updated = await Holiday.findOneAndUpdate({ id }, updateData, { new: true });
      if (updated) return res.json(updated);
    }
  } catch (e) {}
  const h = memHolidays.find(x => x.id === id);
  if (h) { Object.assign(h, updateData); saveDiskStore(); return res.json(h); }
  res.status(404).json({ error: 'Holiday not found' });
};

export const deleteHoliday = async (req, res) => {
  const { id } = req.params;
  try {
    if (mongoose.connection.readyState === 1) {
      await Holiday.findOneAndDelete({ id });
    }
  } catch (e) {}
  const index = memHolidays.findIndex(h => h.id === id);
  if (index !== -1) memHolidays.splice(index, 1);
  saveDiskStore();
  res.json({ message: 'Holiday deleted' });
};
