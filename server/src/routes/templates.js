import { Router } from 'express';
import { db } from '../database.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

// Get all templates
router.get('/', authenticateToken, requireRole('admin', 'internal_counsel'), (req, res) => {
  const templates = db.prepare(`
    SELECT t.*, u.full_name as created_by_name
    FROM document_templates t
    LEFT JOIN users u ON t.created_by = u.id
    ORDER BY t.template_type, t.name
  `).all();

  res.json({ templates });
});

// Get single template
router.get('/:id', authenticateToken, requireRole('admin', 'internal_counsel'), (req, res) => {
  const template = db.prepare(`
    SELECT t.*, u.full_name as created_by_name
    FROM document_templates t
    LEFT JOIN users u ON t.created_by = u.id
    WHERE t.id = ?
  `).get(req.params.id);

  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }

  res.json({ template });
});

// Create template
router.post('/', authenticateToken, requireRole('admin'), (req, res) => {
  const { name, template_type, content, description, is_active } = req.body;

  if (!name || !template_type || !content) {
    return res.status(400).json({ error: 'Name, template type, and content are required' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO document_templates (name, template_type, content, description, is_active, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(name, template_type, content, description || '', is_active !== false ? 1 : 0, req.user.id);

    res.status(201).json({
      message: 'Template created successfully',
      template_id: result.lastInsertRowid
    });
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// Update template
router.put('/:id', authenticateToken, requireRole('admin'), (req, res) => {
  const { name, template_type, content, description, is_active } = req.body;

  const template = db.prepare('SELECT * FROM document_templates WHERE id = ?').get(req.params.id);
  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }

  try {
    db.prepare(`
      UPDATE document_templates
      SET name = ?, template_type = ?, content = ?, description = ?, is_active = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      name || template.name,
      template_type || template.template_type,
      content || template.content,
      description !== undefined ? description : template.description,
      is_active !== undefined ? (is_active ? 1 : 0) : template.is_active,
      req.params.id
    );

    res.json({ message: 'Template updated successfully' });
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// Delete template
router.delete('/:id', authenticateToken, requireRole('admin'), (req, res) => {
  const template = db.prepare('SELECT * FROM document_templates WHERE id = ?').get(req.params.id);
  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }

  try {
    db.prepare('DELETE FROM document_templates WHERE id = ?').run(req.params.id);
    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// Get available merge fields
router.get('/merge-fields/list', authenticateToken, requireRole('admin', 'internal_counsel'), (req, res) => {
  const mergeFields = [
    { field: '{{defendant_name}}', description: 'Defendant name' },
    { field: '{{defendant_contact_name}}', description: 'Defendant contact person' },
    { field: '{{defendant_address}}', description: 'Defendant mailing address' },
    { field: '{{defendant_city_state}}', description: 'Defendant city and state' },
    { field: '{{defendant_email}}', description: 'Defendant email' },
    { field: '{{defendant_phone}}', description: 'Defendant phone number' },
    { field: '{{defendant_attorney_name}}', description: "Defendant's attorney name" },
    { field: '{{defendant_attorney_firm}}', description: "Defendant's attorney law firm" },
    { field: '{{defendant_attorney_address}}', description: "Defendant's attorney address" },
    { field: '{{defendant_attorney_email}}', description: "Defendant's attorney email" },
    { field: '{{defendant_attorney_phone}}', description: "Defendant's attorney phone" },
    { field: '{{amount_claimed}}', description: 'Amount claimed (formatted as currency)' },
    { field: '{{amount_claimed_words}}', description: 'Amount claimed in words' },
    { field: '{{claim_description}}', description: 'Claim description' },
    { field: '{{date_claim_arose}}', description: 'Date the claim arose' },
    { field: '{{case_number}}', description: 'Case number' },
    { field: '{{case_name}}', description: 'Case name' },
    { field: '{{today_date}}', description: 'Current date' },
    { field: '{{response_deadline}}', description: 'Response deadline (30 days from today)' },
    { field: '{{statute_of_limitations_date}}', description: 'Statute of limitations date' }
  ];

  res.json({ mergeFields });
});

// Generate document from template for a case
router.post('/generate/:templateId/case/:caseId', authenticateToken, requireRole('admin', 'internal_counsel'), (req, res) => {
  const { templateId, caseId } = req.params;
  const { updateCase } = req.body; // Whether to update case dates/stage

  // Get template
  const template = db.prepare('SELECT * FROM document_templates WHERE id = ? AND is_active = 1').get(templateId);
  if (!template) {
    return res.status(404).json({ error: 'Template not found or inactive' });
  }

  // Get case data
  const caseData = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
  if (!caseData) {
    return res.status(404).json({ error: 'Case not found' });
  }

  // Format currency helper
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
  };

  // Number to words helper (simplified)
  const numberToWords = (num) => {
    const amount = Math.floor(num || 0);
    // Simplified - in production would use a library
    return `${amount.toLocaleString()} dollars`;
  };

  // Format date helper
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  // Calculate response deadline (30 days from today)
  const responseDeadline = new Date();
  responseDeadline.setDate(responseDeadline.getDate() + 30);

  // Merge field replacements
  const mergeData = {
    '{{defendant_name}}': caseData.defendant_name || '',
    '{{defendant_contact_name}}': caseData.defendant_contact_name || caseData.defendant_name || '',
    '{{defendant_address}}': caseData.defendant_mailing_address || '',
    '{{defendant_city_state}}': caseData.defendant_state || '',
    '{{defendant_email}}': caseData.defendant_email || '',
    '{{defendant_phone}}': caseData.defendant_phone || '',
    '{{defendant_attorney_name}}': caseData.defendant_attorney_name || '',
    '{{defendant_attorney_firm}}': caseData.defendant_attorney_firm || '',
    '{{defendant_attorney_address}}': caseData.defendant_attorney_address || '',
    '{{defendant_attorney_email}}': caseData.defendant_attorney_email || '',
    '{{defendant_attorney_phone}}': caseData.defendant_attorney_phone || '',
    '{{amount_claimed}}': formatCurrency(caseData.amount_claimed),
    '{{amount_claimed_words}}': numberToWords(caseData.amount_claimed),
    '{{claim_description}}': caseData.claim_description || '',
    '{{date_claim_arose}}': formatDate(caseData.date_claim_arose),
    '{{case_number}}': caseData.case_number || '',
    '{{case_name}}': caseData.case_name || '',
    '{{today_date}}': formatDate(new Date().toISOString()),
    '{{response_deadline}}': formatDate(responseDeadline.toISOString()),
    '{{statute_of_limitations_date}}': formatDate(caseData.statute_of_limitations_date)
  };

  // Replace merge fields in content
  let generatedContent = template.content;
  for (const [field, value] of Object.entries(mergeData)) {
    generatedContent = generatedContent.split(field).join(value);
  }

  const today = new Date().toISOString().split('T')[0];
  const deadlineDate = responseDeadline.toISOString().split('T')[0];

  // Determine document category and case updates based on template type
  let documentCategory = 'Notice';
  let stageUpdate = null;
  let dateField = null;
  let deadlineField = null;

  if (template.template_type === 'Initial Notice') {
    documentCategory = 'Initial Notice - Generated';
    stageUpdate = 'Initial Notice Sent';
    dateField = 'initial_notice_sent_date';
    deadlineField = 'initial_notice_response_deadline';
  } else if (template.template_type === 'Second Notice') {
    documentCategory = 'Second Notice - Generated';
    stageUpdate = 'Second Notice Sent';
    dateField = 'second_notice_sent_date';
    deadlineField = 'second_notice_response_deadline';
  } else if (template.template_type === 'Demand Letter') {
    documentCategory = 'Demand Letter - Generated';
  }

  try {
    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Save generated document as a text file
    const fileName = `${caseData.case_number}-${template.template_type.replace(/\s+/g, '-')}-${today}.txt`;
    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, generatedContent, 'utf8');

    // Create document record
    const docResult = db.prepare(`
      INSERT INTO documents (case_id, file_name, original_name, file_path, file_size, mime_type, category, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      caseId,
      fileName,
      `${template.name} - ${formatDate(new Date().toISOString())}.txt`,
      filePath,
      Buffer.byteLength(generatedContent, 'utf8'),
      'text/plain',
      documentCategory,
      req.user.id
    );

    // Update case if requested
    if (updateCase !== false && stageUpdate) {
      const updates = [];
      const values = [];

      if (dateField) {
        updates.push(`${dateField} = ?`);
        values.push(today);
      }
      if (deadlineField) {
        updates.push(`${deadlineField} = ?`);
        values.push(deadlineDate);
      }
      updates.push('current_stage = ?');
      values.push(stageUpdate);
      updates.push('stage_changed_at = ?');
      values.push(new Date().toISOString());
      updates.push("updated_at = datetime('now')");

      values.push(caseId);

      db.prepare(`UPDATE cases SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    res.json({
      message: 'Document generated successfully',
      document_id: docResult.lastInsertRowid,
      file_name: fileName,
      content_preview: generatedContent.substring(0, 500) + '...',
      case_updated: updateCase !== false && stageUpdate ? true : false
    });
  } catch (error) {
    console.error('Error generating document:', error);
    res.status(500).json({ error: 'Failed to generate document' });
  }
});

// Preview template with case data (without saving)
router.post('/preview/:templateId/case/:caseId', authenticateToken, requireRole('admin', 'internal_counsel'), (req, res) => {
  const { templateId, caseId } = req.params;

  // Get template
  const template = db.prepare('SELECT * FROM document_templates WHERE id = ?').get(templateId);
  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }

  // Get case data
  const caseData = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
  if (!caseData) {
    return res.status(404).json({ error: 'Case not found' });
  }

  // Format helpers
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
  };

  const numberToWords = (num) => {
    const amount = Math.floor(num || 0);
    return `${amount.toLocaleString()} dollars`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const responseDeadline = new Date();
  responseDeadline.setDate(responseDeadline.getDate() + 30);

  const mergeData = {
    '{{defendant_name}}': caseData.defendant_name || '',
    '{{defendant_contact_name}}': caseData.defendant_contact_name || caseData.defendant_name || '',
    '{{defendant_address}}': caseData.defendant_mailing_address || '',
    '{{defendant_city_state}}': caseData.defendant_state || '',
    '{{defendant_email}}': caseData.defendant_email || '',
    '{{defendant_phone}}': caseData.defendant_phone || '',
    '{{defendant_attorney_name}}': caseData.defendant_attorney_name || '',
    '{{defendant_attorney_firm}}': caseData.defendant_attorney_firm || '',
    '{{defendant_attorney_address}}': caseData.defendant_attorney_address || '',
    '{{defendant_attorney_email}}': caseData.defendant_attorney_email || '',
    '{{defendant_attorney_phone}}': caseData.defendant_attorney_phone || '',
    '{{amount_claimed}}': formatCurrency(caseData.amount_claimed),
    '{{amount_claimed_words}}': numberToWords(caseData.amount_claimed),
    '{{claim_description}}': caseData.claim_description || '',
    '{{date_claim_arose}}': formatDate(caseData.date_claim_arose),
    '{{case_number}}': caseData.case_number || '',
    '{{case_name}}': caseData.case_name || '',
    '{{today_date}}': formatDate(new Date().toISOString()),
    '{{response_deadline}}': formatDate(responseDeadline.toISOString()),
    '{{statute_of_limitations_date}}': formatDate(caseData.statute_of_limitations_date)
  };

  let generatedContent = template.content;
  for (const [field, value] of Object.entries(mergeData)) {
    generatedContent = generatedContent.split(field).join(value);
  }

  res.json({
    template_name: template.name,
    template_type: template.template_type,
    content: generatedContent
  });
});

// Get templates by type (for case detail page dropdown)
router.get('/by-type/:type', authenticateToken, requireRole('admin', 'internal_counsel'), (req, res) => {
  const templates = db.prepare(`
    SELECT id, name, template_type, description
    FROM document_templates
    WHERE template_type = ? AND is_active = 1
    ORDER BY name
  `).all(req.params.type);

  res.json({ templates });
});

export default router;
