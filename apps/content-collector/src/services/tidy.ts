/**
 * Tidy Service
 *
 * AI-powered organization and cleanup
 */

import { db } from '../utils/database.js';
import { ContentProcessor } from '../processors/content.js';
import { moveContentFile } from '../utils/file-storage.js';

export class TidyService {
  private processor: ContentProcessor;

  constructor() {
    this.processor = new ContentProcessor();
  }

  /**
   * Start a tidy job
   */
  async startTidyJob(type: string): Promise<number> {
    // Create job record
    const result = await db.query(
      `INSERT INTO tidy_jobs (job_type, status, started_at)
       VALUES ($1, 'running', NOW())
       RETURNING id`,
      [type]
    );

    const jobId = result.rows[0].id;

    // Run tidy in background
    this.runTidy(jobId, type).catch(err => {
      console.error('Tidy job failed:', err);
      db.query(
        "UPDATE tidy_jobs SET status = 'failed', completed_at = NOW() WHERE id = $1",
        [jobId]
      );
    });

    return jobId;
  }

  /**
   * Run the tidy process
   */
  private async runTidy(jobId: number, type: string): Promise<void> {
    const stats = {
      items_processed: 0,
      items_categorized: 0,
      items_archived: 0,
      categories_created: 0,
      categories_merged: 0
    };

    try {
      // 1. Process junk drawer items
      const junkResult = await this.tidyJunkDrawer();
      stats.items_processed += junkResult.itemsProcessed;
      stats.items_categorized += junkResult.itemsCategorized;
      stats.categories_created += junkResult.categoriesCreated;

      // 2. Archive old completed items (if weekly/monthly)
      if (type === 'weekly' || type === 'monthly') {
        const archived = await this.archiveOldItems();
        stats.items_archived = archived;
      }

      // 3. Merge similar categories (if monthly)
      if (type === 'monthly') {
        const merged = await this.findAndMergeSimilarCategories();
        stats.categories_merged = merged;
      }

      // Update job record
      await db.query(
        `UPDATE tidy_jobs SET
          status = 'completed',
          items_processed = $1,
          items_categorized = $2,
          items_archived = $3,
          categories_created = $4,
          categories_merged = $5,
          completed_at = NOW()
        WHERE id = $6`,
        [
          stats.items_processed,
          stats.items_categorized,
          stats.items_archived,
          stats.categories_created,
          stats.categories_merged,
          jobId
        ]
      );

      console.log(`✅ Tidy job ${jobId} completed:`, stats);

    } catch (error) {
      await db.query(
        "UPDATE tidy_jobs SET status = 'failed', completed_at = NOW() WHERE id = $1",
        [jobId]
      );
      throw error;
    }
  }

  /**
   * Tidy the junk drawer
   */
  async tidyJunkDrawer(): Promise<{
    itemsProcessed: number;
    itemsCategorized: number;
    categoriesCreated: number;
  }> {
    const stats = {
      itemsProcessed: 0,
      itemsCategorized: 0,
      categoriesCreated: 0
    };

    // Analyze junk drawer
    const analysis = await this.processor.analyzeJunkDrawer();

    // Create suggested new categories
    for (const pattern of analysis.patterns) {
      if (pattern.suggestedCategory) {
        try {
          await db.query(
            `INSERT INTO categories (id, name, description, is_auto_created)
             VALUES ($1, $2, $3, true)
             ON CONFLICT (id) DO NOTHING`,
            [
              pattern.suggestedCategory.id,
              pattern.suggestedCategory.name,
              pattern.suggestedCategory.description
            ]
          );
          stats.categoriesCreated++;

          // Move items to new category
          for (const itemId of pattern.items) {
            await db.query(
              `UPDATE content_items
               SET category_id = $1, status = 'categorized', updated_at = NOW()
               WHERE id = $2`,
              [pattern.suggestedCategory.id, itemId]
            );
            stats.itemsCategorized++;
          }
        } catch (err) {
          console.error('Failed to create category:', err);
        }
      }
    }

    // Move items to existing categories
    for (const item of analysis.itemsToRecategorize) {
      if (item.confidence >= 0.7) {
        try {
          await db.query(
            `UPDATE content_items
             SET category_id = $1, status = 'categorized', updated_at = NOW()
             WHERE id = $2`,
            [item.newCategory, item.itemId]
          );
          stats.itemsCategorized++;
        } catch (err) {
          console.error('Failed to recategorize item:', err);
        }
      }
    }

    stats.itemsProcessed = analysis.patterns.reduce((sum, p) => sum + p.items.length, 0)
      + analysis.itemsToRecategorize.length;

    return stats;
  }

  /**
   * Archive old items that have been processed
   */
  async archiveOldItems(): Promise<number> {
    const result = await db.query(
      `UPDATE content_items
       SET status = 'archived', archived_at = NOW()
       WHERE status = 'categorized'
         AND updated_at < NOW() - INTERVAL '30 days'
       RETURNING id`
    );

    return result.rows.length;
  }

  /**
   * Find and merge similar categories
   */
  async findAndMergeSimilarCategories(): Promise<number> {
    // Get categories with low item counts that might be similar
    const result = await db.query(
      `SELECT id, name, description, item_count
       FROM categories
       WHERE item_count < 5
         AND is_auto_created = true
       ORDER BY created_at`
    );

    // TODO: Use AI to identify similar categories and merge them
    // For now, just return 0
    return 0;
  }

  /**
   * Preview what a tidy job would do
   */
  async previewTidy(): Promise<{
    junkDrawerItems: number;
    potentialRecategorizations: number;
    itemsToArchive: number;
    suggestedNewCategories: any[];
  }> {
    // Count junk drawer items
    const junkCount = await db.query(
      "SELECT COUNT(*) FROM content_items WHERE category_id = 'junk-drawer'"
    );

    // Count items ready for archive
    const archiveCount = await db.query(
      `SELECT COUNT(*) FROM content_items
       WHERE status = 'categorized'
         AND updated_at < NOW() - INTERVAL '30 days'`
    );

    // Get analysis preview
    const analysis = await this.processor.analyzeJunkDrawer();

    return {
      junkDrawerItems: parseInt(junkCount.rows[0].count),
      potentialRecategorizations: analysis.itemsToRecategorize.length,
      itemsToArchive: parseInt(archiveCount.rows[0].count),
      suggestedNewCategories: analysis.patterns.map(p => p.suggestedCategory).filter(Boolean)
    };
  }

  /**
   * Suggest new categories based on content patterns
   */
  async suggestNewCategories(): Promise<any[]> {
    const analysis = await this.processor.analyzeJunkDrawer();
    return analysis.patterns.map(p => ({
      ...p.suggestedCategory,
      itemCount: p.items.length,
      theme: p.theme
    })).filter(c => c.id);
  }
}
