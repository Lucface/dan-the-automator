/**
 * Categories API Routes
 */

import { Router, Request, Response } from 'express';
import { db } from '../utils/database.js';

const router = Router();

/**
 * GET /api/categories
 *
 * List all categories
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await db.query(`
      SELECT c.*,
             COUNT(ci.id) as current_count
      FROM categories c
      LEFT JOIN content_items ci ON ci.category_id = c.id
      GROUP BY c.id
      ORDER BY c.item_count DESC
    `);

    res.json({
      categories: result.rows
    });

  } catch (error) {
    console.error('List categories error:', error);
    res.status(500).json({ error: 'Failed to list categories' });
  }
});

/**
 * POST /api/categories
 *
 * Create a new category
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { id, name, description, parent_id, auto_detect_keywords } = req.body;

    if (!id || !name) {
      return res.status(400).json({ error: 'id and name are required' });
    }

    // Validate id format (lowercase, hyphens only)
    if (!/^[a-z][a-z0-9-]*$/.test(id)) {
      return res.status(400).json({
        error: 'Invalid id format',
        hint: 'Use lowercase letters, numbers, and hyphens. Must start with a letter.'
      });
    }

    const result = await db.query(
      `INSERT INTO categories (id, name, description, parent_id, auto_detect_keywords, is_auto_created)
       VALUES ($1, $2, $3, $4, $5, false)
       RETURNING *`,
      [id, name, description, parent_id, auto_detect_keywords || []]
    );

    res.status(201).json({
      success: true,
      category: result.rows[0]
    });

  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Category already exists' });
    }
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

/**
 * GET /api/categories/:id
 *
 * Get category details with items
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const category = await db.query(
      'SELECT * FROM categories WHERE id = $1',
      [id]
    );

    if (category.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const items = await db.query(
      `SELECT * FROM content_items
       WHERE category_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [id]
    );

    res.json({
      category: category.rows[0],
      items: items.rows,
      itemCount: items.rows.length
    });

  } catch (error) {
    console.error('Get category error:', error);
    res.status(500).json({ error: 'Failed to get category' });
  }
});

/**
 * PATCH /api/categories/:id
 *
 * Update category
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, parent_id, auto_detect_keywords } = req.body;

    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(name);
    }

    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(description);
    }

    if (parent_id !== undefined) {
      updates.push(`parent_id = $${paramIndex++}`);
      params.push(parent_id);
    }

    if (auto_detect_keywords !== undefined) {
      updates.push(`auto_detect_keywords = $${paramIndex++}`);
      params.push(auto_detect_keywords);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    params.push(id);

    const result = await db.query(
      `UPDATE categories SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json({
      success: true,
      category: result.rows[0]
    });

  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

/**
 * DELETE /api/categories/:id
 *
 * Delete category (moves items to junk-drawer)
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Don't allow deleting junk-drawer
    if (id === 'junk-drawer') {
      return res.status(400).json({ error: 'Cannot delete junk-drawer category' });
    }

    // Move items to junk-drawer
    await db.query(
      `UPDATE content_items SET category_id = 'junk-drawer' WHERE category_id = $1`,
      [id]
    );

    // Delete category
    const result = await db.query(
      'DELETE FROM categories WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json({
      success: true,
      message: 'Category deleted, items moved to junk-drawer'
    });

  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

/**
 * POST /api/categories/:id/merge
 *
 * Merge another category into this one
 */
router.post('/:id/merge', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { sourceCategory } = req.body;

    if (!sourceCategory) {
      return res.status(400).json({ error: 'sourceCategory is required' });
    }

    if (sourceCategory === id) {
      return res.status(400).json({ error: 'Cannot merge category into itself' });
    }

    // Move items from source to target
    const moveResult = await db.query(
      `UPDATE content_items
       SET category_id = $1, updated_at = NOW()
       WHERE category_id = $2
       RETURNING id`,
      [id, sourceCategory]
    );

    // Delete source category
    await db.query('DELETE FROM categories WHERE id = $1', [sourceCategory]);

    res.json({
      success: true,
      message: `Merged ${moveResult.rows.length} items from ${sourceCategory} into ${id}`,
      itemsMoved: moveResult.rows.length
    });

  } catch (error) {
    console.error('Merge category error:', error);
    res.status(500).json({ error: 'Failed to merge categories' });
  }
});

export { router as categoriesRouter };
