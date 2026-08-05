import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import mongoose from 'mongoose';

// Resolve .env from project root (two directories up from src/config/)
const __dbFilename = fileURLToPath(import.meta.url);
const __dbDirname = dirname(__dbFilename);
dotenv.config({ path: resolve(__dbDirname, '..', '..', '.env') });

export async function connectDB() {
  try {
    const env = process.env.NODE_ENV || 'development';
    const defaultUri = `mongodb://127.0.0.1:27017/jrkc_hr_${env}`;
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL || defaultUri;

    console.log(`Connecting to MongoDB (${env} environment)...`);
    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 2000,
      connectTimeoutMS: 3000
    });
    console.log(`MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    console.log(`MongoDB connection not active (${error.message}). Operating in-memory fallback mode.`);
  }
}
