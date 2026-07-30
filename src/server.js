import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import crypto from 'crypto';

// Polyfill
if (!globalThis.crypto) globalThis.crypto = crypto;

// Load .env from project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '..', '.env'), override: true });

console.log(`🚀 JRKC HRMS v2 Backend Starting...`);
console.log(`📧 GMAIL_USER: ${process.env.GMAIL_USER || '❌ NOT SET'}`);
console.log(`🔑 JWT_SECRET: ${process.env.JWT_SECRET ? '✅ loaded' : '⚠️ using default'}`);

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { connectDB } from './config/db.js';

// Routes
import authRoutes           from './routes/auth.routes.js';
import userRoutes           from './routes/users.routes.js';
import registrationRoutes   from './routes/registrations.routes.js';
import attendanceRoutes     from './routes/attendance.routes.js';
import leaveRoutes          from './routes/leave.routes.js';
import holidayRoutes        from './routes/holiday.routes.js';
import salaryRoutes         from './routes/salary.routes.js';
import payrollRoutes        from './routes/payroll.routes.js';
import notificationRoutes   from './routes/notifications.routes.js';

const app = express();
const PORT = process.env.PORT || 5001;

// ── Security ──────────────────────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// ── CORS ──────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const origin = req.headers.origin;
  res.header('Access-Control-Allow-Origin', origin || '*');
  if (origin) res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── Body parsing ──────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Rate limiting ─────────────────────────────────────────────────────────
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });
const apiLimiter  = rateLimit({ windowMs: 60 * 1000, max: 200 });
app.use('/api/v2/auth', authLimiter);
app.use('/api/v2', apiLimiter);

// ── Health ────────────────────────────────────────────────────────────────
const healthHandler = (_, res) => res.json({
  status: 'ok',
  version: '2.0.0',
  timestamp: new Date().toISOString(),
  service: 'JRKC Rail HRMS v2'
});
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);
app.get('/api/v2/health', healthHandler);

// ── API Routes ────────────────────────────────────────────────────────────
app.use('/api/v2/auth',          authRoutes);
app.use('/api/v2/users',         userRoutes);
app.use('/api/v2/registrations', registrationRoutes);
app.use('/api/v2/attendance',    attendanceRoutes);
app.use('/api/v2/leaves',        leaveRoutes);
app.use('/api/v2/holidays',      holidayRoutes);
app.use('/api/v2/salary',        salaryRoutes);
app.use('/api/v2/payroll',       payrollRoutes);
app.use('/api/v2/notifications', notificationRoutes);

// ── 404 handler ───────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` }));

// ── Error handler ─────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

// ── Boot ──────────────────────────────────────────────────────────────────
async function start() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`✅ JRKC HRMS v2 running on port ${PORT}`);
    console.log(`📋 API prefix: /api/v2`);
    console.log(`🩺 Health: http://localhost:${PORT}/health`);
  });
}

start();
