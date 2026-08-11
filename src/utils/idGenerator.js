import mongoose from 'mongoose';
import { Employee } from '../models/Employee.js';

/**
 * Generates the next sequential employee ID in JRKCRIPL/XXX format.
 * Defaults to JRKCRIPL/001 (CMD) and JRKCRIPL/002 (HR).
 * Next onboarded employee will receive JRKCRIPL/003, JRKCRIPL/004, etc.
 */
export async function generateNextEmployeeId(memEmployees = []) {
  let highestNum = 2; // Threshold minimum since 001 = CMD and 002 = HR

  // Check in-memory employees array if present
  if (Array.isArray(memEmployees)) {
    for (const emp of memEmployees) {
      if (!emp) continue;
      const strToTest = emp.idCardNo || emp.id || '';
      const match = strToTest.match(/JRKCRIPL\/(\d+)/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > highestNum) {
          highestNum = num;
        }
      }
    }
  }

  // Check MongoDB database if connected
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    try {
      const dbEmployees = await Employee.find({}, { id: 1, idCardNo: 1 }).lean();
      for (const emp of dbEmployees) {
        if (!emp) continue;
        const strToTest = emp.idCardNo || emp.id || '';
        const match = strToTest.match(/JRKCRIPL\/(\d+)/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > highestNum) {
            highestNum = num;
          }
        }
      }
    } catch (err) {
      console.error('⚠️ Error fetching max employee ID from DB:', err.message);
    }
  }

  const nextNum = highestNum + 1;
  const paddedStr = String(nextNum).padStart(3, '0');
  return `JRKCRIPL/${paddedStr}`;
}
