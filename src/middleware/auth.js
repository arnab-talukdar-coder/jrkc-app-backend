import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'jrkc-hrms-secret-2026';

/**
 * JWT Authentication Middleware
 * Verifies Bearer token from Authorization header
 */
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, email, userRole, name }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    return res.status(403).json({ error: 'Invalid authentication token.' });
  }
}

/**
 * Role-Based Access Control Middleware
 * Usage: requireRole('Admin') or requireRole('Admin', 'HR')
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.user.userRole)) {
      return res.status(403).json({ error: `Access denied. Required role: ${allowedRoles.join(' or ')}.` });
    }
    next();
  };
}

/**
 * Optional auth — sets req.user if token is valid, but doesn't block if missing
 */
export function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      // Token invalid, proceed without user
    }
  }
  next();
}

/**
 * Input validation helpers
 */
export function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function sanitizeString(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/[<>]/g, '').trim();
}
