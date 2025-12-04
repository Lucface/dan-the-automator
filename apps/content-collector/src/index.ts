/**
 * Content Collector - Main Entry Point
 *
 * Universal capture system for Dan the Automator
 * Drop anything from anywhere, AI sorts it out
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from 'dotenv';
import { captureRouter } from './api/capture.js';
import { contentRouter } from './api/content.js';
import { categoriesRouter } from './api/categories.js';
import { projectsRouter } from './api/projects.js';
import { tidyRouter } from './api/tidy.js';
import { EmailIngestion } from './integrations/email.js';
import { startTidyScheduler } from './services/scheduler.js';

// Load environment variables
config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Authentication middleware
const authenticate = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;

  // Allow health check without auth
  if (req.path === '/health') {
    return next();
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.substring(7);
  if (token !== process.env.API_SECRET) {
    return res.status(403).json({ error: 'Invalid API token' });
  }

  next();
};

// Health check (no auth required)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'content-collector',
    timestamp: new Date().toISOString()
  });
});

// Apply auth to all API routes
app.use('/api', authenticate);

// API Routes
app.use('/api/capture', captureRouter);
app.use('/api/content', contentRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/tidy', tidyRouter);

// Quick capture endpoint (simplified)
app.post('/api/drop', authenticate, async (req, res) => {
  // Shorthand for /api/capture - just drop it in
  const { content, context } = req.body;

  if (!content) {
    return res.status(400).json({ error: 'Content is required' });
  }

  // Forward to capture service
  try {
    const { CaptureService } = await import('./services/capture.js');
    const captureService = new CaptureService();

    const result = await captureService.capture({
      content,
      context,
      source: 'api',
      askQuestions: false // Just accept it, no questions
    });

    res.json({
      success: true,
      id: result.id,
      message: 'Captured! AI will sort it out.'
    });
  } catch (error) {
    console.error('Quick capture error:', error);
    res.status(500).json({ error: 'Capture failed' });
  }
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    CONTENT COLLECTOR                           ║
║                                                                 ║
║  Your universal capture net is running!                        ║
║                                                                 ║
║  API Server:    http://localhost:${PORT}                          ║
║  Quick Capture: POST /api/drop                                 ║
║  Full Capture:  POST /api/capture                              ║
║                                                                 ║
║  Drop anything. AI sorts it. Zero friction.                    ║
╚═══════════════════════════════════════════════════════════════╝
  `);

  // Start email ingestion if configured
  if (process.env.EMAIL_IMAP_HOST) {
    const emailIngestion = new EmailIngestion();
    emailIngestion.start();
    console.log('📧 Email ingestion started');
  }

  // Start tidy scheduler
  startTidyScheduler();
  console.log('🧹 Tidy scheduler started');
});

export default app;
