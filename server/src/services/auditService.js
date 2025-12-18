import { db } from '../database.js';

// Action types
export const AuditAction = {
  // User actions
  LOGIN: 'login',
  LOGOUT: 'logout',
  USER_CREATED: 'user_created',
  USER_UPDATED: 'user_updated',
  USER_DELETED: 'user_deleted',

  // Case actions
  CASE_CREATED: 'case_created',
  CASE_UPDATED: 'case_updated',
  CASE_DELETED: 'case_deleted',
  CASE_STAGE_CHANGED: 'case_stage_changed',
  CASE_STATUS_CHANGED: 'case_status_changed',

  // Document actions
  DOCUMENT_UPLOADED: 'document_uploaded',
  DOCUMENT_DELETED: 'document_deleted',
  DOCUMENT_GENERATED: 'document_generated',

  // Task actions
  TASK_CREATED: 'task_created',
  TASK_UPDATED: 'task_updated',
  TASK_COMPLETED: 'task_completed',
  TASK_DELETED: 'task_deleted',

  // Communication actions
  COMMUNICATION_LOGGED: 'communication_logged',

  // Note actions
  NOTE_ADDED: 'note_added',

  // Assignment actions
  COUNSEL_ASSIGNED: 'counsel_assigned',
  COUNSEL_REMOVED: 'counsel_removed',
  LOCAL_COUNSEL_ASSIGNED: 'local_counsel_assigned',

  // Template actions
  TEMPLATE_CREATED: 'template_created',
  TEMPLATE_UPDATED: 'template_updated',
  TEMPLATE_DELETED: 'template_deleted',

  // Share link actions
  SHARE_LINK_CREATED: 'share_link_created',
  SHARE_LINK_ACCESSED: 'share_link_accessed',

  // Invite actions
  INVITE_SENT: 'invite_sent',
  INVITE_ACCEPTED: 'invite_accepted'
};

// Entity types
export const EntityType = {
  USER: 'user',
  CASE: 'case',
  DOCUMENT: 'document',
  TASK: 'task',
  COMMUNICATION: 'communication',
  NOTE: 'note',
  TEMPLATE: 'template',
  SHARE_LINK: 'share_link',
  INVITE: 'invite',
  LOCAL_COUNSEL: 'local_counsel'
};

/**
 * Create an audit log entry
 */
export function logAudit({
  userId,
  action,
  entityType,
  entityId = null,
  entityName = null,
  details = null,
  ipAddress = null
}) {
  try {
    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, entity_name, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      action,
      entityType,
      entityId,
      entityName,
      details ? JSON.stringify(details) : null,
      ipAddress
    );
  } catch (error) {
    console.error('Error creating audit log:', error);
  }
}

/**
 * Get client IP from request
 */
export function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         'unknown';
}

/**
 * Helper function to log case actions
 */
export function logCaseAction(userId, action, caseId, caseNumber, details = null, ipAddress = null) {
  logAudit({
    userId,
    action,
    entityType: EntityType.CASE,
    entityId: caseId,
    entityName: caseNumber,
    details,
    ipAddress
  });
}

/**
 * Helper function to log user actions
 */
export function logUserAction(userId, action, targetUserId, targetUserName, details = null, ipAddress = null) {
  logAudit({
    userId,
    action,
    entityType: EntityType.USER,
    entityId: targetUserId,
    entityName: targetUserName,
    details,
    ipAddress
  });
}

/**
 * Helper function to log document actions
 */
export function logDocumentAction(userId, action, docId, docName, caseNumber = null, ipAddress = null) {
  logAudit({
    userId,
    action,
    entityType: EntityType.DOCUMENT,
    entityId: docId,
    entityName: docName,
    details: caseNumber ? { case_number: caseNumber } : null,
    ipAddress
  });
}

export default {
  AuditAction,
  EntityType,
  logAudit,
  getClientIp,
  logCaseAction,
  logUserAction,
  logDocumentAction
};
