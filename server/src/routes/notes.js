import { Router } from 'express';
import { db } from '../database.js';
import { authenticateToken, canAccessCase } from '../middleware/auth.js';

const router = Router();

// Get all notes for a case
router.get('/case/:caseId', authenticateToken, canAccessCase, (req, res) => {
  const { caseId } = req.params;

  const notes = db.prepare(`
    SELECT n.*, u.full_name as author_name
    FROM case_notes n
    JOIN users u ON n.created_by = u.id
    WHERE n.case_id = ?
    ORDER BY n.created_at DESC
  `).all(caseId);

  res.json({ notes });
});

// Create a new note
router.post('/case/:caseId', authenticateToken, canAccessCase, (req, res) => {
  const { caseId } = req.params;
  const { content } = req.body;

  // Client users cannot add notes
  if (req.user.role === 'client') {
    return res.status(403).json({ error: 'Clients cannot add notes' });
  }

  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Note content is required' });
  }

  // Verify case exists
  const caseExists = db.prepare('SELECT id FROM cases WHERE id = ?').get(caseId);
  if (!caseExists) {
    return res.status(404).json({ error: 'Case not found' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO case_notes (case_id, content, created_by)
      VALUES (?, ?, ?)
    `).run(caseId, content.trim(), req.user.id);

    const note = db.prepare(`
      SELECT n.*, u.full_name as author_name
      FROM case_notes n
      JOIN users u ON n.created_by = u.id
      WHERE n.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json({ note, message: 'Note added successfully' });
  } catch (error) {
    console.error('Error creating note:', error);
    res.status(500).json({ error: 'Failed to create note' });
  }
});

export default router;
