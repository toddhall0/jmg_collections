import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../database.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

// Get all users (admin only)
router.get('/', authenticateToken, requireRole('admin'), (req, res) => {
  const users = db.prepare(`
    SELECT id, username, email, full_name, role, active, created_at
    FROM users ORDER BY created_at DESC
  `).all();

  res.json({ users });
});

// Get local counsel users (for case assignment)
router.get('/local-counsel', authenticateToken, requireRole('admin'), (req, res) => {
  const users = db.prepare(`
    SELECT id, username, email, full_name
    FROM users WHERE role = 'local_counsel' AND active = 1
    ORDER BY full_name
  `).all();

  res.json({ users });
});

// Get single user
router.get('/:id', authenticateToken, requireRole('admin'), (req, res) => {
  const user = db.prepare(`
    SELECT id, username, email, full_name, role, active, created_at
    FROM users WHERE id = ?
  `).get(req.params.id);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({ user });
});

// Create user (admin only)
router.post('/', authenticateToken, requireRole('admin'), (req, res) => {
  const { username, email, password, full_name, role } = req.body;

  if (!username || !email || !password || !full_name || !role) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (!['admin', 'client', 'local_counsel'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  // Check for existing username or email
  const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?')
    .get(username, email);

  if (existing) {
    return res.status(400).json({ error: 'Username or email already exists' });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);

  try {
    const result = db.prepare(`
      INSERT INTO users (username, email, password, full_name, role)
      VALUES (?, ?, ?, ?, ?)
    `).run(username, email, hashedPassword, full_name, role);

    const user = db.prepare(`
      SELECT id, username, email, full_name, role, active, created_at
      FROM users WHERE id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json({ user, message: 'User created successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user (admin only)
router.put('/:id', authenticateToken, requireRole('admin'), (req, res) => {
  const { username, email, full_name, role, active, password } = req.body;
  const userId = req.params.id;

  const existingUser = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!existingUser) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Check for duplicate username/email
  if (username || email) {
    const duplicate = db.prepare(`
      SELECT id FROM users WHERE (username = ? OR email = ?) AND id != ?
    `).get(username, email, userId);

    if (duplicate) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }
  }

  const updates = [];
  const values = [];

  if (username) { updates.push('username = ?'); values.push(username); }
  if (email) { updates.push('email = ?'); values.push(email); }
  if (full_name) { updates.push('full_name = ?'); values.push(full_name); }
  if (role) { updates.push('role = ?'); values.push(role); }
  if (active !== undefined) { updates.push('active = ?'); values.push(active ? 1 : 0); }
  if (password) {
    updates.push('password = ?');
    values.push(bcrypt.hashSync(password, 10));
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  updates.push('updated_at = datetime("now")');
  values.push(userId);

  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const user = db.prepare(`
    SELECT id, username, email, full_name, role, active, created_at
    FROM users WHERE id = ?
  `).get(userId);

  res.json({ user, message: 'User updated successfully' });
});

// Delete user (admin only)
router.delete('/:id', authenticateToken, requireRole('admin'), (req, res) => {
  const userId = req.params.id;

  // Prevent deleting yourself
  if (parseInt(userId) === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(userId);

  res.json({ message: 'User deleted successfully' });
});

export default router;
