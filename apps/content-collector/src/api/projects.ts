/**
 * Projects API Routes
 */

import { Router, Request, Response } from 'express';
import { db } from '../utils/database.js';

const router = Router();

/**
 * GET /api/projects
 *
 * List all projects
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await db.query(`
      SELECT p.*,
             COUNT(ci.id) as content_count
      FROM projects p
      LEFT JOIN content_items ci ON ci.project_id = p.id
      WHERE p.active = true
      GROUP BY p.id
      ORDER BY p.name
    `);

    res.json({
      projects: result.rows
    });

  } catch (error) {
    console.error('List projects error:', error);
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

/**
 * POST /api/projects
 *
 * Create a new project
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { id, name, description, keywords, intake_path } = req.body;

    if (!id || !name) {
      return res.status(400).json({ error: 'id and name are required' });
    }

    const result = await db.query(
      `INSERT INTO projects (id, name, description, keywords, intake_path)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, name, description, keywords || [], intake_path]
    );

    res.status(201).json({
      success: true,
      project: result.rows[0]
    });

  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Project already exists' });
    }
    console.error('Create project error:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

/**
 * GET /api/projects/:id
 *
 * Get project details with content
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const project = await db.query(
      'SELECT * FROM projects WHERE id = $1',
      [id]
    );

    if (project.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const items = await db.query(
      `SELECT * FROM content_items
       WHERE project_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [id]
    );

    res.json({
      project: project.rows[0],
      items: items.rows,
      itemCount: items.rows.length
    });

  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ error: 'Failed to get project' });
  }
});

/**
 * PATCH /api/projects/:id
 *
 * Update project
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, keywords, intake_path, active } = req.body;

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

    if (keywords !== undefined) {
      updates.push(`keywords = $${paramIndex++}`);
      params.push(keywords);
    }

    if (intake_path !== undefined) {
      updates.push(`intake_path = $${paramIndex++}`);
      params.push(intake_path);
    }

    if (active !== undefined) {
      updates.push(`active = $${paramIndex++}`);
      params.push(active);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    params.push(id);

    const result = await db.query(
      `UPDATE projects SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({
      success: true,
      project: result.rows[0]
    });

  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

/**
 * DELETE /api/projects/:id
 *
 * Deactivate project (doesn't delete content)
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `UPDATE projects SET active = false, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({
      success: true,
      message: 'Project deactivated'
    });

  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

export { router as projectsRouter };
