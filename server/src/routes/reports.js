import { Router } from 'express';
import { db } from '../database.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

// Case Aging Report - All open cases with days since opened
router.get('/case-aging', authenticateToken, requireRole('admin', 'internal_counsel'), (req, res) => {
  const { start_date, end_date } = req.query;

  let conditions = "WHERE c.resolution_status = 'Open'";
  const values = [];

  if (start_date) {
    conditions += ' AND c.date_opened >= ?';
    values.push(start_date);
  }
  if (end_date) {
    conditions += ' AND c.date_opened <= ?';
    values.push(end_date);
  }

  const cases = db.prepare(`
    SELECT
      c.case_number,
      c.case_name,
      c.defendant_name,
      c.defendant_state,
      c.date_opened,
      julianday('now') - julianday(c.date_opened) as days_open,
      c.current_stage,
      c.amount_claimed,
      c.amount_recovered,
      ac.full_name as assigned_counsel
    FROM cases c
    LEFT JOIN users ac ON c.assigned_counsel_id = ac.id
    ${conditions}
    ORDER BY days_open DESC
  `).all(...values);

  res.json({ report: cases });
});

// Recovery Report - All closed cases with recovery metrics
router.get('/recovery', authenticateToken, requireRole('admin', 'internal_counsel'), (req, res) => {
  const { start_date, end_date } = req.query;

  let conditions = "WHERE c.resolution_status != 'Open'";
  const values = [];

  if (start_date) {
    conditions += ' AND c.date_closed >= ?';
    values.push(start_date);
  }
  if (end_date) {
    conditions += ' AND c.date_closed <= ?';
    values.push(end_date);
  }

  const cases = db.prepare(`
    SELECT
      c.case_number,
      c.case_name,
      c.defendant_name,
      c.defendant_state,
      c.resolution_status,
      c.date_opened,
      c.date_closed,
      julianday(c.date_closed) - julianday(c.date_opened) as days_to_resolution,
      c.amount_claimed,
      c.amount_recovered,
      CASE WHEN c.amount_claimed > 0 THEN
        ROUND(c.amount_recovered * 100.0 / c.amount_claimed, 1)
      ELSE 0 END as recovery_percentage,
      ac.full_name as assigned_counsel
    FROM cases c
    LEFT JOIN users ac ON c.assigned_counsel_id = ac.id
    ${conditions}
    ORDER BY c.date_closed DESC
  `).all(...values);

  // Summary stats
  const summary = db.prepare(`
    SELECT
      COUNT(*) as total_cases,
      COALESCE(SUM(amount_claimed), 0) as total_claimed,
      COALESCE(SUM(amount_recovered), 0) as total_recovered,
      COALESCE(AVG(julianday(date_closed) - julianday(date_opened)), 0) as avg_days_to_resolution
    FROM cases c
    ${conditions}
  `).get(...values);

  summary.recovery_rate = summary.total_claimed > 0
    ? (summary.total_recovered / summary.total_claimed * 100).toFixed(1)
    : 0;

  res.json({ report: cases, summary });
});

// Cases by Stage Report
router.get('/by-stage', authenticateToken, requireRole('admin', 'internal_counsel'), (req, res) => {
  const { start_date, end_date } = req.query;

  let conditions = "WHERE 1=1";
  const values = [];

  if (start_date) {
    conditions += ' AND c.date_opened >= ?';
    values.push(start_date);
  }
  if (end_date) {
    conditions += ' AND c.date_opened <= ?';
    values.push(end_date);
  }

  const stages = db.prepare(`
    SELECT
      c.current_stage as stage,
      COUNT(*) as case_count,
      COALESCE(SUM(c.amount_claimed), 0) as total_claimed,
      COALESCE(SUM(c.amount_recovered), 0) as total_recovered,
      COALESCE(AVG(c.amount_claimed), 0) as avg_amount_claimed
    FROM cases c
    ${conditions}
    GROUP BY c.current_stage
    ORDER BY
      CASE c.current_stage
        WHEN 'Intake' THEN 1
        WHEN 'Initial Notice Sent' THEN 2
        WHEN 'Initial Notice - Awaiting Response' THEN 3
        WHEN 'Second Notice Sent' THEN 4
        WHEN 'Second Notice - Awaiting Response' THEN 5
        WHEN 'Identifying Local Counsel' THEN 6
        WHEN 'Local Counsel Engaged' THEN 7
        WHEN 'Active Litigation' THEN 8
        WHEN 'Settlement Negotiation' THEN 9
        WHEN 'Closed - Resolved' THEN 10
        ELSE 99
      END
  `).all(...values);

  // Overall summary
  const summary = db.prepare(`
    SELECT
      COUNT(*) as total_cases,
      COALESCE(SUM(amount_claimed), 0) as total_claimed,
      COALESCE(SUM(amount_recovered), 0) as total_recovered
    FROM cases c
    ${conditions}
  `).get(...values);

  res.json({ report: stages, summary });
});

// Cases by Jurisdiction Report
router.get('/by-jurisdiction', authenticateToken, requireRole('admin', 'internal_counsel'), (req, res) => {
  const { start_date, end_date } = req.query;

  let conditions = "WHERE c.defendant_state IS NOT NULL";
  const values = [];

  if (start_date) {
    conditions += ' AND c.date_opened >= ?';
    values.push(start_date);
  }
  if (end_date) {
    conditions += ' AND c.date_opened <= ?';
    values.push(end_date);
  }

  const jurisdictions = db.prepare(`
    SELECT
      c.defendant_state as state,
      COUNT(*) as case_count,
      SUM(CASE WHEN c.resolution_status = 'Open' THEN 1 ELSE 0 END) as open_cases,
      SUM(CASE WHEN c.resolution_status != 'Open' THEN 1 ELSE 0 END) as closed_cases,
      COALESCE(SUM(c.amount_claimed), 0) as total_claimed,
      COALESCE(SUM(c.amount_recovered), 0) as total_recovered,
      CASE WHEN SUM(c.amount_claimed) > 0 THEN
        ROUND(SUM(c.amount_recovered) * 100.0 / SUM(c.amount_claimed), 1)
      ELSE 0 END as recovery_percentage
    FROM cases c
    ${conditions}
    GROUP BY c.defendant_state
    ORDER BY case_count DESC
  `).all(...values);

  res.json({ report: jurisdictions });
});

export default router;
