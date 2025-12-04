/**
 * Content API Routes
 *
 * CRUD operations for content items
 */

import { Router, Request, Response } from 'express';
import { db } from '../utils/database.js';

const router = Router();

/**
 * GET /api/content
 *
 * List content items with filtering
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      status,
      project,
      category,
      tag,
      type,
      search,
      limit = 50,
      offset = 0,
      sort = 'created_at',
      order = 'desc'
    } = req.query;

    let query = 'SELECT * FROM content_items WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    if (project) {
      query += ` AND project_id = $${paramIndex++}`;
      params.push(project);
    }

    if (category) {
      query += ` AND category_id = $${paramIndex++}`;
      params.push(category);
    }

    if (tag) {
      query += ` AND $${paramIndex++} = ANY(tags)`;
      params.push(tag);
    }

    if (type) {
      query += ` AND content_type = $${paramIndex++}`;
      params.push(type);
    }

    if (search) {
      query += ` AND (
        raw_content ILIKE $${paramIndex} OR
        user_context ILIKE $${paramIndex} OR
        (parsed_content->>'title') ILIKE $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Validate sort column
    const allowedSorts = ['created_at', 'updated_at', 'priority', 'status'];
    const sortCol = allowedSorts.includes(sort as string) ? sort : 'created_at';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

    query += ` ORDER BY ${sortCol} ${sortOrder}`;
    query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(Number(limit), Number(offset));

    const result = await db.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM content_items WHERE 1=1';
    const countParams: any[] = [];
    let countIndex = 1;

    if (status) {
      countQuery += ` AND status = $${countIndex++}`;
      countParams.push(status);
    }
    if (project) {
      countQuery += ` AND project_id = $${countIndex++}`;
      countParams.push(project);
    }
    if (category) {
      countQuery += ` AND category_id = $${countIndex++}`;
      countParams.push(category);
    }

    const countResult = await db.query(countQuery, countParams);

    res.json({
      items: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: Number(limit),
      offset: Number(offset)
    });

  } catch (error) {
    console.error('List content error:', error);
    res.status(500).json({ error: 'Failed to list content' });
  }
});

/**
 * GET /api/content/inbox
 *
 * Get unprocessed items (inbox)
 */
router.get('/inbox', async (req: Request, res: Response) => {
  try {
    const result = await db.query(
      `SELECT * FROM content_items
       WHERE status IN ('inbox', 'processing')
       ORDER BY priority DESC, created_at DESC`
    );

    res.json({
      items: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    console.error('Get inbox error:', error);
    res.status(500).json({ error: 'Failed to get inbox' });
  }
});

/**
 * GET /api/content/junk-drawer
 *
 * Get items in junk drawer
 */
router.get('/junk-drawer', async (req: Request, res: Response) => {
  try {
    const result = await db.query(
      `SELECT * FROM content_items
       WHERE category_id = 'junk-drawer'
       ORDER BY created_at DESC`
    );

    res.json({
      items: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    console.error('Get junk drawer error:', error);
    res.status(500).json({ error: 'Failed to get junk drawer' });
  }
});

/**
 * GET /api/content/:id
 *
 * Get single content item
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      'SELECT * FROM content_items WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Content not found' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error('Get content error:', error);
    res.status(500).json({ error: 'Failed to get content' });
  }
});

/**
 * PATCH /api/content/:id
 *
 * Update content item
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { project, category, tags, status, priority, user_context } = req.body;

    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (project !== undefined) {
      updates.push(`project_id = $${paramIndex++}`);
      params.push(project);
    }

    if (category !== undefined) {
      updates.push(`category_id = $${paramIndex++}`);
      params.push(category);
    }

    if (tags !== undefined) {
      updates.push(`tags = $${paramIndex++}`);
      params.push(tags);
    }

    if (status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      params.push(status);
    }

    if (priority !== undefined) {
      updates.push(`priority = $${paramIndex++}`);
      params.push(priority);
    }

    if (user_context !== undefined) {
      updates.push(`user_context = $${paramIndex++}`);
      params.push(user_context);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    updates.push('updated_at = NOW()');
    params.push(id);

    const query = `
      UPDATE content_items
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Content not found' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error('Update content error:', error);
    res.status(500).json({ error: 'Failed to update content' });
  }
});

/**
 * POST /api/content/:id/categorize
 *
 * Manually categorize an item
 */
router.post('/:id/categorize', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { project, category, tags } = req.body;

    const result = await db.query(
      `UPDATE content_items
       SET project_id = COALESCE($1, project_id),
           category_id = COALESCE($2, category_id),
           tags = CASE WHEN $3::text[] IS NOT NULL THEN $3 ELSE tags END,
           status = 'categorized',
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [project, category, tags, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Content not found' });
    }

    res.json({
      success: true,
      message: 'Content categorized',
      item: result.rows[0]
    });

  } catch (error) {
    console.error('Categorize error:', error);
    res.status(500).json({ error: 'Failed to categorize content' });
  }
});

/**
 * POST /api/content/:id/archive
 *
 * Archive an item
 */
router.post('/:id/archive', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `UPDATE content_items
       SET status = 'archived',
           archived_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Content not found' });
    }

    res.json({
      success: true,
      message: 'Content archived',
      item: result.rows[0]
    });

  } catch (error) {
    console.error('Archive error:', error);
    res.status(500).json({ error: 'Failed to archive content' });
  }
});

/**
 * DELETE /api/content/:id
 *
 * Delete content item
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      'DELETE FROM content_items WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Content not found' });
    }

    res.json({
      success: true,
      message: 'Content deleted'
    });

  } catch (error) {
    console.error('Delete content error:', error);
    res.status(500).json({ error: 'Failed to delete content' });
  }
});

/**
 * GET /api/content/stats
 *
 * Get content statistics
 */
router.get('/stats/summary', async (req: Request, res: Response) => {
  try {
    const stats = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'inbox') as inbox,
        COUNT(*) FILTER (WHERE status = 'processing') as processing,
        COUNT(*) FILTER (WHERE status = 'categorized') as categorized,
        COUNT(*) FILTER (WHERE status = 'archived') as archived,
        COUNT(*) FILTER (WHERE category_id = 'junk-drawer') as junk_drawer,
        COUNT(DISTINCT project_id) FILTER (WHERE project_id IS NOT NULL) as projects_used,
        COUNT(DISTINCT category_id) as categories_used
      FROM content_items
    `);

    const recentActivity = await db.query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as count
      FROM content_items
      WHERE created_at > NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

    res.json({
      stats: stats.rows[0],
      recentActivity: recentActivity.rows
    });

  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

export { router as contentRouter };
