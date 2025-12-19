import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { db } from '../database.js';
import { authenticateToken, canAccessCase } from '../middleware/auth.js';
import { notifyTaskAssigned } from '../services/notificationService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

const VALID_PRIORITIES = ['High', 'Medium', 'Low'];
const VALID_STATUSES = ['Not Started', 'In Progress', 'Stuck', 'Complete'];

// Configure multer for task document uploads
const taskUploadDir = path.join(__dirname, '..', '..', 'uploads', 'tasks');
if (!fs.existsSync(taskUploadDir)) {
  fs.mkdirSync(taskUploadDir, { recursive: true });
}

const taskStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, taskUploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const taskUpload = multer({
  storage: taskStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx|txt|csv/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname || mimetype) {
      return cb(null, true);
    }
    cb(new Error('Invalid file type'));
  }
});

// Get all tasks for a case
router.get('/case/:caseId', authenticateToken, canAccessCase, (req, res) => {
  const { caseId } = req.params;

  const tasks = db.prepare(`
    SELECT t.*,
           assignee.full_name as assigned_to_name,
           creator.full_name as created_by_name
    FROM tasks t
    JOIN users assignee ON t.assigned_to = assignee.id
    JOIN users creator ON t.created_by = creator.id
    WHERE t.case_id = ?
    ORDER BY t.due_date ASC, t.priority DESC
  `).all(caseId);

  res.json({ tasks });
});

// Get overdue task counts for cases (for pipeline view)
router.get('/overdue-counts', authenticateToken, (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  const counts = db.prepare(`
    SELECT case_id, COUNT(*) as overdue_count
    FROM tasks
    WHERE due_date < ? AND status != 'Complete'
    GROUP BY case_id
  `).all(today);

  const countMap = {};
  for (const row of counts) {
    countMap[row.case_id] = row.overdue_count;
  }

  res.json({ overdue_counts: countMap });
});

// Get task options (priorities, statuses)
router.get('/options', authenticateToken, (req, res) => {
  res.json({
    priorities: VALID_PRIORITIES,
    statuses: VALID_STATUSES
  });
});

// Get all tasks assigned to current user (for My Tasks dashboard)
router.get('/my-tasks', authenticateToken, (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  const tasks = db.prepare(`
    SELECT t.*,
           c.case_number,
           c.case_name,
           assignee.full_name as assigned_to_name,
           creator.full_name as created_by_name,
           CASE
             WHEN t.due_date < ? AND t.status != 'Complete' THEN 1
             ELSE 0
           END as is_overdue
    FROM tasks t
    JOIN cases c ON t.case_id = c.id
    JOIN users assignee ON t.assigned_to = assignee.id
    JOIN users creator ON t.created_by = creator.id
    WHERE t.assigned_to = ? AND t.status != 'Complete'
    ORDER BY t.due_date ASC, t.priority DESC
  `).all(today, req.user.id);

  res.json({ tasks });
});

// Get all tasks (for Task Management page - admin/internal_counsel only)
router.get('/all', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'internal_counsel') {
    return res.status(403).json({ error: 'Access denied' });
  }

  const today = new Date().toISOString().split('T')[0];

  const tasks = db.prepare(`
    SELECT t.*,
           c.case_number,
           c.case_name,
           c.defendant_name,
           cc.name as category_name,
           cc.code as category_code,
           assignee.full_name as assigned_to_name,
           creator.full_name as created_by_name,
           (SELECT COUNT(*) FROM task_documents td WHERE td.task_id = t.id) as document_count,
           CASE
             WHEN t.due_date < ? AND t.status != 'Complete' THEN 1
             ELSE 0
           END as is_overdue
    FROM tasks t
    JOIN cases c ON t.case_id = c.id
    LEFT JOIN case_categories cc ON c.category_id = cc.id
    JOIN users assignee ON t.assigned_to = assignee.id
    JOIN users creator ON t.created_by = creator.id
    ORDER BY t.due_date ASC, t.priority DESC
  `).all(today);

  res.json({ tasks });
});

// Create a new task
router.post('/case/:caseId', authenticateToken, canAccessCase, (req, res) => {
  const { caseId } = req.params;
  const { description, assigned_to, due_date, priority, status, notes } = req.body;

  // Client users cannot create tasks
  if (req.user.role === 'client') {
    return res.status(403).json({ error: 'Clients cannot create tasks' });
  }

  if (!description || !description.trim()) {
    return res.status(400).json({ error: 'Task description is required' });
  }

  if (!assigned_to) {
    return res.status(400).json({ error: 'Assigned user is required' });
  }

  if (!due_date) {
    return res.status(400).json({ error: 'Due date is required' });
  }

  if (priority && !VALID_PRIORITIES.includes(priority)) {
    return res.status(400).json({ error: 'Invalid priority' });
  }

  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  // Verify case exists
  const caseExists = db.prepare('SELECT id FROM cases WHERE id = ?').get(caseId);
  if (!caseExists) {
    return res.status(404).json({ error: 'Case not found' });
  }

  // Verify assigned user exists
  const assignee = db.prepare('SELECT id FROM users WHERE id = ?').get(assigned_to);
  if (!assignee) {
    return res.status(404).json({ error: 'Assigned user not found' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO tasks (case_id, description, assigned_to, due_date, priority, status, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      caseId,
      description.trim(),
      assigned_to,
      due_date,
      priority || 'Medium',
      status || 'Not Started',
      notes || null,
      req.user.id
    );

    const task = db.prepare(`
      SELECT t.*,
             assignee.full_name as assigned_to_name,
             creator.full_name as created_by_name
      FROM tasks t
      JOIN users assignee ON t.assigned_to = assignee.id
      JOIN users creator ON t.created_by = creator.id
      WHERE t.id = ?
    `).get(result.lastInsertRowid);

    // Send notification to assignee (if not self-assigning)
    if (assigned_to !== req.user.id) {
      const caseInfo = db.prepare('SELECT case_number FROM cases WHERE id = ?').get(caseId);
      notifyTaskAssigned(
        task.id,
        assigned_to,
        req.user.full_name,
        caseInfo.case_number,
        description.trim()
      );
    }

    res.status(201).json({ task, message: 'Task created successfully' });
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Update a task
router.put('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { description, assigned_to, due_date, priority, status, notes } = req.body;

  // Get existing task
  const existing = db.prepare(`
    SELECT t.*, ca.user_id as is_assigned_counsel
    FROM tasks t
    LEFT JOIN case_assignments ca ON t.case_id = ca.case_id AND ca.user_id = ?
    WHERE t.id = ?
  `).get(req.user.id, id);

  if (!existing) {
    return res.status(404).json({ error: 'Task not found' });
  }

  // Permission checks
  const isAdmin = req.user.role === 'admin' || req.user.role === 'internal_counsel';
  const isAssignee = existing.assigned_to === req.user.id;
  const isLocalCounselOnCase = req.user.role === 'local_counsel' && existing.is_assigned_counsel;

  // Client cannot edit tasks
  if (req.user.role === 'client') {
    return res.status(403).json({ error: 'Clients cannot edit tasks' });
  }

  // Non-admin users can only update status of their own tasks
  if (!isAdmin) {
    if (!isAssignee && !isLocalCounselOnCase) {
      return res.status(403).json({ error: 'You can only edit tasks assigned to you' });
    }

    // Non-admin can only change status and notes
    if (description !== undefined || assigned_to !== undefined || due_date !== undefined || priority !== undefined) {
      return res.status(403).json({ error: 'Only admins can modify task details. You can only update the status and notes.' });
    }
  }

  if (priority && !VALID_PRIORITIES.includes(priority)) {
    return res.status(400).json({ error: 'Invalid priority' });
  }

  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const updates = [];
  const values = [];

  if (isAdmin) {
    if (description !== undefined) { updates.push('description = ?'); values.push(description.trim()); }
    if (assigned_to !== undefined) { updates.push('assigned_to = ?'); values.push(assigned_to); }
    if (due_date !== undefined) { updates.push('due_date = ?'); values.push(due_date); }
    if (priority !== undefined) { updates.push('priority = ?'); values.push(priority); }
  }

  if (status !== undefined) { updates.push('status = ?'); values.push(status); }
  if (notes !== undefined) { updates.push('notes = ?'); values.push(notes); }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  updates.push('updated_at = datetime("now")');
  values.push(id);

  db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const task = db.prepare(`
    SELECT t.*,
           assignee.full_name as assigned_to_name,
           creator.full_name as created_by_name
    FROM tasks t
    JOIN users assignee ON t.assigned_to = assignee.id
    JOIN users creator ON t.created_by = creator.id
    WHERE t.id = ?
  `).get(id);

  res.json({ task, message: 'Task updated successfully' });
});

// Delete a task (admin only)
router.delete('/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can delete tasks' });
  }

  const { id } = req.params;

  const existing = db.prepare('SELECT id FROM tasks WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Task not found' });
  }

  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  res.json({ message: 'Task deleted successfully' });
});

// Get documents for a task
router.get('/:id/documents', authenticateToken, (req, res) => {
  const { id } = req.params;

  const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const documents = db.prepare(`
    SELECT td.*, u.full_name as uploaded_by_name
    FROM task_documents td
    JOIN users u ON td.uploaded_by = u.id
    WHERE td.task_id = ?
    ORDER BY td.uploaded_at DESC
  `).all(id);

  res.json({ documents });
});

// Upload document to a task
router.post('/:id/documents', authenticateToken, taskUpload.single('file'), (req, res) => {
  if (req.user.role === 'client') {
    return res.status(403).json({ error: 'Clients cannot upload task documents' });
  }

  const { id } = req.params;

  const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO task_documents (task_id, file_name, original_name, file_path, file_size, mime_type, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      req.file.filename,
      req.file.originalname,
      req.file.path,
      req.file.size,
      req.file.mimetype,
      req.user.id
    );

    const document = db.prepare(`
      SELECT td.*, u.full_name as uploaded_by_name
      FROM task_documents td
      JOIN users u ON td.uploaded_by = u.id
      WHERE td.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json({ document, message: 'Document uploaded successfully' });
  } catch (error) {
    console.error('Error uploading task document:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// Download a task document
router.get('/:taskId/documents/:docId/download', authenticateToken, (req, res) => {
  const { taskId, docId } = req.params;

  const document = db.prepare(`
    SELECT * FROM task_documents WHERE id = ? AND task_id = ?
  `).get(docId, taskId);

  if (!document) {
    return res.status(404).json({ error: 'Document not found' });
  }

  res.download(document.file_path, document.original_name);
});

// Delete a task document
router.delete('/:taskId/documents/:docId', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'internal_counsel') {
    return res.status(403).json({ error: 'Only admins can delete task documents' });
  }

  const { taskId, docId } = req.params;

  const document = db.prepare(`
    SELECT * FROM task_documents WHERE id = ? AND task_id = ?
  `).get(docId, taskId);

  if (!document) {
    return res.status(404).json({ error: 'Document not found' });
  }

  // Delete file from filesystem
  try {
    if (fs.existsSync(document.file_path)) {
      fs.unlinkSync(document.file_path);
    }
  } catch (err) {
    console.error('Error deleting file:', err);
  }

  db.prepare('DELETE FROM task_documents WHERE id = ?').run(docId);
  res.json({ message: 'Document deleted successfully' });
});

export default router;
