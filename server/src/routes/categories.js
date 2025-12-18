import { Router } from 'express';
import { db } from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import { logAudit } from '../services/auditService.js';

const router = Router();

// Get all categories (for dropdowns - active only by default)
router.get('/', authenticateToken, (req, res) => {
  const includeInactive = req.query.include_inactive === 'true';

  let query = `
    SELECT id, name, code, description, default_claim_language, display_order, status, created_at, updated_at
    FROM case_categories
  `;

  if (!includeInactive) {
    query += ` WHERE status = 'Active'`;
  }

  query += ` ORDER BY display_order ASC, name ASC`;

  const categories = db.prepare(query).all();
  res.json({ categories });
});

// Get single category
router.get('/:id', authenticateToken, (req, res) => {
  const category = db.prepare(`
    SELECT id, name, code, description, default_claim_language, display_order, status, created_by, created_at, updated_at
    FROM case_categories
    WHERE id = ?
  `).get(req.params.id);

  if (!category) {
    return res.status(404).json({ error: 'Category not found' });
  }

  // Get usage count
  const usageCount = db.prepare(`
    SELECT COUNT(*) as count FROM cases WHERE category_id = ?
  `).get(req.params.id);

  res.json({ category: { ...category, usage_count: usageCount.count } });
});

// Create category (admin only)
router.post('/', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'internal_counsel') {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { name, code, description, default_claim_language, display_order, status } = req.body;

  if (!name || !code) {
    return res.status(400).json({ error: 'Category name and code are required' });
  }

  // Check for duplicate name or code
  const existing = db.prepare(`
    SELECT id FROM case_categories WHERE name = ? OR code = ?
  `).get(name, code);

  if (existing) {
    return res.status(400).json({ error: 'A category with this name or code already exists' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO case_categories (name, code, description, default_claim_language, display_order, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      code.toUpperCase(),
      description || null,
      default_claim_language || null,
      display_order || 0,
      status || 'Active',
      req.user.id
    );

    const category = db.prepare('SELECT * FROM case_categories WHERE id = ?').get(result.lastInsertRowid);

    logAudit(req, 'CREATE', 'category', category.id, category.name, { code: category.code });

    res.status(201).json({ category });
  } catch (err) {
    console.error('Error creating category:', err);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// Update category (admin only)
router.put('/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'internal_counsel') {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { name, code, description, default_claim_language, display_order, status } = req.body;

  if (!name || !code) {
    return res.status(400).json({ error: 'Category name and code are required' });
  }

  const existing = db.prepare('SELECT * FROM case_categories WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Category not found' });
  }

  // Check for duplicate name or code (excluding current)
  const duplicate = db.prepare(`
    SELECT id FROM case_categories WHERE (name = ? OR code = ?) AND id != ?
  `).get(name, code, req.params.id);

  if (duplicate) {
    return res.status(400).json({ error: 'A category with this name or code already exists' });
  }

  try {
    db.prepare(`
      UPDATE case_categories
      SET name = ?, code = ?, description = ?, default_claim_language = ?, display_order = ?, status = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      name,
      code.toUpperCase(),
      description || null,
      default_claim_language || null,
      display_order || 0,
      status || 'Active',
      req.params.id
    );

    const category = db.prepare('SELECT * FROM case_categories WHERE id = ?').get(req.params.id);

    logAudit(req, 'UPDATE', 'category', category.id, category.name, { code: category.code });

    res.json({ category });
  } catch (err) {
    console.error('Error updating category:', err);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// Delete category (admin only) - only if no cases are using it
router.delete('/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }

  const category = db.prepare('SELECT * FROM case_categories WHERE id = ?').get(req.params.id);
  if (!category) {
    return res.status(404).json({ error: 'Category not found' });
  }

  // Check if any cases are using this category
  const usageCount = db.prepare('SELECT COUNT(*) as count FROM cases WHERE category_id = ?').get(req.params.id);
  if (usageCount.count > 0) {
    return res.status(400).json({
      error: `Cannot delete category. ${usageCount.count} case(s) are using this category. Set status to Inactive instead.`
    });
  }

  try {
    db.prepare('DELETE FROM case_categories WHERE id = ?').run(req.params.id);

    logAudit(req, 'DELETE', 'category', category.id, category.name, { code: category.code });

    res.json({ message: 'Category deleted successfully' });
  } catch (err) {
    console.error('Error deleting category:', err);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// Reorder categories (admin only)
router.post('/reorder', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'internal_counsel') {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { categoryIds } = req.body;

  if (!Array.isArray(categoryIds)) {
    return res.status(400).json({ error: 'categoryIds must be an array' });
  }

  try {
    const updateOrder = db.prepare('UPDATE case_categories SET display_order = ? WHERE id = ?');

    categoryIds.forEach((id, index) => {
      updateOrder.run(index + 1, id);
    });

    logAudit(req, 'REORDER', 'category', null, 'Categories reordered', { order: categoryIds });

    res.json({ message: 'Categories reordered successfully' });
  } catch (err) {
    console.error('Error reordering categories:', err);
    res.status(500).json({ error: 'Failed to reorder categories' });
  }
});

// Get category statistics
router.get('/stats/summary', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'internal_counsel') {
    return res.status(403).json({ error: 'Access denied' });
  }

  const stats = db.prepare(`
    SELECT
      cc.id,
      cc.name,
      cc.code,
      COUNT(c.id) as case_count,
      COALESCE(SUM(CASE WHEN c.resolution_status = 'Open' THEN 1 ELSE 0 END), 0) as open_cases,
      COALESCE(SUM(c.amount_claimed), 0) as total_claimed,
      COALESCE(SUM(c.amount_recovered), 0) as total_recovered
    FROM case_categories cc
    LEFT JOIN cases c ON cc.id = c.category_id
    WHERE cc.status = 'Active'
    GROUP BY cc.id
    ORDER BY cc.display_order ASC
  `).all();

  res.json({ stats });
});

export default router;
