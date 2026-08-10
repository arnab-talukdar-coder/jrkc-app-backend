import mongoose from 'mongoose';
import { Announcement } from '../models/Announcement.js';
import { BankDetails } from '../models/BankDetails.js';
import { HRSettings } from '../models/HRSettings.js';
import { memAnnouncements } from '../data/store.js';
import { INITIAL_BANK_DETAILS } from '../data/initialData.js';

export const getAnnouncements = async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) return res.json(await Announcement.find().sort({ createdAt: -1 }));
  } catch (e) {}
  res.json(memAnnouncements);
};

export const getBankDetails = async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const bank = await BankDetails.findOne();
      if (bank) return res.json(bank);
    }
  } catch (e) {}
  res.json(INITIAL_BANK_DETAILS);
};

export const getHrSettingsAlias = async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      let settings = await HRSettings.findOne({ id: 'HR_SETTINGS_GLOBAL' });
      if (!settings) settings = await HRSettings.create({ id: 'HR_SETTINGS_GLOBAL' });
      return res.json(settings);
    }
  } catch (e) {}
  res.json({ id: 'HR_SETTINGS_GLOBAL', payrollWindowStart: 1, payrollWindowEnd: 7, workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] });
};

export const updateHrSettingsAlias = async (req, res) => {
  const updateData = { ...req.body, updatedBy: req.user.name || '' };
  delete updateData.id;
  try {
    if (mongoose.connection.readyState === 1) {
      const updated = await HRSettings.findOneAndUpdate({ id: 'HR_SETTINGS_GLOBAL' }, updateData, { new: true, upsert: true });
      return res.json(updated);
    }
  } catch (e) {}
  res.json({ id: 'HR_SETTINGS_GLOBAL', ...updateData });
};
