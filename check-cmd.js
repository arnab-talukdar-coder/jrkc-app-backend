import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/jrkc_hr_production';

async function checkCmd() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const cmd = await db.collection('employees').findOne({ email: 'cmd@jrkcrail.com' });
  console.log(JSON.stringify(cmd, null, 2));
  mongoose.disconnect();
}
checkCmd();
