import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '..', '..', '.env'), override: true });

export async function connectDB() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI ||
    `mongodb://127.0.0.1:27017/jrkc_hrms_v2`;

  console.log(`🔗 Connecting to MongoDB...`);
  try {
    const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
    console.log(`✅ MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
    return true;
  } catch (err) {
    console.warn(`⚠️  MongoDB unavailable (${err.message}). In-memory mode active.`);
    return false;
  }
}
