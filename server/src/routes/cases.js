import { Router } from 'express';
import { db, generateCaseNumber } from '../database.js';
import { authenticateToken, requireRole, canAccessCase, canEditCase } from '../middleware/auth.js';

const router = Router();

const VALID_STAGES = [
  'Intake',
  'Initial Notice Sent',
  'Initial Notice - Awaiting Response',
  'Second Notice Sent',
  'Second Notice - Awaiting Response',
  'Identifying Local Counsel',
  'Local Counsel Engaged',
  'Active Litigation',
  'Settlement Negotiation',
  'Closed - Resolved'
];

const VALID_ENTITY_TYPES = ['Individual', 'LLC', 'Corporation', 'Partnership', 'Trust', 'Other'];
const VALID_RESOLUTION_STATUSES = ['Open', 'Settled', 'Judgment Obtained', 'Dismissed', 'Abandoned'];

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
];

// Get all cases (with role-based filtering)
router.get('/', authenticateToken, (req, res) => {
  const { stage, resolution_status, sort_by, sort_order, search } = req.query;

  let query = `
    SELECT c.*,
           GROUP_CONCAT(u.full_name) as assigned_counsel
    FROM cases c
    LEFT JOIN case_assignments ca ON c.id = ca.case_id
    LEFT JOIN users u ON ca.user_id = u.id
  `;

  const conditions = [];
  const values = [];

  // Role-based filtering
  if (req.user.role === 'local_counsel') {
    query = `
      SELECT c.*,
             GROUP_CONCAT(u.full_name) as assigned_counsel
      FROM cases c
      INNER JOIN case_assignments ca ON c.id = ca.case_id
      LEFT JOIN users u ON ca.user_id = u.id
      INNER JOIN case_assignments my_assignment ON c.id = my_assignment.case_id AND my_assignment.user_id = ?
    `;
    values.push(req.user.id);
  }

  // Filter by stage
  if (stage) {
    conditions.push('c.current_stage = ?');
    values.push(stage);
  }

  // Filter by resolution status
  if (resolution_status) {
    conditions.push('c.resolution_status = ?');
    values.push(resolution_status);
  }

  // Search
  if (search) {
    conditions.push('(c.case_number LIKE ? OR c.case_name LIKE ? OR c.defendant_name LIKE ?)');
    const searchPattern = `%${search}%`;
    values.push(searchPattern, searchPattern, searchPattern);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' GROUP BY c.id';

  // Sorting
  const validSortFields = ['case_number', 'defendant_name', 'amount_claimed', 'current_stage', 'date_opened'];
  const sortField = validSortFields.includes(sort_by) ? sort_by : 'date_opened';
  const sortDirection = sort_order === 'asc' ? 'ASC' : 'DESC';
  query += ` ORDER BY c.${sortField} ${sortDirection}`;

  const cases = db.prepare(query).all(...values);

  res.json({ cases });
});

// Get case statistics
router.get('/stats', authenticateToken, (req, res) => {
  let baseCondition = '';
  const values = [];

  if (req.user.role === 'local_counsel') {
    baseCondition = 'WHERE c.id IN (SELECT case_id FROM case_assignments WHERE user_id = ?)';
    values.push(req.user.id);
  }

  const totalCases = db.prepare(`SELECT COUNT(*) as count FROM cases c ${baseCondition}`).get(...values);
  const openCases = db.prepare(`SELECT COUNT(*) as count FROM cases c ${baseCondition} ${baseCondition ? 'AND' : 'WHERE'} resolution_status = 'Open'`).get(...values);
  const totalClaimed = db.prepare(`SELECT COALESCE(SUM(amount_claimed), 0) as total FROM cases c ${baseCondition}`).get(...values);
  const totalRecovered = db.prepare(`SELECT COALESCE(SUM(amount_recovered), 0) as total FROM cases c ${baseCondition}`).get(...values);

  const byStage = db.prepare(`
    SELECT current_stage, COUNT(*) as count
    FROM cases c ${baseCondition}
    GROUP BY current_stage
  `).all(...values);

  res.json({
    total_cases: totalCases.count,
    open_cases: openCases.count,
    total_claimed: totalClaimed.total,
    total_recovered: totalRecovered.total,
    by_stage: byStage
  });
});

// Get dropdown options
router.get('/options', authenticateToken, (req, res) => {
  res.json({
    stages: VALID_STAGES,
    entity_types: VALID_ENTITY_TYPES,
    resolution_statuses: VALID_RESOLUTION_STATUSES,
    states: US_STATES
  });
});

// Get single case
router.get('/:id', authenticateToken, canAccessCase, (req, res) => {
  const caseData = db.prepare(`
    SELECT c.*,
           creator.full_name as created_by_name
    FROM cases c
    LEFT JOIN users creator ON c.created_by = creator.id
    WHERE c.id = ?
  `).get(req.params.id);

  if (!caseData) {
    return res.status(404).json({ error: 'Case not found' });
  }

  // Get assigned counsel
  const assignments = db.prepare(`
    SELECT u.id, u.full_name, u.email, ca.assigned_at
    FROM case_assignments ca
    JOIN users u ON ca.user_id = u.id
    WHERE ca.case_id = ?
  `).all(req.params.id);

  res.json({ case: caseData, assignments });
});

// Create case (admin only)
router.post('/', authenticateToken, requireRole('admin'), (req, res) => {
  const {
    case_name,
    client_matter_reference,
    date_opened,
    defendant_name,
    defendant_entity_type,
    defendant_contact_name,
    defendant_email,
    defendant_phone,
    defendant_mailing_address,
    defendant_state,
    amount_claimed,
    date_claim_arose,
    statute_of_limitations_date,
    claim_description,
    current_stage,
    resolution_status
  } = req.body;

  // Validation
  if (!case_name || !defendant_name || !defendant_entity_type || !amount_claimed) {
    return res.status(400).json({ error: 'Case name, defendant name, defendant entity type, and amount claimed are required' });
  }

  if (!VALID_ENTITY_TYPES.includes(defendant_entity_type)) {
    return res.status(400).json({ error: 'Invalid defendant entity type' });
  }

  if (current_stage && !VALID_STAGES.includes(current_stage)) {
    return res.status(400).json({ error: 'Invalid stage' });
  }

  if (resolution_status && !VALID_RESOLUTION_STATUSES.includes(resolution_status)) {
    return res.status(400).json({ error: 'Invalid resolution status' });
  }

  if (defendant_state && !US_STATES.includes(defendant_state)) {
    return res.status(400).json({ error: 'Invalid state' });
  }

  const case_number = generateCaseNumber();

  try {
    const result = db.prepare(`
      INSERT INTO cases (
        case_number, case_name, client_matter_reference, date_opened,
        defendant_name, defendant_entity_type, defendant_contact_name,
        defendant_email, defendant_phone, defendant_mailing_address,
        defendant_state, amount_claimed, date_claim_arose,
        statute_of_limitations_date, claim_description, current_stage,
        resolution_status, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      case_number,
      case_name,
      client_matter_reference || null,
      date_opened || new Date().toISOString().split('T')[0],
      defendant_name,
      defendant_entity_type,
      defendant_contact_name || null,
      defendant_email || null,
      defendant_phone || null,
      defendant_mailing_address || null,
      defendant_state || null,
      amount_claimed,
      date_claim_arose || null,
      statute_of_limitations_date || null,
      claim_description || null,
      current_stage || 'Intake',
      resolution_status || 'Open',
      req.user.id
    );

    const newCase = db.prepare('SELECT * FROM cases WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ case: newCase, message: 'Case created successfully' });
  } catch (error) {
    console.error('Error creating case:', error);
    res.status(500).json({ error: 'Failed to create case' });
  }
});

// Update case
router.put('/:id', authenticateToken, canEditCase, (req, res) => {
  const caseId = req.params.id;

  const existingCase = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
  if (!existingCase) {
    return res.status(404).json({ error: 'Case not found' });
  }

  // Fields that local counsel can update
  const localCounselFields = ['current_stage', 'resolution_status', 'amount_recovered', 'date_closed'];

  // All updateable fields for admin
  const allFields = [
    'case_name', 'client_matter_reference', 'date_opened',
    'defendant_name', 'defendant_entity_type', 'defendant_contact_name',
    'defendant_email', 'defendant_phone', 'defendant_mailing_address',
    'defendant_state', 'amount_claimed', 'date_claim_arose',
    'statute_of_limitations_date', 'claim_description', 'current_stage',
    'resolution_status', 'amount_recovered', 'date_closed'
  ];

  const allowedFields = req.localCounselEdit ? localCounselFields : allFields;

  const updates = [];
  const values = [];

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      // Validation
      if (field === 'current_stage' && !VALID_STAGES.includes(req.body[field])) {
        return res.status(400).json({ error: 'Invalid stage' });
      }
      if (field === 'resolution_status' && !VALID_RESOLUTION_STATUSES.includes(req.body[field])) {
        return res.status(400).json({ error: 'Invalid resolution status' });
      }
      if (field === 'defendant_entity_type' && !VALID_ENTITY_TYPES.includes(req.body[field])) {
        return res.status(400).json({ error: 'Invalid defendant entity type' });
      }
      if (field === 'defendant_state' && req.body[field] && !US_STATES.includes(req.body[field])) {
        return res.status(400).json({ error: 'Invalid state' });
      }

      updates.push(`${field} = ?`);
      values.push(req.body[field] === '' ? null : req.body[field]);
    }
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  updates.push('updated_at = datetime("now")');
  values.push(caseId);

  db.prepare(`UPDATE cases SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const updatedCase = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
  res.json({ case: updatedCase, message: 'Case updated successfully' });
});

// Delete case (admin only)
router.delete('/:id', authenticateToken, requireRole('admin'), (req, res) => {
  const caseId = req.params.id;

  const existingCase = db.prepare('SELECT id FROM cases WHERE id = ?').get(caseId);
  if (!existingCase) {
    return res.status(404).json({ error: 'Case not found' });
  }

  db.prepare('DELETE FROM cases WHERE id = ?').run(caseId);
  res.json({ message: 'Case deleted successfully' });
});

// Assign local counsel to case
router.post('/:id/assign', authenticateToken, requireRole('admin'), (req, res) => {
  const caseId = req.params.id;
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  // Verify case exists
  const caseExists = db.prepare('SELECT id FROM cases WHERE id = ?').get(caseId);
  if (!caseExists) {
    return res.status(404).json({ error: 'Case not found' });
  }

  // Verify user exists and is local counsel
  const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(user_id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (user.role !== 'local_counsel') {
    return res.status(400).json({ error: 'User is not local counsel' });
  }

  // Check if already assigned
  const existing = db.prepare('SELECT id FROM case_assignments WHERE case_id = ? AND user_id = ?')
    .get(caseId, user_id);
  if (existing) {
    return res.status(400).json({ error: 'User is already assigned to this case' });
  }

  db.prepare(`
    INSERT INTO case_assignments (case_id, user_id, assigned_by)
    VALUES (?, ?, ?)
  `).run(caseId, user_id, req.user.id);

  res.json({ message: 'Local counsel assigned successfully' });
});

// Remove local counsel from case
router.delete('/:id/assign/:userId', authenticateToken, requireRole('admin'), (req, res) => {
  const { id: caseId, userId } = req.params;

  const assignment = db.prepare('SELECT id FROM case_assignments WHERE case_id = ? AND user_id = ?')
    .get(caseId, userId);

  if (!assignment) {
    return res.status(404).json({ error: 'Assignment not found' });
  }

  db.prepare('DELETE FROM case_assignments WHERE case_id = ? AND user_id = ?')
    .run(caseId, userId);

  res.json({ message: 'Assignment removed successfully' });
});

export default router;
