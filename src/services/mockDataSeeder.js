/**
 * Development Mock Data Seeder
 * Ensures CMD (JRKCRIPL/001) and HR (JRKCRIPL/002) accounts exist,
 * and clears out non-CMD/HR user data.
 */

import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { Employee } from '../models/Employee.js';
import { HRSettings } from '../models/HRSettings.js';

export async function seedDevelopmentData(targetEmail = '', memEmployees = [], memApprovals = [], memPayslips = [], saveDiskStore = () => {}) {
  try {
    console.log(`🌱 Seeding initial HRMS system accounts (CMD: JRKCRIPL/001 & HR: JRKCRIPL/002)...`);
    const isDbConnected = mongoose.connection.readyState === 1;

    // Ensure HR Settings exist with default LWP rule
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

    // 1. Seed CMD Account (JRKCRIPL/001)
    const cmdData = {
      id: 'JRKCRIPL/001',
      idCardNo: 'JRKCRIPL/001',
      name: 'CMD',
      email: 'cmd@jrkcrail.com',
      password: hashedAdminPassword,
      role: 'Managing Director',
      userRole: 'Admin',
      department: 'Management',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
      status: 'Clocked Out',
      accountStatus: 'approved',
      joiningDate: '2024-01-01',
      phone: '+91 9999999999',
      ptoDays: 18,
      sickDays: 10,
      casualDays: 10,
      recentLogs: []
    };

    // 2. Seed HR Account (JRKCRIPL/002)
    const hrData = {
      id: 'JRKCRIPL/002',
      idCardNo: 'JRKCRIPL/002',
      name: 'HR',
      email: 'hr@jrkcrail.com',
      password: hashedHrPassword,
      role: 'HR Manager',
      userRole: 'HR',
      department: 'Human Resources',
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150',
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
      // Keep only CMD and HR in Database
      await Employee.deleteMany({ email: { $nin: ['cmd@jrkcrail.com', 'hr@jrkcrail.com', 'admin@jrkc.com', 'hr@jrkc.com'] } });

      let cmdUser = await Employee.findOne({ $or: [{ id: 'JRKCRIPL/001' }, { email: 'cmd@jrkcrail.com' }] });
      if (!cmdUser) {
        await Employee.create(cmdData);
        console.log(`✅ CMD Account created in DB: cmd@jrkcrail.com (ID: JRKCRIPL/001)`);
      } else {
        cmdUser.id = 'JRKCRIPL/001';
        cmdUser.idCardNo = 'JRKCRIPL/001';
        cmdUser.name = 'CMD';
        cmdUser.userRole = 'Admin';
        if (!cmdUser.password) cmdUser.password = hashedAdminPassword;
        await cmdUser.save();
      }

      let hrUser = await Employee.findOne({ $or: [{ id: 'JRKCRIPL/002' }, { email: 'hr@jrkcrail.com' }] });
      if (!hrUser) {
        await Employee.create(hrData);
        console.log(`✅ HR Account created in DB: hr@jrkcrail.com (ID: JRKCRIPL/002)`);
      } else {
        hrUser.id = 'JRKCRIPL/002';
        hrUser.idCardNo = 'JRKCRIPL/002';
        hrUser.name = 'HR';
        hrUser.userRole = 'HR';
        if (!hrUser.password) hrUser.password = hashedHrPassword;
        await hrUser.save();
      }
    }

    // Keep only CMD & HR in memory array
    memEmployees.length = 0;
    memEmployees.push(cmdData, hrData);

    saveDiskStore();
    console.log(`✅ Initial accounts setup complete: CMD (JRKCRIPL/001) and HR (JRKCRIPL/002) preserved.`);
  } catch (err) {
    console.error(`❌ Data seeding error:`, err.message);
  }
}
