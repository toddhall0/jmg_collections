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
  const { stage, resolution_status, category_id, sort_by, sort_order, search } = req.query;

  let query = `
    SELECT c.*,
           cc.name as category_name,
           cc.code as category_code,
           GROUP_CONCAT(u.full_name) as assigned_counsel
    FROM cases c
    LEFT JOIN case_categories cc ON c.category_id = cc.id
    LEFT JOIN case_assignments ca ON c.id = ca.case_id
    LEFT JOIN users u ON ca.user_id = u.id
  `;

  const conditions = [];
  const values = [];

  // Role-based filtering
  if (req.user.role === 'local_counsel') {
    // Local counsel can see cases where they are assigned via:
    // 1. case_assignments table (legacy)
    // 2. local_counsel_user_id field (new)
    query = `
      SELECT c.*,
             GROUP_CONCAT(DISTINCT u.full_name) as assigned_counsel
      FROM cases c
      LEFT JOIN case_assignments ca ON c.id = ca.case_id
      LEFT JOIN users u ON ca.user_id = u.id
      WHERE (
        c.local_counsel_user_id = ?
        OR c.id IN (SELECT case_id FROM case_assignments WHERE user_id = ?)
      )
    `;
    values.push(req.user.id, req.user.id);
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

  // Filter by category
  if (category_id) {
    conditions.push('c.category_id = ?');
    values.push(category_id);
  }

  // Search
  if (search) {
    conditions.push('(c.case_number LIKE ? OR c.case_name LIKE ? OR c.defendant_name LIKE ?)');
    const searchPattern = `%${search}%`;
    values.push(searchPattern, searchPattern, searchPattern);
  }

  if (conditions.length > 0) {
    // For local_counsel, query already has WHERE clause, use AND
    if (req.user.role === 'local_counsel') {
      query += ' AND ' + conditions.join(' AND ');
    } else {
      query += ' WHERE ' + conditions.join(' AND ');
    }
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

// Get pipeline data (cases grouped by stage with overdue task info)
// IMPORTANT: This route must be before /:id to avoid path matching conflicts
router.get('/pipeline', authenticateToken, (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  let caseQuery = `
    SELECT c.*,
           cc.name as category_name,
           cc.code as category_code,
           GROUP_CONCAT(DISTINCT u.full_name) as assigned_counsel,
           (SELECT COUNT(*) FROM tasks t WHERE t.case_id = c.id AND t.due_date < ? AND t.status != 'Complete') as overdue_tasks
    FROM cases c
    LEFT JOIN case_categories cc ON c.category_id = cc.id
    LEFT JOIN case_assignments ca ON c.id = ca.case_id
    LEFT JOIN users u ON ca.user_id = u.id
  `;

  const values = [today];

  // Role-based filtering for local counsel
  if (req.user.role === 'local_counsel') {
    caseQuery += ` WHERE c.id IN (SELECT case_id FROM case_assignments WHERE user_id = ?)`;
    values.push(req.user.id);
  }

  caseQuery += ` GROUP BY c.id ORDER BY c.date_opened DESC`;

  const cases = db.prepare(caseQuery).all(...values);

  // Group cases by stage
  const pipeline = {};
  for (const stage of VALID_STAGES) {
    pipeline[stage] = {
      cases: [],
      count: 0,
      total_amount: 0
    };
  }

  for (const caseItem of cases) {
    if (pipeline[caseItem.current_stage]) {
      pipeline[caseItem.current_stage].cases.push(caseItem);
      pipeline[caseItem.current_stage].count++;
      pipeline[caseItem.current_stage].total_amount += caseItem.amount_claimed || 0;
    }
  }

  res.json({ pipeline, stages: VALID_STAGES });
});

// Get upcoming deadlines
router.get('/deadlines', authenticateToken, (req, res) => {
  const today = new Date();
  const thirtyDaysFromNow = new Date(today);
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const todayStr = today.toISOString().split('T')[0];
  const futureStr = thirtyDaysFromNow.toISOString().split('T')[0];

  let baseCondition = '';
  const values = [];

  if (req.user.role === 'local_counsel') {
    baseCondition = 'AND c.id IN (SELECT case_id FROM case_assignments WHERE user_id = ?)';
    values.push(req.user.id);
  }

  // Get all deadline types
  const deadlines = [];

  // Initial Notice Response Deadlines
  const initialNoticeDeadlines = db.prepare(`
    SELECT c.id, c.case_number, c.defendant_name, c.initial_notice_response_deadline as deadline_date,
           'Initial Notice Response' as deadline_type
    FROM cases c
    WHERE c.initial_notice_response_deadline IS NOT NULL
      AND c.initial_notice_response_deadline <= ?
      AND c.resolution_status = 'Open'
      ${baseCondition}
  `).all(futureStr, ...values);

  // Second Notice Response Deadlines
  const secondNoticeDeadlines = db.prepare(`
    SELECT c.id, c.case_number, c.defendant_name, c.second_notice_response_deadline as deadline_date,
           'Second Notice Response' as deadline_type
    FROM cases c
    WHERE c.second_notice_response_deadline IS NOT NULL
      AND c.second_notice_response_deadline <= ?
      AND c.resolution_status = 'Open'
      ${baseCondition}
  `).all(futureStr, ...values);

  // Statute of Limitations Deadlines
  const solDeadlines = db.prepare(`
    SELECT c.id, c.case_number, c.defendant_name, c.statute_of_limitations_date as deadline_date,
           'Statute of Limitations' as deadline_type
    FROM cases c
    WHERE c.statute_of_limitations_date IS NOT NULL
      AND c.statute_of_limitations_date <= ?
      AND c.resolution_status = 'Open'
      ${baseCondition}
  `).all(futureStr, ...values);

  // Task Due Dates
  const taskDeadlines = db.prepare(`
    SELECT c.id, c.case_number, c.defendant_name, t.due_date as deadline_date,
           'Task: ' || t.description as deadline_type
    FROM tasks t
    JOIN cases c ON t.case_id = c.id
    WHERE t.due_date <= ?
      AND t.status != 'Complete'
      AND c.resolution_status = 'Open'
      ${baseCondition}
  `).all(futureStr, ...values);

  deadlines.push(...initialNoticeDeadlines, ...secondNoticeDeadlines, ...solDeadlines, ...taskDeadlines);

  // Sort by deadline date
  deadlines.sort((a, b) => a.deadline_date.localeCompare(b.deadline_date));

  // Add days until due
  for (const deadline of deadlines) {
    const deadlineDate = new Date(deadline.deadline_date);
    const diffTime = deadlineDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    deadline.days_until_due = diffDays;
    deadline.is_overdue = diffDays < 0;
    deadline.is_due_soon = diffDays >= 0 && diffDays <= 7;
  }

  res.json({ deadlines });
});

// Get single case
router.get('/:id', authenticateToken, canAccessCase, (req, res) => {
  const caseData = db.prepare(`
    SELECT c.*,
           creator.full_name as created_by_name,
           cc.name as category_name,
           cc.code as category_code,
           cc.description as category_description,
           lc.id as local_counsel_id,
           lc.firm_name as local_counsel_firm,
           lc.attorney_name as local_counsel_attorney,
           lc.email as local_counsel_email,
           lc.phone as local_counsel_phone,
           lc.performance_rating as local_counsel_rating,
           lcu.full_name as local_counsel_user_name,
           lcu.email as local_counsel_user_email,
           ac.id as assigned_counsel_id,
           ac.full_name as assigned_counsel_name,
           ac.email as assigned_counsel_email
    FROM cases c
    LEFT JOIN users creator ON c.created_by = creator.id
    LEFT JOIN case_categories cc ON c.category_id = cc.id
    LEFT JOIN local_counsel_contacts lc ON c.assigned_local_counsel_id = lc.id
    LEFT JOIN users lcu ON c.local_counsel_user_id = lcu.id
    LEFT JOIN users ac ON c.assigned_counsel_id = ac.id
    WHERE c.id = ?
  `).get(req.params.id);

  if (!caseData) {
    return res.status(404).json({ error: 'Case not found' });
  }

  // Get assigned counsel (legacy user assignments)
  const assignments = db.prepare(`
    SELECT u.id, u.full_name, u.email, ca.assigned_at
    FROM case_assignments ca
    JOIN users u ON ca.user_id = u.id
    WHERE ca.case_id = ?
  `).all(req.params.id);

  res.json({ case: caseData, assignments });
});

// Create case (admin and internal counsel)
router.post('/', authenticateToken, requireRole('admin', 'internal_counsel'), (req, res) => {
  const {
    case_name,
    client_matter_reference,
    category_id,
    date_opened,
    defendant_name,
    defendant_entity_type,
    defendant_contact_name,
    defendant_email,
    defendant_phone,
    defendant_mailing_address,
    defendant_state,
    defendant_attorney_name,
    defendant_attorney_firm,
    defendant_attorney_address,
    defendant_attorney_email,
    defendant_attorney_phone,
    amount_claimed,
    date_claim_arose,
    statute_of_limitations_date,
    claim_description,
    current_stage,
    resolution_status,
    initial_notice_sent_date,
    initial_notice_response_deadline,
    second_notice_sent_date,
    second_notice_response_deadline
  } = req.body;

  // Validation - allow zero for amount_claimed
  if (!case_name || !defendant_name || !defendant_entity_type || amount_claimed === undefined || amount_claimed === null || amount_claimed === '') {
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

  // Auto-calculate response deadlines if sent dates provided but deadlines not specified
  let calculatedInitialDeadline = initial_notice_response_deadline;
  if (initial_notice_sent_date && !initial_notice_response_deadline) {
    const sentDate = new Date(initial_notice_sent_date);
    sentDate.setDate(sentDate.getDate() + 14);
    calculatedInitialDeadline = sentDate.toISOString().split('T')[0];
  }

  let calculatedSecondDeadline = second_notice_response_deadline;
  if (second_notice_sent_date && !second_notice_response_deadline) {
    const sentDate = new Date(second_notice_sent_date);
    sentDate.setDate(sentDate.getDate() + 10);
    calculatedSecondDeadline = sentDate.toISOString().split('T')[0];
  }

  try {
    const result = db.prepare(`
      INSERT INTO cases (
        case_number, case_name, client_matter_reference, category_id, date_opened,
        defendant_name, defendant_entity_type, defendant_contact_name,
        defendant_email, defendant_phone, defendant_mailing_address,
        defendant_state, defendant_attorney_name, defendant_attorney_firm,
        defendant_attorney_address, defendant_attorney_email, defendant_attorney_phone,
        amount_claimed, date_claim_arose,
        statute_of_limitations_date, claim_description, current_stage,
        resolution_status, created_by,
        initial_notice_sent_date, initial_notice_response_deadline,
        second_notice_sent_date, second_notice_response_deadline,
        stage_changed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      case_number,
      case_name,
      client_matter_reference || null,
      category_id || null,
      date_opened || new Date().toISOString().split('T')[0],
      defendant_name,
      defendant_entity_type,
      defendant_contact_name || null,
      defendant_email || null,
      defendant_phone || null,
      defendant_mailing_address || null,
      defendant_state || null,
      defendant_attorney_name || null,
      defendant_attorney_firm || null,
      defendant_attorney_address || null,
      defendant_attorney_email || null,
      defendant_attorney_phone || null,
      amount_claimed,
      date_claim_arose || null,
      statute_of_limitations_date || null,
      claim_description || null,
      current_stage || 'Intake',
      resolution_status || 'Open',
      req.user.id,
      initial_notice_sent_date || null,
      calculatedInitialDeadline || null,
      second_notice_sent_date || null,
      calculatedSecondDeadline || null
    );

    const newCase = db.prepare('SELECT * FROM cases WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ case: newCase, message: 'Case created successfully' });
  } catch (error) {
    console.error('Error creating case:', error);
    res.status(500).json({ error: 'Failed to create case' });
  }
});

// Client matter request - allows clients to submit new cases
router.post('/client-request', authenticateToken, (req, res) => {
  // Only allow client users to use this endpoint
  if (req.user.role !== 'client') {
    return res.status(403).json({ error: 'This endpoint is only for client users' });
  }

  const {
    case_name,
    category_id,
    defendant_name,
    defendant_entity_type,
    defendant_contact_name,
    defendant_email,
    defendant_phone,
    defendant_mailing_address,
    defendant_state,
    amount_claimed,
    date_claim_arose,
    claim_description
  } = req.body;

  // Validation - allow zero for amount_claimed
  if (!case_name || !defendant_name || !defendant_entity_type || amount_claimed === undefined || amount_claimed === null || amount_claimed === '') {
    return res.status(400).json({ error: 'Matter name, defendant name, defendant entity type, and amount claimed are required' });
  }

  if (!VALID_ENTITY_TYPES.includes(defendant_entity_type)) {
    return res.status(400).json({ error: 'Invalid defendant entity type' });
  }

  if (defendant_state && !US_STATES.includes(defendant_state.toUpperCase())) {
    return res.status(400).json({ error: 'Invalid state' });
  }

  const case_number = generateCaseNumber();

  try {
    const result = db.prepare(`
      INSERT INTO cases (
        case_number, case_name, category_id, defendant_name, defendant_entity_type,
        defendant_contact_name, defendant_email, defendant_phone, defendant_mailing_address,
        defendant_state, amount_claimed, date_claim_arose, claim_description,
        current_stage, resolution_status, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      case_number,
      case_name,
      category_id || null,
      defendant_name,
      defendant_entity_type,
      defendant_contact_name || null,
      defendant_email || null,
      defendant_phone || null,
      defendant_mailing_address || null,
      defendant_state ? defendant_state.toUpperCase() : null,
      amount_claimed,
      date_claim_arose || null,
      claim_description || null,
      'Intake', // Always starts at Intake
      'Open',   // Always Open
      req.user.id
    );

    logAudit(req, 'CREATE', 'case', result.lastInsertRowid, case_name, {
      case_number,
      submitted_by_client: true
    });

    const newCase = db.prepare('SELECT * FROM cases WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ case: newCase, message: 'Matter request submitted successfully' });
  } catch (error) {
    console.error('Error creating client case request:', error);
    res.status(500).json({ error: 'Failed to submit matter request' });
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
    'case_name', 'client_matter_reference', 'category_id', 'date_opened',
    'defendant_name', 'defendant_entity_type', 'defendant_contact_name',
    'defendant_email', 'defendant_phone', 'defendant_mailing_address',
    'defendant_state', 'defendant_attorney_name', 'defendant_attorney_firm',
    'defendant_attorney_address', 'defendant_attorney_email', 'defendant_attorney_phone',
    'amount_claimed', 'date_claim_arose',
    'statute_of_limitations_date', 'claim_description', 'current_stage',
    'resolution_status', 'amount_recovered', 'date_closed',
    'initial_notice_sent_date', 'initial_notice_response_deadline',
    'second_notice_sent_date', 'second_notice_response_deadline'
  ];

  const allowedFields = req.localCounselEdit ? localCounselFields : allFields;

  const updates = [];
  const values = [];

  // Track if stage is changing for logging
  let stageChanging = false;
  let oldStage = existingCase.current_stage;
  let newStage = null;

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      // Validation
      if (field === 'current_stage') {
        if (!VALID_STAGES.includes(req.body[field])) {
          return res.status(400).json({ error: 'Invalid stage' });
        }
        if (req.body[field] !== existingCase.current_stage) {
          stageChanging = true;
          newStage = req.body[field];
        }
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

  // Auto-calculate response deadlines if sent dates provided
  if (req.body.initial_notice_sent_date && !req.body.initial_notice_response_deadline) {
    const sentDate = new Date(req.body.initial_notice_sent_date);
    sentDate.setDate(sentDate.getDate() + 14);
    updates.push('initial_notice_response_deadline = ?');
    values.push(sentDate.toISOString().split('T')[0]);
  }

  if (req.body.second_notice_sent_date && !req.body.second_notice_response_deadline) {
    const sentDate = new Date(req.body.second_notice_sent_date);
    sentDate.setDate(sentDate.getDate() + 10);
    updates.push('second_notice_response_deadline = ?');
    values.push(sentDate.toISOString().split('T')[0]);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  // If stage is changing, update stage_changed_at
  if (stageChanging) {
    updates.push("stage_changed_at = datetime('now')");
  }

  updates.push("updated_at = datetime('now')");
  values.push(caseId);

  db.prepare(`UPDATE cases SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  // Create a note for stage change
  if (stageChanging) {
    const noteContent = `Stage changed from "${oldStage}" to "${newStage}"`;
    db.prepare(`
      INSERT INTO case_notes (case_id, content, created_by)
      VALUES (?, ?, ?)
    `).run(caseId, noteContent, req.user.id);
  }

  const updatedCase = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
  res.json({ case: updatedCase, message: 'Case updated successfully' });
});

// Delete case (admin and internal counsel)
router.delete('/:id', authenticateToken, requireRole('admin', 'internal_counsel'), (req, res) => {
  const caseId = req.params.id;

  const existingCase = db.prepare('SELECT id FROM cases WHERE id = ?').get(caseId);
  if (!existingCase) {
    return res.status(404).json({ error: 'Case not found' });
  }

  db.prepare('DELETE FROM cases WHERE id = ?').run(caseId);
  res.json({ message: 'Case deleted successfully' });
});

// Assign local counsel to case
router.post('/:id/assign', authenticateToken, requireRole('admin', 'internal_counsel'), (req, res) => {
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
router.delete('/:id/assign/:userId', authenticateToken, requireRole('admin', 'internal_counsel'), (req, res) => {
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

// Assign local counsel from directory to a case (admin and internal counsel)
router.post('/:id/local-counsel', authenticateToken, requireRole('admin', 'internal_counsel'), (req, res) => {
  const caseId = req.params.id;
  const {
    local_counsel_id,
    engagement_date,
    fee_arrangement,
    user_id // optional - links to a user account for system access
  } = req.body;

  // Verify case exists
  const caseData = db.prepare('SELECT id FROM cases WHERE id = ?').get(caseId);
  if (!caseData) {
    return res.status(404).json({ error: 'Case not found' });
  }

  // Verify local counsel contact exists if provided
  if (local_counsel_id) {
    const counsel = db.prepare('SELECT id, status FROM local_counsel_contacts WHERE id = ?').get(local_counsel_id);
    if (!counsel) {
      return res.status(404).json({ error: 'Local counsel contact not found' });
    }
    if (counsel.status === 'Do Not Use') {
      return res.status(400).json({ error: 'This counsel is marked as "Do Not Use"' });
    }
  }

  // Verify user exists if provided
  if (user_id) {
    const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(user_id);
    if (!user) {
      return res.status(404).json({ error: 'User account not found' });
    }
    if (user.role !== 'local_counsel') {
      return res.status(400).json({ error: 'User must have the local_counsel role' });
    }
  }

  try {
    db.prepare(`
      UPDATE cases SET
        assigned_local_counsel_id = ?,
        local_counsel_engagement_date = ?,
        local_counsel_fee_arrangement = ?,
        local_counsel_user_id = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      local_counsel_id || null,
      engagement_date || null,
      fee_arrangement || null,
      user_id || null,
      caseId
    );

    // Create a note about the assignment
    if (local_counsel_id) {
      const counsel = db.prepare('SELECT firm_name, attorney_name FROM local_counsel_contacts WHERE id = ?').get(local_counsel_id);
      const noteContent = `Local counsel assigned: ${counsel.attorney_name} (${counsel.firm_name})`;
      db.prepare(`
        INSERT INTO case_notes (case_id, content, created_by)
        VALUES (?, ?, ?)
      `).run(caseId, noteContent, req.user.id);
    }

    res.json({ message: 'Local counsel assigned successfully' });
  } catch (error) {
    console.error('Error assigning local counsel:', error);
    res.status(500).json({ error: 'Failed to assign local counsel' });
  }
});

// Remove local counsel from a case (admin and internal counsel)
router.delete('/:id/local-counsel', authenticateToken, requireRole('admin', 'internal_counsel'), (req, res) => {
  const caseId = req.params.id;

  const caseData = db.prepare('SELECT id, assigned_local_counsel_id FROM cases WHERE id = ?').get(caseId);
  if (!caseData) {
    return res.status(404).json({ error: 'Case not found' });
  }

  if (!caseData.assigned_local_counsel_id) {
    return res.status(400).json({ error: 'No local counsel is assigned to this case' });
  }

  try {
    db.prepare(`
      UPDATE cases SET
        assigned_local_counsel_id = NULL,
        local_counsel_engagement_date = NULL,
        local_counsel_fee_arrangement = NULL,
        local_counsel_user_id = NULL,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(caseId);

    // Create a note about the removal
    db.prepare(`
      INSERT INTO case_notes (case_id, content, created_by)
      VALUES (?, 'Local counsel removed from case', ?)
    `).run(caseId, req.user.id);

    res.json({ message: 'Local counsel removed successfully' });
  } catch (error) {
    console.error('Error removing local counsel:', error);
    res.status(500).json({ error: 'Failed to remove local counsel' });
  }
});

// Assign internal counsel (assigned attorney) to a case
router.post('/:id/assigned-counsel', authenticateToken, requireRole('admin', 'internal_counsel'), (req, res) => {
  const caseId = req.params.id;
  const { user_id } = req.body;

  // Verify case exists
  const caseData = db.prepare('SELECT id FROM cases WHERE id = ?').get(caseId);
  if (!caseData) {
    return res.status(404).json({ error: 'Case not found' });
  }

  // Verify user exists and is admin or internal_counsel
  if (user_id) {
    const user = db.prepare('SELECT id, role, full_name FROM users WHERE id = ?').get(user_id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (user.role !== 'admin' && user.role !== 'internal_counsel') {
      return res.status(400).json({ error: 'User must be an admin or internal counsel' });
    }
  }

  try {
    db.prepare(`
      UPDATE cases SET
        assigned_counsel_id = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(user_id || null, caseId);

    // Create a note about the assignment
    if (user_id) {
      const user = db.prepare('SELECT full_name FROM users WHERE id = ?').get(user_id);
      const noteContent = `Assigned counsel set to: ${user.full_name}`;
      db.prepare(`
        INSERT INTO case_notes (case_id, content, created_by)
        VALUES (?, ?, ?)
      `).run(caseId, noteContent, req.user.id);
    }

    res.json({ message: 'Assigned counsel updated successfully' });
  } catch (error) {
    console.error('Error assigning counsel:', error);
    res.status(500).json({ error: 'Failed to assign counsel' });
  }
});

// Remove assigned counsel from a case
router.delete('/:id/assigned-counsel', authenticateToken, requireRole('admin', 'internal_counsel'), (req, res) => {
  const caseId = req.params.id;

  const caseData = db.prepare('SELECT id, assigned_counsel_id FROM cases WHERE id = ?').get(caseId);
  if (!caseData) {
    return res.status(404).json({ error: 'Case not found' });
  }

  if (!caseData.assigned_counsel_id) {
    return res.status(400).json({ error: 'No assigned counsel on this case' });
  }

  try {
    db.prepare(`
      UPDATE cases SET
        assigned_counsel_id = NULL,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(caseId);

    db.prepare(`
      INSERT INTO case_notes (case_id, content, created_by)
      VALUES (?, 'Assigned counsel removed from case', ?)
    `).run(caseId, req.user.id);

    res.json({ message: 'Assigned counsel removed successfully' });
  } catch (error) {
    console.error('Error removing assigned counsel:', error);
    res.status(500).json({ error: 'Failed to remove assigned counsel' });
  }
});

export default router;
