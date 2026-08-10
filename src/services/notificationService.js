import mongoose from 'mongoose';
import { Notification } from '../models/Notification.js';
import { Employee } from '../models/Employee.js';
import { memEmployees } from '../data/store.js';
import { sendExpoPushNotification } from './emailService.js';

export async function createNotification(notif) {
  const newNotif = {
    id: `NOTIF-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    read: false,
    createdAtDate: new Date().toISOString(),
    ...notif
  };
  try {
    if (notif.recipientEmail) {
      let emp = null;
      if (mongoose.connection.readyState === 1) emp = await Employee.findOne({ email: notif.recipientEmail });
      if (!emp) emp = memEmployees.find(e => e.email === notif.recipientEmail);
      if (emp && emp.expoPushToken) {
        sendExpoPushNotification(emp.expoPushToken, notif.title, notif.message, { type: notif.type });
      }
    }
    return await Notification.create(newNotif);
  } catch (e) {
    console.error('Notification create error:', e.message);
    return newNotif;
  }
}
