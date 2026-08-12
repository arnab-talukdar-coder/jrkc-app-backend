/**
 * System Data Seeder (Safe & Non-Destructive)
 * Ensures default CMD (JRKCRIPL/001) and HR (JRKCRIPL/002) system accounts exist
 * ONLY if they are not already present in the database.
 * Does NOT delete, overwrite, or remove any employee data or user accounts.
 */

import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { Employee } from '../models/Employee.js';
import { HRSettings } from '../models/HRSettings.js';

export async function seedDevelopmentData(targetEmail = '', memEmployees = [], memApprovals = [], memPayslips = [], saveDiskStore = () => {}) {
  try {
    const isDbConnected = mongoose.connection.readyState === 1;

    // Ensure HR Settings exist with default rules
    if (isDbConnected) {
      let settings = await HRSettings.findOne({ id: 'HR_SETTINGS_GLOBAL' });
      if (!settings) {
        await HRSettings.create({
          id: 'HR_SETTINGS_GLOBAL',
          lwpDeductionBasis: 'basic',
          workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        });
      }
    }

    const hashedAdminPassword = await bcrypt.hash('Abhishek@09', 10);
    const hashedHrPassword = await bcrypt.hash('Abhishek@09', 10);

    // 1. System CMD Account (JRKCRIPL/001)
    const cmdData = {
      id: 'JRKCRIPL/001',
      idCardNo: 'JRKCRIPL/001',
      name: 'CMD',
      email: 'cmd@jrkcrail.com',
      password: hashedAdminPassword,
      role: 'Managing Director',
      userRole: 'Admin',
      department: 'Management',
      avatar: 'https://ui-avatars.com/api/?name=CMD&background=0284c7&color=fff&bold=true',
      status: 'Clocked Out',
      accountStatus: 'approved',
      joiningDate: '2024-01-01',
      phone: '+91 9999999999',
      ptoDays: 18,
      sickDays: 10,
      casualDays: 10,
      recentLogs: []
    };

    // 2. System HR Account (JRKCRIPL/002)
    const hrData = {
      id: 'JRKCRIPL/002',
      idCardNo: 'JRKCRIPL/002',
      name: 'HR',
      email: 'hr@jrkcrail.com',
      password: hashedHrPassword,
      role: 'HR Manager',
      userRole: 'HR',
      department: 'Human Resources',
      avatar: 'https://ui-avatars.com/api/?name=HR&background=7c3aed&color=fff&bold=true',
      status: 'Clocked Out',
      accountStatus: 'approved',
      joiningDate: '2024-01-15',
      phone: '+91 9888888888',
      ptoDays: 18,
      sickDays: 10,
      casualDays: 10,
      recentLogs: []
    };

    if (isDbConnected) {
      // Create CMD user ONLY if not already in DB
      let cmdUser = await Employee.findOne({ $or: [{ id: 'JRKCRIPL/001' }, { email: 'cmd@jrkcrail.com' }] });
      if (!cmdUser) {
        await Employee.create(cmdData);
        console.log(`✅ Default CMD Account created in DB: cmd@jrkcrail.com (ID: JRKCRIPL/001)`);
      }

      // Create HR user ONLY if not already in DB
      let hrUser = await Employee.findOne({ $or: [{ id: 'JRKCRIPL/002' }, { email: 'hr@jrkcrail.com' }] });
      if (!hrUser) {
        await Employee.create(hrData);
        console.log(`✅ Default HR Account created in DB: hr@jrkcrail.com (ID: JRKCRIPL/002)`);
      }
    }
  } catch (err) {
    console.error(`❌ Data seeding error:`, err.message);
  }
}
