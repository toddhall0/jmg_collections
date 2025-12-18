import { Router } from 'express';
import { db } from '../database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Global search endpoint
router.get('/', authenticateToken, (req, res) => {
  const { q, type } = req.query;

  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: 'Search query must be at least 2 characters' });
  }

  const searchTerm = `%${q.trim()}%`;
  const results = {
    cases: [],
    notes: [],
    total: 0
  };

  try {
    // Determine user access level
    const isAdmin = req.user.role === 'admin' || req.user.role === 'internal_counsel';
    const isClient = req.user.role === 'client';
    const isLocalCounsel = req.user.role === 'local_counsel';

    // Search cases (filter by type if specified)
    if (!type || type === 'cases' || type === 'all') {
      let caseQuery = `
        SELECT
          c.id,
          c.case_number,
          c.case_name,
          c.defendant_name,
          c.client_matter_reference,
          c.claim_description,
          c.current_stage,
          c.resolution_status,
          c.amount_claimed,
          c.date_opened,
          cc.name as category_name,
          cc.code as category_code
        FROM cases c
        LEFT JOIN case_categories cc ON c.category_id = cc.id
        WHERE (
          c.case_number LIKE ? OR
          c.case_name LIKE ? OR
          c.defendant_name LIKE ? OR
          c.defendant_contact_name LIKE ? OR
          c.client_matter_reference LIKE ? OR
          c.claim_description LIKE ? OR
          cc.name LIKE ? OR
          cc.code LIKE ?
        )
      `;

      const values = [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm];

      // Add role-based filtering
      if (isClient) {
        caseQuery += ` AND c.client_id = ?`;
        values.push(req.user.id);
      } else if (isLocalCounsel) {
        caseQuery += ` AND c.local_counsel_id = ?`;
        values.push(req.user.id);
      }

      caseQuery += ` ORDER BY c.updated_at DESC LIMIT 50`;

      const cases = db.prepare(caseQuery).all(...values);

      results.cases = cases.map(c => ({
        ...c,
        match_type: determineMatchType(c, q.trim()),
        result_type: 'case'
      }));
    }

    // Search notes (admin and internal_counsel only for now)
    if (isAdmin && (!type || type === 'notes' || type === 'all')) {
      let notesQuery = `
        SELECT
          n.id,
          n.case_id,
          n.content,
          n.created_at,
          c.case_number,
          c.case_name,
          c.defendant_name,
          u.full_name as created_by_name
        FROM notes n
        JOIN cases c ON n.case_id = c.id
        LEFT JOIN users u ON n.created_by = u.id
        WHERE n.content LIKE ?
      `;

      const values = [searchTerm];

      // Add role-based filtering for notes
      if (isClient) {
        notesQuery += ` AND c.client_id = ? AND n.is_internal = 0`;
        values.push(req.user.id);
      } else if (isLocalCounsel) {
        notesQuery += ` AND c.local_counsel_id = ? AND n.is_internal = 0`;
        values.push(req.user.id);
      }

      notesQuery += ` ORDER BY n.created_at DESC LIMIT 25`;

      const notes = db.prepare(notesQuery).all(...values);

      results.notes = notes.map(n => ({
        ...n,
        content_preview: getContentPreview(n.content, q.trim()),
        result_type: 'note'
      }));
    }

    results.total = results.cases.length + results.notes.length;

    res.json(results);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Quick search for autocomplete/typeahead
router.get('/quick', authenticateToken, (req, res) => {
  const { q } = req.query;

  if (!q || q.trim().length < 2) {
    return res.json({ results: [] });
  }

  const searchTerm = `%${q.trim()}%`;

  try {
    // Determine user access level
    const isClient = req.user.role === 'client';
    const isLocalCounsel = req.user.role === 'local_counsel';

    let query = `
      SELECT
        c.id,
        c.case_number,
        c.case_name,
        c.defendant_name,
        c.current_stage,
        c.resolution_status,
        cc.code as category_code
      FROM cases c
      LEFT JOIN case_categories cc ON c.category_id = cc.id
      WHERE (
        c.case_number LIKE ? OR
        c.case_name LIKE ? OR
        c.defendant_name LIKE ?
      )
    `;

    const values = [searchTerm, searchTerm, searchTerm];

    // Add role-based filtering
    if (isClient) {
      query += ` AND c.client_id = ?`;
      values.push(req.user.id);
    } else if (isLocalCounsel) {
      query += ` AND c.local_counsel_id = ?`;
      values.push(req.user.id);
    }

    query += ` ORDER BY c.updated_at DESC LIMIT 10`;

    const results = db.prepare(query).all(...values);

    res.json({ results });
  } catch (error) {
    console.error('Quick search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Helper function to determine what field matched
function determineMatchType(caseData, query) {
  const lowerQuery = query.toLowerCase();
  const matches = [];

  if (caseData.case_number?.toLowerCase().includes(lowerQuery)) {
    matches.push('Case Number');
  }
  if (caseData.case_name?.toLowerCase().includes(lowerQuery)) {
    matches.push('Case Name');
  }
  if (caseData.defendant_name?.toLowerCase().includes(lowerQuery)) {
    matches.push('Defendant');
  }
  if (caseData.client_matter_reference?.toLowerCase().includes(lowerQuery)) {
    matches.push('Client Reference');
  }
  if (caseData.claim_description?.toLowerCase().includes(lowerQuery)) {
    matches.push('Claim Description');
  }
  if (caseData.category_name?.toLowerCase().includes(lowerQuery) ||
      caseData.category_code?.toLowerCase().includes(lowerQuery)) {
    matches.push('Category');
  }

  return matches.join(', ') || 'Match';
}

// Helper function to get content preview with highlighted match
function getContentPreview(content, query) {
  if (!content) return '';

  const maxLength = 150;
  const lowerContent = content.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const matchIndex = lowerContent.indexOf(lowerQuery);

  if (matchIndex === -1) {
    return content.substring(0, maxLength) + (content.length > maxLength ? '...' : '');
  }

  // Calculate start and end positions for the preview
  const start = Math.max(0, matchIndex - 50);
  const end = Math.min(content.length, matchIndex + query.length + 100);

  let preview = '';
  if (start > 0) preview += '...';
  preview += content.substring(start, end);
  if (end < content.length) preview += '...';

  return preview;
}

export default router;
