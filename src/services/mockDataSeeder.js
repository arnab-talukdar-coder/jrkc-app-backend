/**
 * Development Mock Data Seeder
 * Ensures CMD (JRKCRIPL/001) and HR (JRKCRIPL/002) accounts exist,
 * updates existing DB records to JRKCRIPL/001 and JRKCRIPL/002,
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
      // 1. Update any existing Admin / CMD user in DB to JRKCRIPL/001
      await Employee.updateMany(
        { $or: [{ userRole: 'Admin' }, { role: /Director/i }, { role: /CMD/i }, { email: 'admin@jrkc.com' }, { email: 'cmd@jrkcrail.com' }, { id: 'ADM-CMD' }, { id: /^ADM-/i }] },
        { $set: { id: 'JRKCRIPL/001', idCardNo: 'JRKCRIPL/001', name: 'CMD' } }
      );

      // 2. Update any existing HR user in DB to JRKCRIPL/002
      await Employee.updateMany(
        { $or: [{ userRole: 'HR' }, { role: /HR/i }, { email: 'hr@jrkc.com' }, { email: 'hr@jrkcrail.com' }, { id: 'ADM-HR' }, { id: /^HR-/i }] },
        { $set: { id: 'JRKCRIPL/002', idCardNo: 'JRKCRIPL/002', name: 'HR' } }
      );

      // 3. Ensure CMD user exists
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
        if (!cmdUser.avatar || cmdUser.avatar.includes('unsplash.com')) cmdUser.avatar = cmdData.avatar;
        await cmdUser.save();
      }

      // 4. Ensure HR user exists
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
        if (!hrUser.avatar || hrUser.avatar.includes('unsplash.com')) hrUser.avatar = hrData.avatar;
        await hrUser.save();
      }

      // 5. Delete all non-CMD/HR employees
      await Employee.deleteMany({ id: { $nin: ['JRKCRIPL/001', 'JRKCRIPL/002'] } });
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
