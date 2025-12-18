import { Router } from 'express';
import { db } from '../database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Get admin dashboard summary statistics
router.get('/admin-summary', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'internal_counsel') {
    return res.status(403).json({ error: 'Access denied' });
  }

  const today = new Date().toISOString().split('T')[0];
  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];

  // Total active cases
  const activeCases = db.prepare(`
    SELECT COUNT(*) as count FROM cases WHERE resolution_status = 'Open'
  `).get();

  // Total amount outstanding (open cases)
  const amountOutstanding = db.prepare(`
    SELECT COALESCE(SUM(amount_claimed), 0) as total FROM cases WHERE resolution_status = 'Open'
  `).get();

  // Total recovered this year (closed cases)
  const recoveredThisYear = db.prepare(`
    SELECT COALESCE(SUM(amount_recovered), 0) as total
    FROM cases
    WHERE resolution_status != 'Open' AND date_closed >= ?
  `).get(yearStart);

  // Recovery rate for closed cases
  const recoveryStats = db.prepare(`
    SELECT
      COALESCE(SUM(amount_claimed), 0) as claimed,
      COALESCE(SUM(amount_recovered), 0) as recovered
    FROM cases
    WHERE resolution_status != 'Open'
  `).get();
  const recoveryRate = recoveryStats.claimed > 0
    ? (recoveryStats.recovered / recoveryStats.claimed * 100).toFixed(1)
    : 0;

  // Cases needing attention (overdue tasks or past deadlines)
  const casesNeedingAttention = db.prepare(`
    SELECT COUNT(DISTINCT c.id) as count
    FROM cases c
    LEFT JOIN tasks t ON c.id = t.case_id AND t.due_date < ? AND t.status != 'Complete'
    WHERE c.resolution_status = 'Open'
    AND (
      t.id IS NOT NULL
      OR (c.initial_notice_response_deadline < ? AND c.current_stage LIKE '%Initial Notice%')
      OR (c.second_notice_response_deadline < ? AND c.current_stage LIKE '%Second Notice%')
    )
  `).get(today, today, today);

  res.json({
    active_cases: activeCases.count,
    amount_outstanding: amountOutstanding.total,
    recovered_this_year: recoveredThisYear.total,
    recovery_rate: parseFloat(recoveryRate),
    cases_needing_attention: casesNeedingAttention.count
  });
});

// Get pipeline summary (cases and amounts by stage)
router.get('/pipeline-summary', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'internal_counsel') {
    return res.status(403).json({ error: 'Access denied' });
  }

  const stages = [
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

  const pipeline = db.prepare(`
    SELECT
      current_stage,
      COUNT(*) as case_count,
      COALESCE(SUM(amount_claimed), 0) as total_amount
    FROM cases
    WHERE resolution_status = 'Open'
    GROUP BY current_stage
  `).all();

  // Create a map with all stages
  const pipelineMap = {};
  for (const stage of stages) {
    pipelineMap[stage] = { case_count: 0, total_amount: 0 };
  }

  // Fill in actual data
  for (const row of pipeline) {
    if (pipelineMap[row.current_stage]) {
      pipelineMap[row.current_stage] = {
        case_count: row.case_count,
        total_amount: row.total_amount
      };
    }
  }

  res.json({ pipeline: pipelineMap, stages });
});

// Get recent activity feed
router.get('/activity-feed', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'internal_counsel') {
    return res.status(403).json({ error: 'Access denied' });
  }

  const limit = parseInt(req.query.limit) || 20;

  // Get recent notes
  const notes = db.prepare(`
    SELECT
      'note' as activity_type,
      n.created_at as timestamp,
      c.case_number,
      c.id as case_id,
      'Note added' as action,
      SUBSTR(n.content, 1, 100) as summary,
      u.full_name as user_name
    FROM case_notes n
    JOIN cases c ON n.case_id = c.id
    JOIN users u ON n.created_by = u.id
    ORDER BY n.created_at DESC
    LIMIT ?
  `).all(limit);

  // Get recent communications
  const communications = db.prepare(`
    SELECT
      'communication' as activity_type,
      com.created_at as timestamp,
      c.case_number,
      c.id as case_id,
      com.type || ' with ' || COALESCE(com.contact_person, 'Unknown') as action,
      SUBSTR(com.summary, 1, 100) as summary,
      u.full_name as user_name
    FROM communications com
    JOIN cases c ON com.case_id = c.id
    JOIN users u ON com.created_by = u.id
    ORDER BY com.created_at DESC
    LIMIT ?
  `).all(limit);

  // Get recent document uploads
  const documents = db.prepare(`
    SELECT
      'document' as activity_type,
      d.uploaded_at as timestamp,
      c.case_number,
      c.id as case_id,
      'Document uploaded: ' || d.category as action,
      d.original_name as summary,
      u.full_name as user_name
    FROM documents d
    JOIN cases c ON d.case_id = c.id
    JOIN users u ON d.uploaded_by = u.id
    ORDER BY d.uploaded_at DESC
    LIMIT ?
  `).all(limit);

  // Get recent task completions
  const tasks = db.prepare(`
    SELECT
      'task' as activity_type,
      t.updated_at as timestamp,
      c.case_number,
      c.id as case_id,
      'Task ' || LOWER(t.status) || ': ' || SUBSTR(t.description, 1, 50) as action,
      t.description as summary,
      u.full_name as user_name
    FROM tasks t
    JOIN cases c ON t.case_id = c.id
    JOIN users u ON t.assigned_to = u.id
    WHERE t.status = 'Complete'
    ORDER BY t.updated_at DESC
    LIMIT ?
  `).all(limit);

  // Combine and sort by timestamp
  const allActivities = [...notes, ...communications, ...documents, ...tasks];
  allActivities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  res.json({ activities: allActivities.slice(0, limit) });
});

// Get upcoming deadlines
router.get('/upcoming-deadlines', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'internal_counsel') {
    return res.status(403).json({ error: 'Access denied' });
  }

  const today = new Date().toISOString().split('T')[0];
  const limit = parseInt(req.query.limit) || 15;

  const deadlines = [];

  // Task deadlines (upcoming and overdue)
  const taskDeadlines = db.prepare(`
    SELECT
      c.id as case_id,
      c.case_number,
      c.defendant_name,
      t.due_date as deadline_date,
      'Task: ' || SUBSTR(t.description, 1, 50) as deadline_type,
      t.priority,
      'task' as source
    FROM tasks t
    JOIN cases c ON t.case_id = c.id
    WHERE t.status != 'Complete' AND c.resolution_status = 'Open'
    ORDER BY t.due_date ASC
    LIMIT ?
  `).all(limit * 2);
  deadlines.push(...taskDeadlines);

  // Initial notice response deadlines (all open cases with this deadline set)
  const initialDeadlines = db.prepare(`
    SELECT
      id as case_id,
      case_number,
      defendant_name,
      initial_notice_response_deadline as deadline_date,
      'Initial Notice Response Due' as deadline_type,
      'High' as priority,
      'response_deadline' as source
    FROM cases
    WHERE initial_notice_response_deadline IS NOT NULL
      AND initial_notice_response_deadline != ''
      AND resolution_status = 'Open'
    ORDER BY initial_notice_response_deadline ASC
    LIMIT ?
  `).all(limit);
  deadlines.push(...initialDeadlines);

  // Second notice response deadlines (all open cases with this deadline set)
  const secondDeadlines = db.prepare(`
    SELECT
      id as case_id,
      case_number,
      defendant_name,
      second_notice_response_deadline as deadline_date,
      'Second Notice Response Due' as deadline_type,
      'High' as priority,
      'response_deadline' as source
    FROM cases
    WHERE second_notice_response_deadline IS NOT NULL
      AND second_notice_response_deadline != ''
      AND resolution_status = 'Open'
    ORDER BY second_notice_response_deadline ASC
    LIMIT ?
  `).all(limit);
  deadlines.push(...secondDeadlines);

  // Statute of limitations (critical - always show)
  const solDeadlines = db.prepare(`
    SELECT
      id as case_id,
      case_number,
      defendant_name,
      statute_of_limitations_date as deadline_date,
      'Statute of Limitations' as deadline_type,
      'High' as priority,
      'sol' as source
    FROM cases
    WHERE statute_of_limitations_date IS NOT NULL
      AND statute_of_limitations_date != ''
      AND resolution_status = 'Open'
    ORDER BY statute_of_limitations_date ASC
    LIMIT ?
  `).all(limit);
  deadlines.push(...solDeadlines);

  // Sort all by date
  deadlines.sort((a, b) => a.deadline_date.localeCompare(b.deadline_date));

  // Calculate days until due and mark overdue
  const todayDate = new Date(today);
  for (const deadline of deadlines) {
    const deadlineDate = new Date(deadline.deadline_date);
    const diffDays = Math.ceil((deadlineDate - todayDate) / (1000 * 60 * 60 * 24));
    deadline.days_until = diffDays;
    deadline.is_overdue = diffDays < 0;
  }

  res.json({ deadlines: deadlines.slice(0, limit) });
});

// Get client dashboard data
router.get('/client-summary', authenticateToken, (req, res) => {
  // Client users see all cases, local_counsel see only their assigned cases
  let baseCondition = '';
  const values = [];

  if (req.user.role === 'local_counsel') {
    baseCondition = 'WHERE c.local_counsel_user_id = ? OR c.id IN (SELECT case_id FROM case_assignments WHERE user_id = ?)';
    values.push(req.user.id, req.user.id);
  }

  // Summary statistics
  const activeCases = db.prepare(`
    SELECT COUNT(*) as count FROM cases c ${baseCondition} ${baseCondition ? 'AND' : 'WHERE'} resolution_status = 'Open'
  `).get(...values);

  const totalOutstanding = db.prepare(`
    SELECT COALESCE(SUM(amount_claimed), 0) as total FROM cases c ${baseCondition} ${baseCondition ? 'AND' : 'WHERE'} resolution_status = 'Open'
  `).get(...values);

  const totalRecovered = db.prepare(`
    SELECT COALESCE(SUM(amount_recovered), 0) as total FROM cases c ${baseCondition} ${baseCondition ? 'AND' : 'WHERE'} resolution_status != 'Open'
  `).get(...values);

  const recoveryStats = db.prepare(`
    SELECT
      COALESCE(SUM(amount_claimed), 0) as claimed,
      COALESCE(SUM(amount_recovered), 0) as recovered
    FROM cases c ${baseCondition} ${baseCondition ? 'AND' : 'WHERE'} resolution_status != 'Open'
  `).get(...values);

  const recoveryRate = recoveryStats.claimed > 0
    ? (recoveryStats.recovered / recoveryStats.claimed * 100).toFixed(1)
    : 0;

  // Case list
  const cases = db.prepare(`
    SELECT
      c.id,
      c.case_number,
      c.case_name,
      c.defendant_name,
      c.amount_claimed,
      c.amount_recovered,
      c.current_stage,
      c.resolution_status,
      c.date_opened
    FROM cases c
    ${baseCondition}
    ORDER BY c.date_opened DESC
  `).all(...values);

  res.json({
    summary: {
      active_cases: activeCases.count,
      total_outstanding: totalOutstanding.total,
      total_recovered: totalRecovered.total,
      recovery_rate: parseFloat(recoveryRate)
    },
    cases
  });
});

export default router;
