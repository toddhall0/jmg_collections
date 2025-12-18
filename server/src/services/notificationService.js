import { db } from '../database.js';

// Notification types
export const NotificationType = {
  TASK_ASSIGNED: 'task_assigned',
  TASK_REMINDER: 'task_reminder',
  TASK_OVERDUE: 'task_overdue',
  STAGE_CHANGE: 'stage_change',
  DOCUMENT_UPLOAD: 'document_upload',
  CASE_ASSIGNED: 'case_assigned',
  DEADLINE_REMINDER: 'deadline_reminder'
};

// Check if user has preference enabled
function checkPreference(userId, preferenceType) {
  const prefs = db.prepare('SELECT * FROM notification_preferences WHERE user_id = ?').get(userId);

  if (!prefs) {
    // Default to true if no preferences set
    return true;
  }

  const prefMap = {
    [NotificationType.TASK_ASSIGNED]: prefs.email_task_assigned,
    [NotificationType.TASK_REMINDER]: prefs.email_task_reminder,
    [NotificationType.TASK_OVERDUE]: prefs.email_task_overdue,
    [NotificationType.STAGE_CHANGE]: prefs.email_stage_change,
    [NotificationType.DOCUMENT_UPLOAD]: prefs.email_document_upload,
    [NotificationType.CASE_ASSIGNED]: prefs.email_case_assigned,
    [NotificationType.DEADLINE_REMINDER]: prefs.email_deadline_reminder
  };

  return prefMap[preferenceType] === 1;
}

// Create notification
export function createNotification({ userId, type, title, message, caseId = null }) {
  try {
    // Check if in-app notifications enabled
    const prefs = db.prepare('SELECT in_app_enabled FROM notification_preferences WHERE user_id = ?').get(userId);
    const inAppEnabled = !prefs || prefs.in_app_enabled === 1;

    if (!inAppEnabled) {
      return null;
    }

    const result = db.prepare(`
      INSERT INTO notifications (user_id, type, title, message, case_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, type, title, message, caseId);

    // Check if email should be sent
    const shouldSendEmail = checkPreference(userId, type);

    if (shouldSendEmail) {
      // In production, this would send an actual email
      // For now, we'll just mark it and log
      const user = db.prepare('SELECT email, full_name FROM users WHERE id = ?').get(userId);
      console.log(`[EMAIL] Would send to ${user.email}: ${title} - ${message}`);

      db.prepare('UPDATE notifications SET email_sent = 1 WHERE id = ?').run(result.lastInsertRowid);
    }

    return result.lastInsertRowid;
  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
}

// Notify task assigned
export function notifyTaskAssigned(taskId, assignedToUserId, assignedByName, caseNumber, taskDescription) {
  createNotification({
    userId: assignedToUserId,
    type: NotificationType.TASK_ASSIGNED,
    title: 'New Task Assigned',
    message: `${assignedByName} assigned you a task on case ${caseNumber}: "${taskDescription}"`,
    caseId: null // We'd need to look up case_id from task
  });
}

// Notify stage change
export function notifyStageChange(caseId, caseNumber, oldStage, newStage, changedByName) {
  try {
    // Get all users who should be notified (admin, internal_counsel, and assigned users)
    const admins = db.prepare(`
      SELECT id FROM users WHERE role IN ('admin', 'internal_counsel') AND active = 1
    `).all();

    const assigned = db.prepare(`
      SELECT user_id as id FROM case_assignments WHERE case_id = ?
    `).all(caseId);

    const caseInfo = db.prepare('SELECT assigned_counsel_id FROM cases WHERE id = ?').get(caseId);

    const userIds = new Set();
    admins.forEach(u => userIds.add(u.id));
    assigned.forEach(u => userIds.add(u.id));
    if (caseInfo?.assigned_counsel_id) userIds.add(caseInfo.assigned_counsel_id);

    for (const userId of userIds) {
      createNotification({
        userId,
        type: NotificationType.STAGE_CHANGE,
        title: 'Case Stage Updated',
        message: `Case ${caseNumber} moved from "${oldStage}" to "${newStage}" by ${changedByName}`,
        caseId
      });
    }
  } catch (error) {
    console.error('Error notifying stage change:', error);
  }
}

// Notify document upload
export function notifyDocumentUpload(caseId, caseNumber, documentName, uploadedByName) {
  try {
    // Get all users who should be notified
    const admins = db.prepare(`
      SELECT id FROM users WHERE role IN ('admin', 'internal_counsel') AND active = 1
    `).all();

    const assigned = db.prepare(`
      SELECT user_id as id FROM case_assignments WHERE case_id = ?
    `).all(caseId);

    const caseInfo = db.prepare('SELECT assigned_counsel_id FROM cases WHERE id = ?').get(caseId);

    const userIds = new Set();
    admins.forEach(u => userIds.add(u.id));
    assigned.forEach(u => userIds.add(u.id));
    if (caseInfo?.assigned_counsel_id) userIds.add(caseInfo.assigned_counsel_id);

    for (const userId of userIds) {
      createNotification({
        userId,
        type: NotificationType.DOCUMENT_UPLOAD,
        title: 'New Document Uploaded',
        message: `${uploadedByName} uploaded "${documentName}" to case ${caseNumber}`,
        caseId
      });
    }
  } catch (error) {
    console.error('Error notifying document upload:', error);
  }
}

// Notify case assigned
export function notifyCaseAssigned(caseId, caseNumber, assignedUserId, assignedByName) {
  createNotification({
    userId: assignedUserId,
    type: NotificationType.CASE_ASSIGNED,
    title: 'Case Assigned to You',
    message: `${assignedByName} assigned you to case ${caseNumber}`,
    caseId
  });
}

// Check for overdue tasks and send reminders (to be called by a scheduler)
export function checkOverdueTasks() {
  const today = new Date().toISOString().split('T')[0];

  // Find overdue incomplete tasks
  const overdueTasks = db.prepare(`
    SELECT t.*, c.case_number, u.full_name as assigned_name
    FROM tasks t
    JOIN cases c ON t.case_id = c.id
    JOIN users u ON t.assigned_to = u.id
    WHERE t.due_date < ? AND t.status != 'Complete'
  `).all(today);

  for (const task of overdueTasks) {
    // Check if we already sent an overdue notification today
    const existing = db.prepare(`
      SELECT id FROM notifications
      WHERE user_id = ? AND type = ? AND message LIKE ? AND date(created_at) = date('now')
    `).get(task.assigned_to, NotificationType.TASK_OVERDUE, `%${task.description}%`);

    if (!existing) {
      createNotification({
        userId: task.assigned_to,
        type: NotificationType.TASK_OVERDUE,
        title: 'Overdue Task',
        message: `Task "${task.description}" on case ${task.case_number} is overdue (was due ${task.due_date})`,
        caseId: task.case_id
      });
    }
  }
}

// Check for upcoming deadlines (to be called by a scheduler)
export function checkUpcomingDeadlines() {
  const today = new Date();
  const threeDaysLater = new Date(today);
  threeDaysLater.setDate(today.getDate() + 3);

  const todayStr = today.toISOString().split('T')[0];
  const threeDaysStr = threeDaysLater.toISOString().split('T')[0];

  // Find tasks due in next 3 days
  const upcomingTasks = db.prepare(`
    SELECT t.*, c.case_number
    FROM tasks t
    JOIN cases c ON t.case_id = c.id
    WHERE t.due_date BETWEEN ? AND ? AND t.status != 'Complete'
  `).all(todayStr, threeDaysStr);

  for (const task of upcomingTasks) {
    const existing = db.prepare(`
      SELECT id FROM notifications
      WHERE user_id = ? AND type = ? AND message LIKE ? AND date(created_at) = date('now')
    `).get(task.assigned_to, NotificationType.TASK_REMINDER, `%${task.description}%`);

    if (!existing) {
      createNotification({
        userId: task.assigned_to,
        type: NotificationType.TASK_REMINDER,
        title: 'Task Reminder',
        message: `Task "${task.description}" on case ${task.case_number} is due on ${task.due_date}`,
        caseId: task.case_id
      });
    }
  }

  // Find notice response deadlines
  const upcomingDeadlines = db.prepare(`
    SELECT c.*, 'initial' as deadline_type, initial_notice_response_deadline as deadline_date
    FROM cases c
    WHERE c.initial_notice_response_deadline BETWEEN ? AND ?
      AND c.resolution_status = 'Open'
    UNION ALL
    SELECT c.*, 'second' as deadline_type, second_notice_response_deadline as deadline_date
    FROM cases c
    WHERE c.second_notice_response_deadline BETWEEN ? AND ?
      AND c.resolution_status = 'Open'
    UNION ALL
    SELECT c.*, 'sol' as deadline_type, statute_of_limitations_date as deadline_date
    FROM cases c
    WHERE c.statute_of_limitations_date BETWEEN ? AND ?
      AND c.resolution_status = 'Open'
  `).all(todayStr, threeDaysStr, todayStr, threeDaysStr, todayStr, threeDaysStr);

  for (const deadline of upcomingDeadlines) {
    // Notify admins and internal counsel
    const admins = db.prepare(`
      SELECT id FROM users WHERE role IN ('admin', 'internal_counsel') AND active = 1
    `).all();

    const deadlineNames = {
      'initial': 'Initial Notice Response',
      'second': 'Second Notice Response',
      'sol': 'Statute of Limitations'
    };

    for (const admin of admins) {
      const existing = db.prepare(`
        SELECT id FROM notifications
        WHERE user_id = ? AND type = ? AND message LIKE ? AND date(created_at) = date('now')
      `).get(admin.id, NotificationType.DEADLINE_REMINDER, `%${deadline.case_number}%${deadlineNames[deadline.deadline_type]}%`);

      if (!existing) {
        createNotification({
          userId: admin.id,
          type: NotificationType.DEADLINE_REMINDER,
          title: 'Deadline Reminder',
          message: `${deadlineNames[deadline.deadline_type]} deadline for case ${deadline.case_number} is on ${deadline.deadline_date}`,
          caseId: deadline.id
        });
      }
    }
  }
}

export default {
  NotificationType,
  createNotification,
  notifyTaskAssigned,
  notifyStageChange,
  notifyDocumentUpload,
  notifyCaseAssigned,
  checkOverdueTasks,
  checkUpcomingDeadlines
};
