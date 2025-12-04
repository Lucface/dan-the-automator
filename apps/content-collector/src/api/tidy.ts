/**
 * Tidy API Routes
 *
 * Trigger and monitor cleanup/organization jobs
 */

import { Router, Request, Response } from 'express';
import { TidyService } from '../services/tidy.js';
import { db } from '../utils/database.js';

const router = Router();
const tidyService = new TidyService();

/**
 * POST /api/tidy
 *
 * Trigger a tidy job
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { type = 'manual' } = req.body;

    // Check if there's already a running job
    const running = await db.query(
      "SELECT * FROM tidy_jobs WHERE status = 'pending' OR status = 'running'"
    );

    if (running.rows.length > 0) {
      return res.status(409).json({
        error: 'A tidy job is already running',
        job: running.rows[0]
      });
    }

    // Start the job
    const jobId = await tidyService.startTidyJob(type);

    res.status(202).json({
      success: true,
      message: 'Tidy job started',
      jobId
    });

  } catch (error) {
    console.error('Tidy job error:', error);
    res.status(500).json({ error: 'Failed to start tidy job' });
  }
});

/**
 * GET /api/tidy/status
 *
 * Get current/recent tidy job status
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const result = await db.query(
      `SELECT * FROM tidy_jobs
       ORDER BY created_at DESC
       LIMIT 10`
    );

    res.json({
      jobs: result.rows
    });

  } catch (error) {
    console.error('Tidy status error:', error);
    res.status(500).json({ error: 'Failed to get tidy status' });
  }
});

/**
 * GET /api/tidy/preview
 *
 * Preview what a tidy job would do without executing
 */
router.get('/preview', async (req: Request, res: Response) => {
  try {
    const preview = await tidyService.previewTidy();

    res.json(preview);

  } catch (error) {
    console.error('Tidy preview error:', error);
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

/**
 * POST /api/tidy/junk-drawer
 *
 * Specifically tidy the junk drawer
 */
router.post('/junk-drawer', async (req: Request, res: Response) => {
  try {
    const result = await tidyService.tidyJunkDrawer();

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('Junk drawer tidy error:', error);
    res.status(500).json({ error: 'Failed to tidy junk drawer' });
  }
});

/**
 * POST /api/tidy/suggest-categories
 *
 * Get AI suggestions for new categories based on content patterns
 */
router.post('/suggest-categories', async (req: Request, res: Response) => {
  try {
    const suggestions = await tidyService.suggestNewCategories();

    res.json({
      suggestions
    });

  } catch (error) {
    console.error('Category suggestion error:', error);
    res.status(500).json({ error: 'Failed to generate suggestions' });
  }
});

export { router as tidyRouter };
