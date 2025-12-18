import jwt from 'jsonwebtoken';
import { db } from '../database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'collections-manager-secret-key-2025';

export function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      full_name: user.full_name
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    // Verify user still exists and is active
    const user = db.prepare('SELECT id, username, role, full_name, active FROM users WHERE id = ?').get(decoded.id);

    if (!user || !user.active) {
      return res.status(403).json({ error: 'User account is inactive or deleted' });
    }

    req.user = user;
    next();
  });
}

// Role-based authorization middleware
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

// Check if user can access a specific case
export function canAccessCase(req, res, next) {
  const caseId = req.params.id || req.params.caseId;

  if (!caseId) {
    return next();
  }

  // Admin and Client can access all cases
  if (req.user.role === 'admin' || req.user.role === 'client') {
    return next();
  }

  // Local counsel can only access assigned cases
  if (req.user.role === 'local_counsel') {
    // Check both case_assignments table and local_counsel_user_id field
    const hasAccess = db.prepare(`
      SELECT 1 FROM cases c
      WHERE c.id = ? AND (
        c.local_counsel_user_id = ?
        OR EXISTS (SELECT 1 FROM case_assignments WHERE case_id = c.id AND user_id = ?)
      )
    `).get(caseId, req.user.id, req.user.id);

    if (!hasAccess) {
      return res.status(403).json({ error: 'You are not assigned to this case' });
    }
  }

  next();
}

// Check if user can edit a case
export function canEditCase(req, res, next) {
  // Only admin can create/edit cases fully
  if (req.user.role === 'admin') {
    return next();
  }

  // Local counsel can update certain fields on assigned cases
  if (req.user.role === 'local_counsel') {
    const caseId = req.params.id;
    // Check both case_assignments table and local_counsel_user_id field
    const hasAccess = db.prepare(`
      SELECT 1 FROM cases c
      WHERE c.id = ? AND (
        c.local_counsel_user_id = ?
        OR EXISTS (SELECT 1 FROM case_assignments WHERE case_id = c.id AND user_id = ?)
      )
    `).get(caseId, req.user.id, req.user.id);

    if (!hasAccess) {
      return res.status(403).json({ error: 'You are not assigned to this case' });
    }

    // Local counsel can only update certain fields
    req.localCounselEdit = true;
    return next();
  }

  return res.status(403).json({ error: 'You do not have permission to edit cases' });
}
