import { Router } from 'express';
import { db } from '../database.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { checkOverdueTasks, checkUpcomingDeadlines } from '../services/notificationService.js';

const router = Router();

// Get current user's notifications
router.get('/', authenticateToken, (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const unreadOnly = req.query.unread === 'true';

  let query = `
    SELECT n.*, c.case_number
    FROM notifications n
    LEFT JOIN cases c ON n.case_id = c.id
    WHERE n.user_id = ?
  `;

  if (unreadOnly) {
    query += ' AND n.is_read = 0';
  }

  query += ' ORDER BY n.created_at DESC LIMIT ?';

  const notifications = db.prepare(query).all(req.user.id, limit);

  // Get unread count
  const unreadCount = db.prepare(
    'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0'
  ).get(req.user.id);

  res.json({
    notifications,
    unread_count: unreadCount.count
  });
});

// Mark notification as read
router.put('/:id/read', authenticateToken, (req, res) => {
  const notification = db.prepare(
    'SELECT * FROM notifications WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id);

  if (!notification) {
    return res.status(404).json({ error: 'Notification not found' });
  }

  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(req.params.id);

  res.json({ message: 'Notification marked as read' });
});

// Mark all notifications as read
router.put('/read-all', authenticateToken, (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);

  res.json({ message: 'All notifications marked as read' });
});

// Delete notification
router.delete('/:id', authenticateToken, (req, res) => {
  const notification = db.prepare(
    'SELECT * FROM notifications WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id);

  if (!notification) {
    return res.status(404).json({ error: 'Notification not found' });
  }

  db.prepare('DELETE FROM notifications WHERE id = ?').run(req.params.id);

  res.json({ message: 'Notification deleted' });
});

// Get notification preferences
router.get('/preferences', authenticateToken, (req, res) => {
  let prefs = db.prepare(
    'SELECT * FROM notification_preferences WHERE user_id = ?'
  ).get(req.user.id);

  if (!prefs) {
    // Create default preferences
    db.prepare(`
      INSERT INTO notification_preferences (user_id)
      VALUES (?)
    `).run(req.user.id);

    prefs = db.prepare(
      'SELECT * FROM notification_preferences WHERE user_id = ?'
    ).get(req.user.id);
  }

  res.json({ preferences: prefs });
});

// Update notification preferences
router.put('/preferences', authenticateToken, (req, res) => {
  const {
    email_task_assigned,
    email_task_reminder,
    email_task_overdue,
    email_stage_change,
    email_document_upload,
    email_case_assigned,
    email_deadline_reminder,
    in_app_enabled
  } = req.body;

  // Check if preferences exist
  const existing = db.prepare(
    'SELECT id FROM notification_preferences WHERE user_id = ?'
  ).get(req.user.id);

  if (existing) {
    db.prepare(`
      UPDATE notification_preferences SET
        email_task_assigned = COALESCE(?, email_task_assigned),
        email_task_reminder = COALESCE(?, email_task_reminder),
        email_task_overdue = COALESCE(?, email_task_overdue),
        email_stage_change = COALESCE(?, email_stage_change),
        email_document_upload = COALESCE(?, email_document_upload),
        email_case_assigned = COALESCE(?, email_case_assigned),
        email_deadline_reminder = COALESCE(?, email_deadline_reminder),
        in_app_enabled = COALESCE(?, in_app_enabled),
        updated_at = datetime('now')
      WHERE user_id = ?
    `).run(
      email_task_assigned !== undefined ? (email_task_assigned ? 1 : 0) : null,
      email_task_reminder !== undefined ? (email_task_reminder ? 1 : 0) : null,
      email_task_overdue !== undefined ? (email_task_overdue ? 1 : 0) : null,
      email_stage_change !== undefined ? (email_stage_change ? 1 : 0) : null,
      email_document_upload !== undefined ? (email_document_upload ? 1 : 0) : null,
      email_case_assigned !== undefined ? (email_case_assigned ? 1 : 0) : null,
      email_deadline_reminder !== undefined ? (email_deadline_reminder ? 1 : 0) : null,
      in_app_enabled !== undefined ? (in_app_enabled ? 1 : 0) : null,
      req.user.id
    );
  } else {
    db.prepare(`
      INSERT INTO notification_preferences (
        user_id, email_task_assigned, email_task_reminder, email_task_overdue,
        email_stage_change, email_document_upload, email_case_assigned,
        email_deadline_reminder, in_app_enabled
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      email_task_assigned !== undefined ? (email_task_assigned ? 1 : 0) : 1,
      email_task_reminder !== undefined ? (email_task_reminder ? 1 : 0) : 1,
      email_task_overdue !== undefined ? (email_task_overdue ? 1 : 0) : 1,
      email_stage_change !== undefined ? (email_stage_change ? 1 : 0) : 1,
      email_document_upload !== undefined ? (email_document_upload ? 1 : 0) : 0,
      email_case_assigned !== undefined ? (email_case_assigned ? 1 : 0) : 1,
      email_deadline_reminder !== undefined ? (email_deadline_reminder ? 1 : 0) : 1,
      in_app_enabled !== undefined ? (in_app_enabled ? 1 : 0) : 1
    );
  }

  res.json({ message: 'Preferences updated' });
});

// Trigger check for overdue tasks and deadlines (admin and internal counsel, for testing or manual trigger)
router.post('/check-reminders', authenticateToken, requireRole('admin', 'internal_counsel'), (req, res) => {
  try {
    checkOverdueTasks();
    checkUpcomingDeadlines();
    res.json({ message: 'Reminder checks completed' });
  } catch (error) {
    console.error('Error checking reminders:', error);
    res.status(500).json({ error: 'Failed to check reminders' });
  }
});

export default router;
