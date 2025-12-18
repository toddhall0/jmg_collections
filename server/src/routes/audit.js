import { Router } from 'express';
import { db } from '../database.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

// Get audit logs (admin only)
router.get('/', authenticateToken, requireRole('admin'), (req, res) => {
  const {
    limit = 50,
    offset = 0,
    user_id,
    action,
    entity_type,
    entity_id,
    start_date,
    end_date,
    search
  } = req.query;

  let conditions = [];
  const values = [];

  if (user_id) {
    conditions.push('a.user_id = ?');
    values.push(user_id);
  }

  if (action) {
    conditions.push('a.action = ?');
    values.push(action);
  }

  if (entity_type) {
    conditions.push('a.entity_type = ?');
    values.push(entity_type);
  }

  if (entity_id) {
    conditions.push('a.entity_id = ?');
    values.push(entity_id);
  }

  if (start_date) {
    conditions.push('date(a.created_at) >= ?');
    values.push(start_date);
  }

  if (end_date) {
    conditions.push('date(a.created_at) <= ?');
    values.push(end_date);
  }

  if (search) {
    conditions.push('(a.entity_name LIKE ? OR a.details LIKE ? OR u.full_name LIKE ?)');
    const searchPattern = `%${search}%`;
    values.push(searchPattern, searchPattern, searchPattern);
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  // Get total count
  const countQuery = `
    SELECT COUNT(*) as total
    FROM audit_logs a
    LEFT JOIN users u ON a.user_id = u.id
    ${whereClause}
  `;
  const totalCount = db.prepare(countQuery).get(...values);

  // Get paginated results
  const logsQuery = `
    SELECT
      a.*,
      u.full_name as user_name,
      u.username,
      u.role as user_role
    FROM audit_logs a
    LEFT JOIN users u ON a.user_id = u.id
    ${whereClause}
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `;
  values.push(parseInt(limit), parseInt(offset));
  const logs = db.prepare(logsQuery).all(...values);

  // Parse JSON details
  for (const log of logs) {
    if (log.details) {
      try {
        log.details = JSON.parse(log.details);
      } catch (e) {
        // Keep as string if not valid JSON
      }
    }
  }

  res.json({
    logs,
    total: totalCount.total,
    limit: parseInt(limit),
    offset: parseInt(offset)
  });
});

// Get audit log statistics
router.get('/stats', authenticateToken, requireRole('admin'), (req, res) => {
  const { days = 30 } = req.query;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - parseInt(days));
  const startDateStr = startDate.toISOString().split('T')[0];

  // Actions by type
  const actionsByType = db.prepare(`
    SELECT action, COUNT(*) as count
    FROM audit_logs
    WHERE date(created_at) >= ?
    GROUP BY action
    ORDER BY count DESC
  `).all(startDateStr);

  // Actions by user
  const actionsByUser = db.prepare(`
    SELECT u.full_name, u.id as user_id, COUNT(*) as count
    FROM audit_logs a
    JOIN users u ON a.user_id = u.id
    WHERE date(a.created_at) >= ?
    GROUP BY a.user_id
    ORDER BY count DESC
    LIMIT 10
  `).all(startDateStr);

  // Actions by day
  const actionsByDay = db.prepare(`
    SELECT date(created_at) as date, COUNT(*) as count
    FROM audit_logs
    WHERE date(created_at) >= ?
    GROUP BY date(created_at)
    ORDER BY date ASC
  `).all(startDateStr);

  // Entity types
  const entityTypes = db.prepare(`
    SELECT entity_type, COUNT(*) as count
    FROM audit_logs
    WHERE date(created_at) >= ?
    GROUP BY entity_type
    ORDER BY count DESC
  `).all(startDateStr);

  // Total actions
  const totalActions = db.prepare(`
    SELECT COUNT(*) as total
    FROM audit_logs
    WHERE date(created_at) >= ?
  `).get(startDateStr);

  res.json({
    actions_by_type: actionsByType,
    actions_by_user: actionsByUser,
    actions_by_day: actionsByDay,
    entity_types: entityTypes,
    total_actions: totalActions.total,
    period_days: parseInt(days)
  });
});

// Get unique action types
router.get('/action-types', authenticateToken, requireRole('admin'), (req, res) => {
  const actions = db.prepare(`
    SELECT DISTINCT action FROM audit_logs ORDER BY action
  `).all();

  res.json({ actions: actions.map(a => a.action) });
});

// Get unique entity types
router.get('/entity-types', authenticateToken, requireRole('admin'), (req, res) => {
  const entities = db.prepare(`
    SELECT DISTINCT entity_type FROM audit_logs ORDER BY entity_type
  `).all();

  res.json({ entity_types: entities.map(e => e.entity_type) });
});

// Export audit logs as CSV
router.get('/export', authenticateToken, requireRole('admin'), (req, res) => {
  const { start_date, end_date, action, entity_type } = req.query;

  let conditions = [];
  const values = [];

  if (start_date) {
    conditions.push('date(a.created_at) >= ?');
    values.push(start_date);
  }

  if (end_date) {
    conditions.push('date(a.created_at) <= ?');
    values.push(end_date);
  }

  if (action) {
    conditions.push('a.action = ?');
    values.push(action);
  }

  if (entity_type) {
    conditions.push('a.entity_type = ?');
    values.push(entity_type);
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const logs = db.prepare(`
    SELECT
      a.id,
      a.created_at as timestamp,
      u.full_name as user,
      u.role as user_role,
      a.action,
      a.entity_type,
      a.entity_id,
      a.entity_name,
      a.details,
      a.ip_address
    FROM audit_logs a
    LEFT JOIN users u ON a.user_id = u.id
    ${whereClause}
    ORDER BY a.created_at DESC
  `).all(...values);

  // Generate CSV
  const headers = ['ID', 'Timestamp', 'User', 'Role', 'Action', 'Entity Type', 'Entity ID', 'Entity Name', 'Details', 'IP Address'];
  const csvRows = [headers.join(',')];

  for (const log of logs) {
    const row = [
      log.id,
      `"${log.timestamp}"`,
      `"${log.user || 'System'}"`,
      `"${log.user_role || ''}"`,
      `"${log.action}"`,
      `"${log.entity_type}"`,
      log.entity_id || '',
      `"${(log.entity_name || '').replace(/"/g, '""')}"`,
      `"${(log.details || '').replace(/"/g, '""')}"`,
      `"${log.ip_address || ''}"`
    ];
    csvRows.push(row.join(','));
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=audit-log-${new Date().toISOString().split('T')[0]}.csv`);
  res.send(csvRows.join('\n'));
});

export default router;
