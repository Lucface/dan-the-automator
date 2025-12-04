/**
 * Capture API Routes
 *
 * Main endpoint for capturing content from any source
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { CaptureService } from '../services/capture.js';

const router = Router();
const captureService = new CaptureService();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB limit

/**
 * POST /api/capture
 *
 * Main capture endpoint - accepts any content
 *
 * Body:
 * - content: string (required) - The content to capture
 * - context: string (optional) - User context/notes about the content
 * - project: string (optional) - Target project ID
 * - category: string (optional) - Target category ID
 * - tags: string[] (optional) - Tags to apply
 * - priority: string (optional) - low/normal/high/urgent
 * - source: string (optional) - Where this came from (defaults to 'api')
 * - askQuestions: boolean (optional) - Wait for AI analysis (default: false)
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      content,
      context,
      project,
      category,
      tags,
      priority,
      source = 'api',
      sourceDevice,
      askQuestions = false
    } = req.body;

    if (!content) {
      return res.status(400).json({
        error: 'Content is required',
        hint: 'Send any text, URL, or content in the "content" field'
      });
    }

    const result = await captureService.capture({
      content,
      context,
      project,
      category,
      tags: Array.isArray(tags) ? tags : tags ? [tags] : undefined,
      priority,
      source,
      sourceDevice,
      askQuestions
    });

    res.status(201).json({
      success: true,
      message: askQuestions ? 'Captured and analyzed' : 'Captured! AI will sort it.',
      ...result
    });

  } catch (error) {
    console.error('Capture error:', error);
    res.status(500).json({
      error: 'Capture failed',
      message: (error as Error).message
    });
  }
});

/**
 * POST /api/capture/file
 *
 * Capture with file upload
 */
router.post('/file', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { context, project, category, tags } = req.body;

    const result = await captureService.capture({
      content: `[FILE: ${req.file.originalname}]`,
      context: context || `Uploaded file: ${req.file.originalname}`,
      project,
      category,
      tags: tags ? JSON.parse(tags) : undefined,
      source: 'api',
      sourceMetadata: {
        filename: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.path
      }
    });

    res.status(201).json({
      success: true,
      message: 'File captured!',
      ...result
    });

  } catch (error) {
    console.error('File capture error:', error);
    res.status(500).json({
      error: 'File capture failed',
      message: (error as Error).message
    });
  }
});

/**
 * POST /api/capture/batch
 *
 * Capture multiple items at once
 */
router.post('/batch', async (req: Request, res: Response) => {
  try {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: 'Items array is required',
        hint: 'Send an array of content items in "items" field'
      });
    }

    if (items.length > 50) {
      return res.status(400).json({
        error: 'Too many items',
        hint: 'Maximum 50 items per batch'
      });
    }

    const results = await Promise.all(
      items.map(item =>
        captureService.capture({
          content: item.content,
          context: item.context,
          project: item.project,
          category: item.category,
          tags: item.tags,
          source: 'api',
          askQuestions: false
        })
      )
    );

    res.status(201).json({
      success: true,
      message: `Captured ${results.length} items`,
      items: results
    });

  } catch (error) {
    console.error('Batch capture error:', error);
    res.status(500).json({
      error: 'Batch capture failed',
      message: (error as Error).message
    });
  }
});

/**
 * POST /api/capture/quick
 *
 * Ultra-simple capture - just text, nothing else
 */
router.post('/quick', async (req: Request, res: Response) => {
  try {
    // Accept both JSON and plain text
    const content = typeof req.body === 'string'
      ? req.body
      : req.body.content || req.body.text || req.body.data;

    if (!content) {
      return res.status(400).json({ error: 'Send content as plain text or in content/text/data field' });
    }

    const result = await captureService.capture({
      content,
      source: 'api',
      askQuestions: false
    });

    res.status(201).json({
      success: true,
      id: result.id
    });

  } catch (error) {
    console.error('Quick capture error:', error);
    res.status(500).json({ error: 'Capture failed' });
  }
});

export { router as captureRouter };
