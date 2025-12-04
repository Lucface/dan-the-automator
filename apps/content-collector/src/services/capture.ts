/**
 * Capture Service
 *
 * Core service for capturing content from any source
 */

import { v4 as uuidv4 } from 'uuid';
import { ContentProcessor } from '../processors/content.js';
import { db } from '../utils/database.js';
import { detectContentType, extractMetadata } from '../utils/content-detection.js';
import { writeContentFile } from '../utils/file-storage.js';

export interface CaptureInput {
  content: string;
  context?: string;
  source: 'api' | 'email' | 'shortcut' | 'slack' | 'browser';
  sourceDevice?: string;
  sourceMetadata?: Record<string, any>;
  project?: string;
  category?: string;
  tags?: string[];
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  askQuestions?: boolean;
}

export interface CaptureResult {
  id: string;
  status: 'captured' | 'processing' | 'categorized';
  contentType: string;
  project?: string;
  category?: string;
  aiAnalysis?: {
    summary: string;
    suggestedProject?: string;
    suggestedCategory?: string;
    suggestedTags: string[];
    confidence: number;
  };
}

export class CaptureService {
  private processor: ContentProcessor;

  constructor() {
    this.processor = new ContentProcessor();
  }

  async capture(input: CaptureInput): Promise<CaptureResult> {
    const id = uuidv4();
    const now = new Date();

    // Detect content type (link, text, image reference, etc.)
    const contentType = detectContentType(input.content);

    // Extract metadata if it's a URL
    const parsedContent = await extractMetadata(input.content, contentType);

    // Parse user context for hints
    const hints = this.parseContextHints(input.context || '');

    // Merge explicit params with hints
    const project = input.project || hints.project;
    const category = input.category || hints.category;
    const tags = [...(input.tags || []), ...hints.tags];
    const priority = input.priority || hints.priority || 'normal';

    // Create the content item record
    const contentItem = {
      id,
      source: input.source,
      source_device: input.sourceDevice,
      source_metadata: input.sourceMetadata || {},
      content_type: contentType,
      raw_content: input.content,
      parsed_content: parsedContent,
      user_context: input.context,
      project_id: project,
      category_id: category,
      tags,
      priority,
      status: 'inbox' as const,
      created_at: now,
      updated_at: now
    };

    // Store in database
    await this.storeContentItem(contentItem);

    // Queue for AI processing (async)
    this.queueForProcessing(id);

    // If askQuestions is false (default), just return immediately
    // AI will process in background
    if (!input.askQuestions) {
      return {
        id,
        status: 'captured',
        contentType,
        project,
        category
      };
    }

    // If askQuestions is true, wait for AI analysis
    const aiAnalysis = await this.processor.analyze(contentItem);

    return {
      id,
      status: 'processing',
      contentType,
      project: aiAnalysis.suggestedProject,
      category: aiAnalysis.suggestedCategory,
      aiAnalysis
    };
  }

  /**
   * Parse user context for routing hints
   *
   * Supports formats:
   * - "for:projectname"
   * - "cat:categoryname" or "category:categoryname"
   * - "tags:tag1,tag2,tag3"
   * - "urgent" or "priority:high"
   */
  private parseContextHints(context: string): {
    project?: string;
    category?: string;
    tags: string[];
    priority?: 'low' | 'normal' | 'high' | 'urgent';
  } {
    const hints: {
      project?: string;
      category?: string;
      tags: string[];
      priority?: 'low' | 'normal' | 'high' | 'urgent';
    } = { tags: [] };

    if (!context) return hints;

    // Extract project hint
    const projectMatch = context.match(/(?:for:|project:)(\w+)/i);
    if (projectMatch) {
      hints.project = projectMatch[1].toLowerCase();
    }

    // Extract category hint
    const categoryMatch = context.match(/(?:cat:|category:)(\w+[\w-]*)/i);
    if (categoryMatch) {
      hints.category = categoryMatch[1].toLowerCase();
    }

    // Extract tags
    const tagsMatch = context.match(/tags?:([\w,]+)/i);
    if (tagsMatch) {
      hints.tags = tagsMatch[1].split(',').map(t => t.trim().toLowerCase());
    }

    // Extract priority
    if (/urgent/i.test(context)) {
      hints.priority = 'urgent';
    } else {
      const priorityMatch = context.match(/priority:(low|normal|high|urgent)/i);
      if (priorityMatch) {
        hints.priority = priorityMatch[1].toLowerCase() as any;
      }
    }

    return hints;
  }

  private async storeContentItem(item: any): Promise<void> {
    const query = `
      INSERT INTO content_items (
        id, source, source_device, source_metadata,
        content_type, raw_content, parsed_content,
        user_context, project_id, category_id, tags,
        priority, status, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
      )
    `;

    await db.query(query, [
      item.id,
      item.source,
      item.source_device,
      JSON.stringify(item.source_metadata),
      item.content_type,
      item.raw_content,
      JSON.stringify(item.parsed_content),
      item.user_context,
      item.project_id,
      item.category_id,
      item.tags,
      item.priority,
      item.status,
      item.created_at,
      item.updated_at
    ]);

    // Also write to file system for easy access
    await writeContentFile(item);
  }

  private async queueForProcessing(contentId: string): Promise<void> {
    const query = `
      INSERT INTO processing_queue (content_id, status, created_at)
      VALUES ($1, 'pending', NOW())
    `;

    await db.query(query, [contentId]);

    // Trigger async processing (fire and forget)
    this.processAsync(contentId).catch(err => {
      console.error(`Failed to process ${contentId}:`, err);
    });
  }

  private async processAsync(contentId: string): Promise<void> {
    try {
      // Update queue status
      await db.query(
        "UPDATE processing_queue SET status = 'processing', started_at = NOW() WHERE content_id = $1",
        [contentId]
      );

      // Get the content item
      const result = await db.query(
        'SELECT * FROM content_items WHERE id = $1',
        [contentId]
      );

      if (result.rows.length === 0) {
        throw new Error('Content item not found');
      }

      const item = result.rows[0];

      // Run AI analysis
      const analysis = await this.processor.analyze(item);

      // Update content item with analysis
      await db.query(
        `UPDATE content_items SET
          ai_analysis = $1,
          project_id = COALESCE(project_id, $2),
          category_id = COALESCE(category_id, $3),
          tags = CASE WHEN array_length(tags, 1) IS NULL THEN $4 ELSE tags END,
          status = 'categorized',
          processed_at = NOW(),
          updated_at = NOW()
        WHERE id = $5`,
        [
          JSON.stringify(analysis),
          analysis.suggestedProject,
          analysis.suggestedCategory || 'junk-drawer',
          analysis.suggestedTags,
          contentId
        ]
      );

      // Update queue
      await db.query(
        "UPDATE processing_queue SET status = 'completed', completed_at = NOW() WHERE content_id = $1",
        [contentId]
      );

      // Log the decision
      await db.query(
        `INSERT INTO ai_decisions (content_id, decision_type, output_data, confidence, model_used, created_at)
         VALUES ($1, 'categorize', $2, $3, $4, NOW())`,
        [contentId, JSON.stringify(analysis), analysis.confidence, 'claude-sonnet-4-20250514']
      );

      console.log(`✅ Processed ${contentId}: ${analysis.suggestedCategory || 'junk-drawer'}`);

    } catch (error) {
      console.error(`Failed to process ${contentId}:`, error);

      // Update queue with error
      await db.query(
        "UPDATE processing_queue SET status = 'failed', last_error = $1 WHERE content_id = $2",
        [(error as Error).message, contentId]
      );
    }
  }
}
