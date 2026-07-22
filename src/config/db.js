import mongoose from 'mongoose';

export async function connectDB() {
  try {
    const env = process.env.NODE_ENV || 'development';
    const defaultUri = `mongodb://127.0.0.1:27017/jrkc_hr_${env}`;
    const mongoUri = process.env.MONGODB_URI || defaultUri;

    console.log(`Connecting to MongoDB (${env} environment)...`);
    const conn = await mongoose.connect(mongoUri);
    console.log(`MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    // Non-fatal fallback for local testing if mongo daemon isn't running locally yet
  }
}
