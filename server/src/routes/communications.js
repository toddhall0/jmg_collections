import { Router } from 'express';
import { db } from '../database.js';
import { authenticateToken, canAccessCase } from '../middleware/auth.js';

const router = Router();

const VALID_TYPES = [
  'Phone Call - Outbound',
  'Phone Call - Inbound',
  'Email - Sent',
  'Email - Received',
  'Letter - Sent',
  'Letter - Received',
  'In-Person Meeting',
  'Other'
];

// Get all communications for a case
router.get('/case/:caseId', authenticateToken, canAccessCase, (req, res) => {
  const { caseId } = req.params;

  const communications = db.prepare(`
    SELECT c.*, u.full_name as author_name
    FROM communications c
    JOIN users u ON c.created_by = u.id
    WHERE c.case_id = ?
    ORDER BY c.communication_date DESC, c.created_at DESC
  `).all(caseId);

  res.json({ communications });
});

// Get communication types
router.get('/types', authenticateToken, (req, res) => {
  res.json({ types: VALID_TYPES });
});

// Create a new communication
router.post('/case/:caseId', authenticateToken, canAccessCase, (req, res) => {
  const { caseId } = req.params;
  const {
    communication_date,
    type,
    contact_person,
    summary,
    follow_up_required,
    follow_up_date
  } = req.body;

  // Client users cannot log communications
  if (req.user.role === 'client') {
    return res.status(403).json({ error: 'Clients cannot log communications' });
  }

  if (!communication_date) {
    return res.status(400).json({ error: 'Communication date is required' });
  }

  if (!type || !VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: 'Valid communication type is required' });
  }

  // Verify case exists
  const caseExists = db.prepare('SELECT id FROM cases WHERE id = ?').get(caseId);
  if (!caseExists) {
    return res.status(404).json({ error: 'Case not found' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO communications (
        case_id, communication_date, type, contact_person, summary,
        follow_up_required, follow_up_date, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      caseId,
      communication_date,
      type,
      contact_person || null,
      summary || null,
      follow_up_required ? 1 : 0,
      follow_up_required && follow_up_date ? follow_up_date : null,
      req.user.id
    );

    const communication = db.prepare(`
      SELECT c.*, u.full_name as author_name
      FROM communications c
      JOIN users u ON c.created_by = u.id
      WHERE c.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json({ communication, message: 'Communication logged successfully' });
  } catch (error) {
    console.error('Error creating communication:', error);
    res.status(500).json({ error: 'Failed to log communication' });
  }
});

// Update a communication (only by creator or admin)
router.put('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const {
    communication_date,
    type,
    contact_person,
    summary,
    follow_up_required,
    follow_up_date
  } = req.body;

  // Get existing communication
  const existing = db.prepare(`
    SELECT c.*, ca.user_id as assigned_user
    FROM communications c
    LEFT JOIN case_assignments ca ON c.case_id = ca.case_id AND ca.user_id = ?
    WHERE c.id = ?
  `).get(req.user.id, id);

  if (!existing) {
    return res.status(404).json({ error: 'Communication not found' });
  }

  // Check permissions: only creator or admin can edit
  if (req.user.role !== 'admin' && existing.created_by !== req.user.id) {
    return res.status(403).json({ error: 'You can only edit your own communications' });
  }

  // Local counsel must be assigned to the case
  if (req.user.role === 'local_counsel' && !existing.assigned_user) {
    return res.status(403).json({ error: 'You are not assigned to this case' });
  }

  // Client cannot edit
  if (req.user.role === 'client') {
    return res.status(403).json({ error: 'Clients cannot edit communications' });
  }

  if (type && !VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: 'Invalid communication type' });
  }

  const updates = [];
  const values = [];

  if (communication_date) { updates.push('communication_date = ?'); values.push(communication_date); }
  if (type) { updates.push('type = ?'); values.push(type); }
  if (contact_person !== undefined) { updates.push('contact_person = ?'); values.push(contact_person || null); }
  if (summary !== undefined) { updates.push('summary = ?'); values.push(summary || null); }
  if (follow_up_required !== undefined) {
    updates.push('follow_up_required = ?');
    values.push(follow_up_required ? 1 : 0);
  }
  if (follow_up_date !== undefined) {
    updates.push('follow_up_date = ?');
    values.push(follow_up_date || null);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  updates.push('updated_at = datetime("now")');
  values.push(id);

  db.prepare(`UPDATE communications SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const communication = db.prepare(`
    SELECT c.*, u.full_name as author_name
    FROM communications c
    JOIN users u ON c.created_by = u.id
    WHERE c.id = ?
  `).get(id);

  res.json({ communication, message: 'Communication updated successfully' });
});

// Delete a communication (admin only)
router.delete('/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can delete communications' });
  }

  const { id } = req.params;

  const existing = db.prepare('SELECT id FROM communications WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Communication not found' });
  }

  db.prepare('DELETE FROM communications WHERE id = ?').run(id);
  res.json({ message: 'Communication deleted successfully' });
});

export default router;
