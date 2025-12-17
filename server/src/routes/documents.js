import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database.js';
import { authenticateToken, canAccessCase } from '../middleware/auth.js';

const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', '..', 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const VALID_CATEGORIES = [
  'Demand Letters',
  'Responses/Correspondence',
  'Contracts/Underlying Documents',
  'Pleadings',
  'Discovery',
  'Settlement Documents',
  'Court Orders',
  'Other'
];

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp'
];

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: PDF, Word, Excel, and images.'));
    }
  }
});

// Get all documents for a case (grouped by category)
router.get('/case/:caseId', authenticateToken, canAccessCase, (req, res) => {
  const { caseId } = req.params;

  const documents = db.prepare(`
    SELECT d.*, u.full_name as uploaded_by_name
    FROM documents d
    JOIN users u ON d.uploaded_by = u.id
    WHERE d.case_id = ?
    ORDER BY d.category, d.uploaded_at DESC
  `).all(caseId);

  // Group by category
  const grouped = {};
  for (const doc of documents) {
    if (!grouped[doc.category]) {
      grouped[doc.category] = [];
    }
    grouped[doc.category].push(doc);
  }

  res.json({ documents, grouped });
});

// Get document categories
router.get('/categories', authenticateToken, (req, res) => {
  res.json({ categories: VALID_CATEGORIES });
});

// Upload a document
router.post('/case/:caseId', authenticateToken, canAccessCase, upload.single('file'), (req, res) => {
  const { caseId } = req.params;
  const { category } = req.body;

  // Client users cannot upload documents
  if (req.user.role === 'client') {
    // Clean up uploaded file if any
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(403).json({ error: 'Clients cannot upload documents' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  if (!category || !VALID_CATEGORIES.includes(category)) {
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Valid document category is required' });
  }

  // Verify case exists
  const caseExists = db.prepare('SELECT id FROM cases WHERE id = ?').get(caseId);
  if (!caseExists) {
    fs.unlinkSync(req.file.path);
    return res.status(404).json({ error: 'Case not found' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO documents (
        case_id, file_name, original_name, file_path, file_size, mime_type, category, uploaded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      caseId,
      req.file.filename,
      req.file.originalname,
      req.file.path,
      req.file.size,
      req.file.mimetype,
      category,
      req.user.id
    );

    const document = db.prepare(`
      SELECT d.*, u.full_name as uploaded_by_name
      FROM documents d
      JOIN users u ON d.uploaded_by = u.id
      WHERE d.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json({ document, message: 'Document uploaded successfully' });
  } catch (error) {
    console.error('Error uploading document:', error);
    // Clean up file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// Download/view a document
router.get('/:id/download', authenticateToken, async (req, res) => {
  const { id } = req.params;

  const document = db.prepare(`
    SELECT d.*, c.id as case_id
    FROM documents d
    JOIN cases c ON d.case_id = c.id
    WHERE d.id = ?
  `).get(id);

  if (!document) {
    return res.status(404).json({ error: 'Document not found' });
  }

  // Check case access for local counsel
  if (req.user.role === 'local_counsel') {
    const assignment = db.prepare(`
      SELECT id FROM case_assignments WHERE case_id = ? AND user_id = ?
    `).get(document.case_id, req.user.id);

    if (!assignment) {
      return res.status(403).json({ error: 'You are not assigned to this case' });
    }
  }

  if (!fs.existsSync(document.file_path)) {
    return res.status(404).json({ error: 'File not found on server' });
  }

  res.download(document.file_path, document.original_name);
});

// Delete a document (admin only)
router.delete('/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can delete documents' });
  }

  const { id } = req.params;

  const document = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
  if (!document) {
    return res.status(404).json({ error: 'Document not found' });
  }

  // Delete file from disk
  if (fs.existsSync(document.file_path)) {
    fs.unlinkSync(document.file_path);
  }

  // Delete from database
  db.prepare('DELETE FROM documents WHERE id = ?').run(id);

  res.json({ message: 'Document deleted successfully' });
});

// Error handling middleware for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
    }
    return res.status(400).json({ error: error.message });
  }
  if (error) {
    return res.status(400).json({ error: error.message });
  }
  next();
});

export default router;
