import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from '../database.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

// Create an invite (admin and internal counsel)
router.post('/', authenticateToken, requireRole('admin', 'internal_counsel'), (req, res) => {
  const { email, role } = req.body;

  if (!email || !role) {
    return res.status(400).json({ error: 'Email and role are required' });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  // Validate role
  const validRoles = ['admin', 'internal_counsel', 'client', 'local_counsel'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  // Check if email is already registered
  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existingUser) {
    return res.status(400).json({ error: 'A user with this email already exists' });
  }

  // Check if there's already a pending invite for this email
  const existingInvite = db.prepare(`
    SELECT id FROM user_invites
    WHERE email = ? AND used_at IS NULL AND expires_at > datetime('now')
  `).get(email);
  if (existingInvite) {
    return res.status(400).json({ error: 'An active invite already exists for this email' });
  }

  try {
    // Generate invite token
    const inviteToken = crypto.randomBytes(32).toString('hex');

    // Set expiration to 7 days from now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const result = db.prepare(`
      INSERT INTO user_invites (email, role, invite_token, expires_at, invited_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(email, role, inviteToken, expiresAt.toISOString(), req.user.id);

    const invite = db.prepare('SELECT * FROM user_invites WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({
      invite: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        expires_at: invite.expires_at,
        invite_token: invite.invite_token
      },
      message: 'Invite created successfully'
    });
  } catch (error) {
    console.error('Error creating invite:', error);
    res.status(500).json({ error: 'Failed to create invite' });
  }
});

// Get all pending invites (admin and internal counsel)
router.get('/', authenticateToken, requireRole('admin', 'internal_counsel'), (req, res) => {
  const invites = db.prepare(`
    SELECT i.*, u.full_name as invited_by_name
    FROM user_invites i
    LEFT JOIN users u ON i.invited_by = u.id
    WHERE i.used_at IS NULL
    ORDER BY i.created_at DESC
  `).all();

  // Add status to each invite
  const now = new Date();
  for (const invite of invites) {
    const expiresAt = new Date(invite.expires_at);
    invite.is_expired = expiresAt < now;
  }

  res.json({ invites });
});

// Revoke an invite (admin and internal counsel)
router.delete('/:id', authenticateToken, requireRole('admin', 'internal_counsel'), (req, res) => {
  const invite = db.prepare('SELECT id FROM user_invites WHERE id = ? AND used_at IS NULL').get(req.params.id);

  if (!invite) {
    return res.status(404).json({ error: 'Invite not found or already used' });
  }

  db.prepare('DELETE FROM user_invites WHERE id = ?').run(req.params.id);
  res.json({ message: 'Invite revoked successfully' });
});

// Validate an invite token (public endpoint)
router.get('/validate/:token', (req, res) => {
  const invite = db.prepare(`
    SELECT id, email, role, expires_at
    FROM user_invites
    WHERE invite_token = ? AND used_at IS NULL
  `).get(req.params.token);

  if (!invite) {
    return res.status(404).json({ error: 'Invalid or expired invite' });
  }

  const expiresAt = new Date(invite.expires_at);
  if (expiresAt < new Date()) {
    return res.status(400).json({ error: 'This invite has expired' });
  }

  res.json({
    valid: true,
    email: invite.email,
    role: invite.role
  });
});

// Complete registration with invite token (public endpoint)
router.post('/register/:token', (req, res) => {
  const { token } = req.params;
  const { username, password, full_name } = req.body;

  // Validate input
  if (!username || !password || !full_name) {
    return res.status(400).json({ error: 'Username, password, and full name are required' });
  }

  if (username.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  // Find and validate the invite
  const invite = db.prepare(`
    SELECT id, email, role, expires_at
    FROM user_invites
    WHERE invite_token = ? AND used_at IS NULL
  `).get(token);

  if (!invite) {
    return res.status(404).json({ error: 'Invalid or expired invite' });
  }

  const expiresAt = new Date(invite.expires_at);
  if (expiresAt < new Date()) {
    return res.status(400).json({ error: 'This invite has expired' });
  }

  // Check if username is already taken
  const existingUsername = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existingUsername) {
    return res.status(400).json({ error: 'Username is already taken' });
  }

  // Check if email is already registered (edge case)
  const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(invite.email);
  if (existingEmail) {
    return res.status(400).json({ error: 'An account with this email already exists' });
  }

  try {
    // Create the user
    const hashedPassword = bcrypt.hashSync(password, 10);
    const userResult = db.prepare(`
      INSERT INTO users (username, email, password, full_name, role, active)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(username, invite.email, hashedPassword, full_name, invite.role);

    // Mark the invite as used
    db.prepare(`
      UPDATE user_invites
      SET used_at = datetime('now'), used_by_user_id = ?
      WHERE id = ?
    `).run(userResult.lastInsertRowid, invite.id);

    const user = db.prepare(`
      SELECT id, username, email, full_name, role
      FROM users WHERE id = ?
    `).get(userResult.lastInsertRowid);

    res.status(201).json({
      user,
      message: 'Account created successfully. You can now log in.'
    });
  } catch (error) {
    console.error('Error completing registration:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// Resend/regenerate an invite (admin and internal counsel)
router.post('/:id/resend', authenticateToken, requireRole('admin', 'internal_counsel'), (req, res) => {
  const invite = db.prepare('SELECT * FROM user_invites WHERE id = ? AND used_at IS NULL').get(req.params.id);

  if (!invite) {
    return res.status(404).json({ error: 'Invite not found or already used' });
  }

  try {
    // Generate new token and extend expiration
    const newToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    db.prepare(`
      UPDATE user_invites
      SET invite_token = ?, expires_at = ?
      WHERE id = ?
    `).run(newToken, expiresAt.toISOString(), req.params.id);

    const updatedInvite = db.prepare('SELECT * FROM user_invites WHERE id = ?').get(req.params.id);

    res.json({
      invite: {
        id: updatedInvite.id,
        email: updatedInvite.email,
        role: updatedInvite.role,
        expires_at: updatedInvite.expires_at,
        invite_token: updatedInvite.invite_token
      },
      message: 'Invite regenerated successfully'
    });
  } catch (error) {
    console.error('Error regenerating invite:', error);
    res.status(500).json({ error: 'Failed to regenerate invite' });
  }
});

export default router;
