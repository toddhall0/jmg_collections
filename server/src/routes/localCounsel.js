import { Router } from 'express';
import { db } from '../database.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
];

const PERFORMANCE_RATINGS = ['Excellent', 'Good', 'Satisfactory', 'Below Expectations', 'Not Yet Rated'];
const STATUSES = ['Active', 'Inactive', 'Do Not Use'];

// Get options for dropdowns
router.get('/options', authenticateToken, (req, res) => {
  res.json({
    states: US_STATES,
    performance_ratings: PERFORMANCE_RATINGS,
    statuses: STATUSES
  });
});

// Get all local counsel contacts (admin only)
router.get('/', authenticateToken, requireRole('admin'), (req, res) => {
  const { state, status, search } = req.query;

  let query = `
    SELECT lc.*,
           creator.full_name as created_by_name,
           (SELECT COUNT(*) FROM cases c WHERE c.assigned_local_counsel_id = lc.id) as case_count
    FROM local_counsel_contacts lc
    LEFT JOIN users creator ON lc.created_by = creator.id
  `;

  const conditions = [];
  const values = [];

  // Filter by state (check if state is in states_covered JSON array)
  if (state) {
    conditions.push(`lc.states_covered LIKE ?`);
    values.push(`%${state}%`);
  }

  // Filter by status
  if (status) {
    conditions.push('lc.status = ?');
    values.push(status);
  }

  // Search by firm name or attorney name
  if (search) {
    conditions.push('(lc.firm_name LIKE ? OR lc.attorney_name LIKE ?)');
    const searchPattern = `%${search}%`;
    values.push(searchPattern, searchPattern);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY lc.firm_name ASC';

  const contacts = db.prepare(query).all(...values);

  // Parse states_covered JSON for each contact
  for (const contact of contacts) {
    if (contact.states_covered) {
      try {
        contact.states_covered = JSON.parse(contact.states_covered);
      } catch {
        contact.states_covered = [];
      }
    } else {
      contact.states_covered = [];
    }
  }

  res.json({ contacts });
});

// Get single local counsel contact
router.get('/:id', authenticateToken, requireRole('admin'), (req, res) => {
  const contact = db.prepare(`
    SELECT lc.*,
           creator.full_name as created_by_name
    FROM local_counsel_contacts lc
    LEFT JOIN users creator ON lc.created_by = creator.id
    WHERE lc.id = ?
  `).get(req.params.id);

  if (!contact) {
    return res.status(404).json({ error: 'Local counsel contact not found' });
  }

  // Parse states_covered JSON
  if (contact.states_covered) {
    try {
      contact.states_covered = JSON.parse(contact.states_covered);
    } catch {
      contact.states_covered = [];
    }
  } else {
    contact.states_covered = [];
  }

  // Get cases assigned to this counsel
  const cases = db.prepare(`
    SELECT id, case_number, case_name, defendant_name, current_stage, resolution_status
    FROM cases
    WHERE assigned_local_counsel_id = ?
    ORDER BY date_opened DESC
  `).all(req.params.id);

  res.json({ contact, cases });
});

// Create local counsel contact (admin only)
router.post('/', authenticateToken, requireRole('admin'), (req, res) => {
  const {
    firm_name,
    attorney_name,
    email,
    phone,
    address,
    states_covered,
    hourly_rate,
    retainer_required,
    fee_arrangement_notes,
    performance_rating,
    notes,
    status
  } = req.body;

  // Validation
  if (!firm_name || !attorney_name || !email) {
    return res.status(400).json({ error: 'Firm name, attorney name, and email are required' });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  // Validate states if provided
  if (states_covered && Array.isArray(states_covered)) {
    for (const state of states_covered) {
      if (!US_STATES.includes(state)) {
        return res.status(400).json({ error: `Invalid state: ${state}` });
      }
    }
  }

  // Validate performance_rating if provided
  if (performance_rating && !PERFORMANCE_RATINGS.includes(performance_rating)) {
    return res.status(400).json({ error: 'Invalid performance rating' });
  }

  // Validate status if provided
  if (status && !STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO local_counsel_contacts (
        firm_name, attorney_name, email, phone, address,
        states_covered, hourly_rate, retainer_required,
        fee_arrangement_notes, performance_rating, notes, status, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      firm_name,
      attorney_name,
      email,
      phone || null,
      address || null,
      states_covered ? JSON.stringify(states_covered) : null,
      hourly_rate || null,
      retainer_required || null,
      fee_arrangement_notes || null,
      performance_rating || 'Not Yet Rated',
      notes || null,
      status || 'Active',
      req.user.id
    );

    const contact = db.prepare('SELECT * FROM local_counsel_contacts WHERE id = ?').get(result.lastInsertRowid);

    // Parse states_covered for response
    if (contact.states_covered) {
      contact.states_covered = JSON.parse(contact.states_covered);
    }

    res.status(201).json({ contact, message: 'Local counsel contact created successfully' });
  } catch (error) {
    console.error('Error creating local counsel contact:', error);
    res.status(500).json({ error: 'Failed to create local counsel contact' });
  }
});

// Update local counsel contact (admin only)
router.put('/:id', authenticateToken, requireRole('admin'), (req, res) => {
  const contactId = req.params.id;

  const existing = db.prepare('SELECT * FROM local_counsel_contacts WHERE id = ?').get(contactId);
  if (!existing) {
    return res.status(404).json({ error: 'Local counsel contact not found' });
  }

  const {
    firm_name,
    attorney_name,
    email,
    phone,
    address,
    states_covered,
    hourly_rate,
    retainer_required,
    fee_arrangement_notes,
    performance_rating,
    notes,
    status
  } = req.body;

  const updates = [];
  const values = [];

  if (firm_name !== undefined) {
    if (!firm_name) return res.status(400).json({ error: 'Firm name cannot be empty' });
    updates.push('firm_name = ?');
    values.push(firm_name);
  }

  if (attorney_name !== undefined) {
    if (!attorney_name) return res.status(400).json({ error: 'Attorney name cannot be empty' });
    updates.push('attorney_name = ?');
    values.push(attorney_name);
  }

  if (email !== undefined) {
    if (!email) return res.status(400).json({ error: 'Email cannot be empty' });
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    updates.push('email = ?');
    values.push(email);
  }

  if (phone !== undefined) {
    updates.push('phone = ?');
    values.push(phone || null);
  }

  if (address !== undefined) {
    updates.push('address = ?');
    values.push(address || null);
  }

  if (states_covered !== undefined) {
    if (Array.isArray(states_covered)) {
      for (const state of states_covered) {
        if (!US_STATES.includes(state)) {
          return res.status(400).json({ error: `Invalid state: ${state}` });
        }
      }
    }
    updates.push('states_covered = ?');
    values.push(states_covered ? JSON.stringify(states_covered) : null);
  }

  if (hourly_rate !== undefined) {
    updates.push('hourly_rate = ?');
    values.push(hourly_rate || null);
  }

  if (retainer_required !== undefined) {
    updates.push('retainer_required = ?');
    values.push(retainer_required || null);
  }

  if (fee_arrangement_notes !== undefined) {
    updates.push('fee_arrangement_notes = ?');
    values.push(fee_arrangement_notes || null);
  }

  if (performance_rating !== undefined) {
    if (performance_rating && !PERFORMANCE_RATINGS.includes(performance_rating)) {
      return res.status(400).json({ error: 'Invalid performance rating' });
    }
    updates.push('performance_rating = ?');
    values.push(performance_rating || 'Not Yet Rated');
  }

  if (notes !== undefined) {
    updates.push('notes = ?');
    values.push(notes || null);
  }

  if (status !== undefined) {
    if (status && !STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    updates.push('status = ?');
    values.push(status || 'Active');
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  updates.push("updated_at = datetime('now')");
  values.push(contactId);

  try {
    db.prepare(`UPDATE local_counsel_contacts SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const contact = db.prepare('SELECT * FROM local_counsel_contacts WHERE id = ?').get(contactId);

    // Parse states_covered for response
    if (contact.states_covered) {
      contact.states_covered = JSON.parse(contact.states_covered);
    }

    res.json({ contact, message: 'Local counsel contact updated successfully' });
  } catch (error) {
    console.error('Error updating local counsel contact:', error);
    res.status(500).json({ error: 'Failed to update local counsel contact' });
  }
});

// Delete local counsel contact (admin only)
router.delete('/:id', authenticateToken, requireRole('admin'), (req, res) => {
  const contactId = req.params.id;

  const existing = db.prepare('SELECT * FROM local_counsel_contacts WHERE id = ?').get(contactId);
  if (!existing) {
    return res.status(404).json({ error: 'Local counsel contact not found' });
  }

  // Check if counsel is assigned to any cases
  const assignedCases = db.prepare('SELECT COUNT(*) as count FROM cases WHERE assigned_local_counsel_id = ?').get(contactId);
  if (assignedCases.count > 0) {
    return res.status(400).json({
      error: 'Cannot delete: This counsel is assigned to active cases. Please reassign cases first or mark as "Do Not Use" instead.'
    });
  }

  try {
    db.prepare('DELETE FROM local_counsel_contacts WHERE id = ?').run(contactId);
    res.json({ message: 'Local counsel contact deleted successfully' });
  } catch (error) {
    console.error('Error deleting local counsel contact:', error);
    res.status(500).json({ error: 'Failed to delete local counsel contact' });
  }
});

// Get counsel suitable for a specific state (for case assignment)
router.get('/by-state/:state', authenticateToken, (req, res) => {
  const state = req.params.state;

  if (!US_STATES.includes(state)) {
    return res.status(400).json({ error: 'Invalid state' });
  }

  const contacts = db.prepare(`
    SELECT id, firm_name, attorney_name, email, phone, performance_rating, hourly_rate
    FROM local_counsel_contacts
    WHERE states_covered LIKE ? AND status = 'Active'
    ORDER BY
      CASE performance_rating
        WHEN 'Excellent' THEN 1
        WHEN 'Good' THEN 2
        WHEN 'Satisfactory' THEN 3
        WHEN 'Not Yet Rated' THEN 4
        WHEN 'Below Expectations' THEN 5
      END,
      firm_name ASC
  `).all(`%"${state}"%`);

  res.json({ contacts });
});

export default router;
