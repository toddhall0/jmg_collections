import { Router } from 'express';
import { db } from '../database.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import crypto from 'crypto';

const router = Router();

// Generate a share link for a case (admin and internal counsel)
router.post('/case/:caseId', authenticateToken, requireRole('admin', 'internal_counsel'), (req, res) => {
  const caseId = req.params.caseId;

  // Check case exists
  const caseData = db.prepare('SELECT id, case_number FROM cases WHERE id = ?').get(caseId);
  if (!caseData) {
    return res.status(404).json({ error: 'Case not found' });
  }

  // Generate a unique token
  const shareToken = crypto.randomBytes(32).toString('hex');

  // Set expiration to 30 days from now
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  try {
    // Deactivate any existing share links for this case
    db.prepare(`
      UPDATE case_share_links
      SET expires_at = datetime('now')
      WHERE case_id = ? AND expires_at > datetime('now')
    `).run(caseId);

    // Create new share link
    const result = db.prepare(`
      INSERT INTO case_share_links (case_id, share_token, expires_at, created_by)
      VALUES (?, ?, ?, ?)
    `).run(caseId, shareToken, expiresAt.toISOString(), req.user.id);

    const shareLink = db.prepare('SELECT * FROM case_share_links WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({
      shareLink,
      shareUrl: `/shared/case/${shareToken}`,
      message: 'Share link created successfully. Link expires in 30 days.'
    });
  } catch (error) {
    console.error('Error creating share link:', error);
    res.status(500).json({ error: 'Failed to create share link' });
  }
});

// Get active share link for a case (admin and internal counsel)
router.get('/case/:caseId', authenticateToken, requireRole('admin', 'internal_counsel'), (req, res) => {
  const caseId = req.params.caseId;

  const shareLink = db.prepare(`
    SELECT sl.*, u.full_name as created_by_name
    FROM case_share_links sl
    JOIN users u ON sl.created_by = u.id
    WHERE sl.case_id = ? AND sl.expires_at > datetime('now')
    ORDER BY sl.created_at DESC
    LIMIT 1
  `).get(caseId);

  if (!shareLink) {
    return res.json({ shareLink: null });
  }

  res.json({
    shareLink,
    shareUrl: `/shared/case/${shareLink.share_token}`
  });
});

// Revoke a share link (admin and internal counsel)
router.delete('/:linkId', authenticateToken, requireRole('admin', 'internal_counsel'), (req, res) => {
  const linkId = req.params.linkId;

  const existing = db.prepare('SELECT * FROM case_share_links WHERE id = ?').get(linkId);
  if (!existing) {
    return res.status(404).json({ error: 'Share link not found' });
  }

  try {
    // Set expiration to now to revoke
    db.prepare(`
      UPDATE case_share_links
      SET expires_at = datetime('now')
      WHERE id = ?
    `).run(linkId);

    res.json({ message: 'Share link revoked successfully' });
  } catch (error) {
    console.error('Error revoking share link:', error);
    res.status(500).json({ error: 'Failed to revoke share link' });
  }
});

// Public endpoint - View shared case (no authentication required)
router.get('/view/:token', (req, res) => {
  const token = req.params.token;

  // Find the share link
  const shareLink = db.prepare(`
    SELECT * FROM case_share_links
    WHERE share_token = ?
  `).get(token);

  if (!shareLink) {
    return res.status(404).json({ error: 'Share link not found' });
  }

  // Check if expired
  if (new Date(shareLink.expires_at) < new Date()) {
    return res.status(410).json({ error: 'This share link has expired' });
  }

  // Get case data
  const caseData = db.prepare(`
    SELECT c.*,
           lc.firm_name as local_counsel_firm,
           lc.attorney_name as local_counsel_attorney
    FROM cases c
    LEFT JOIN local_counsel_contacts lc ON c.assigned_local_counsel_id = lc.id
    WHERE c.id = ?
  `).get(shareLink.case_id);

  if (!caseData) {
    return res.status(404).json({ error: 'Case not found' });
  }

  // Update view count
  db.prepare(`
    UPDATE case_share_links
    SET view_count = view_count + 1, last_viewed_at = datetime('now')
    WHERE id = ?
  `).run(shareLink.id);

  // Get recent communications (limited info for client view)
  const communications = db.prepare(`
    SELECT communication_date, type, summary
    FROM communications
    WHERE case_id = ?
    ORDER BY communication_date DESC
    LIMIT 10
  `).all(shareLink.case_id);

  // Return sanitized case data (hide sensitive internal info)
  res.json({
    case: {
      case_number: caseData.case_number,
      case_name: caseData.case_name,
      defendant_name: caseData.defendant_name,
      amount_claimed: caseData.amount_claimed,
      current_stage: caseData.current_stage,
      resolution_status: caseData.resolution_status,
      amount_recovered: caseData.amount_recovered,
      date_opened: caseData.date_opened,
      date_closed: caseData.date_closed,
      local_counsel_firm: caseData.local_counsel_firm,
      local_counsel_attorney: caseData.local_counsel_attorney
    },
    communications,
    expires_at: shareLink.expires_at
  });
});

export default router;
