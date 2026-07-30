import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { User } from '../models/User.js';

const JWT_SECRET = process.env.JWT_SECRET || 'jrkc-hrms-v2-secret';

// ── Validate email format ──────────────────────────────────────────────────
export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).toLowerCase());
}

// ── Sanitize string input ──────────────────────────────────────────────────
export function sanitizeString(str) {
  if (!str) return '';
  return String(str).trim().replace(/[<>]/g, '');
}

// ── Verify JWT and attach user to req ─────────────────────────────────────
export async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Attach lightweight payload — controllers can fetch full user if needed
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token.' });
  }
}

// ── Optional auth (doesn't block unauthenticated requests) ────────────────
export async function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch (_) { /* ignore */ }
  }
  next();
}

// ── RBAC: require one of the specified roles ───────────────────────────────
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    if (!roles.includes(req.user.userRole)) {
      return res.status(403).json({
        error: `Access denied. Required role: ${roles.join(' or ')}.`
      });
    }
    next();
  };
}

// ── Generate JWT ───────────────────────────────────────────────────────────
export function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
}
