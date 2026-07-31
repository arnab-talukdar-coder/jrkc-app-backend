import mongoose from 'mongoose';
import { User } from './models/User.js';

export async function seedDefaultUsers() {
  if (mongoose.connection.readyState !== 1) {
    console.log('ℹ️  Skipping MongoDB seed (database connection offline).');
    return;
  }
  try {
    // 1. Director account
    const directorEmail = 'director@jrkcrail.com';
    let director = await User.findOne({ email: directorEmail });
    if (!director) {
      director = await User.create({
        name: 'Director Admin',
        email: directorEmail,
        password: 'Director@2026',
        userRole: 'Director',
        designation: 'Managing Director',
        department: 'Administration',
        idCardNo: 'JRKCRIPL/DIR/001',
        joiningDate: new Date().toLocaleDateString('en-IN'),
        accountStatus: 'approved',
        mustChangePassword: false,
      });
      console.log('✅ Created default approved Director account: director@jrkcrail.com / Director@2026');
    } else if (director.accountStatus !== 'approved') {
      director.accountStatus = 'approved';
      director.mustChangePassword = false;
      await director.save();
    }

    // 2. HR account
    const hrEmail = 'hr@jrkcrail.com';
    let hr = await User.findOne({ email: hrEmail });
    if (!hr) {
      hr = await User.create({
        name: 'HR Admin',
        email: hrEmail,
        password: 'HrAdmin@2026',
        userRole: 'HR',
        designation: 'Senior HR Manager',
        department: 'HR',
        idCardNo: 'JRKCRIPL/HR/001',
        joiningDate: new Date().toLocaleDateString('en-IN'),
        accountStatus: 'approved',
        mustChangePassword: false,
      });
      console.log('✅ Created default approved HR account: hr@jrkcrail.com / HrAdmin@2026');
    } else if (hr.accountStatus !== 'approved') {
      hr.accountStatus = 'approved';
      hr.mustChangePassword = false;
      await hr.save();
    }
  } catch (err) {
    console.error('Seed users error:', err.message);
  }
}
