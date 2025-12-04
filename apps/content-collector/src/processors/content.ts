/**
 * Content Processor
 *
 * AI-powered content analysis and categorization
 */

import Anthropic from '@anthropic-ai/sdk';
import { db } from '../utils/database.js';

export interface ContentAnalysis {
  summary: string;
  detectedType: string;
  suggestedProject?: string;
  suggestedCategory?: string;
  suggestedTags: string[];
  confidence: number;
  reasoning: string;
  shouldCreateCategory?: {
    id: string;
    name: string;
    description: string;
  };
}

export class ContentProcessor {
  private client: Anthropic;
  private model = 'claude-sonnet-4-20250514';

  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }

  async analyze(contentItem: any): Promise<ContentAnalysis> {
    // Get available projects and categories for context
    const [projects, categories] = await Promise.all([
      this.getProjects(),
      this.getCategories()
    ]);

    const prompt = this.buildAnalysisPrompt(contentItem, projects, categories);

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      return this.parseAnalysisResponse(content.text);

    } catch (error) {
      console.error('AI analysis failed:', error);

      // Return a safe default
      return {
        summary: 'Unable to analyze content',
        detectedType: contentItem.content_type,
        suggestedCategory: 'junk-drawer',
        suggestedTags: [],
        confidence: 0,
        reasoning: 'AI analysis failed, defaulting to junk drawer'
      };
    }
  }

  private buildAnalysisPrompt(item: any, projects: any[], categories: any[]): string {
    const projectList = projects.map(p =>
      `- ${p.id}: ${p.name} (keywords: ${p.keywords?.join(', ') || 'none'})`
    ).join('\n');

    const categoryList = categories.map(c =>
      `- ${c.id}: ${c.name} - ${c.description || 'no description'}`
    ).join('\n');

    return `You are a content organizer AI. Analyze the following captured content and determine how to categorize it.

## Content to Analyze

**Type:** ${item.content_type}
**Raw Content:**
${item.raw_content}

**Parsed Metadata:**
${JSON.stringify(item.parsed_content, null, 2)}

**User Context (if provided):**
${item.user_context || 'No context provided'}

## Available Projects (for routing specific project ideas)
${projectList}

## Available Categories
${categoryList}

## Your Task

Analyze this content and provide:
1. A brief summary (1-2 sentences)
2. Which project it might belong to (if any)
3. Which category it should go in
4. Suggested tags
5. Your confidence level (0-1)
6. Brief reasoning

If this content doesn't fit any existing category well and represents a pattern you think will recur, suggest creating a new category.

Respond in this exact JSON format:
{
  "summary": "Brief description of what this content is",
  "detectedType": "more specific type if applicable",
  "suggestedProject": "project-id or null",
  "suggestedCategory": "category-id",
  "suggestedTags": ["tag1", "tag2"],
  "confidence": 0.85,
  "reasoning": "Why I chose this categorization",
  "shouldCreateCategory": null or {
    "id": "new-category-slug",
    "name": "New Category Name",
    "description": "What this category is for"
  }
}

Important guidelines:
- Default to "junk-drawer" if truly unsure (confidence < 0.5)
- Only suggest project routing if clearly relevant
- Keep tags concise and lowercase
- Be conservative with new category creation
- User context should heavily influence your decision`;
  }

  private parseAnalysisResponse(text: string): ContentAnalysis {
    // Try to extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      summary: parsed.summary || 'No summary',
      detectedType: parsed.detectedType || 'unknown',
      suggestedProject: parsed.suggestedProject || undefined,
      suggestedCategory: parsed.suggestedCategory || 'junk-drawer',
      suggestedTags: parsed.suggestedTags || [],
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      reasoning: parsed.reasoning || 'No reasoning provided',
      shouldCreateCategory: parsed.shouldCreateCategory || undefined
    };
  }

  private async getProjects(): Promise<any[]> {
    const result = await db.query(
      'SELECT id, name, description, keywords FROM projects WHERE active = true'
    );
    return result.rows;
  }

  private async getCategories(): Promise<any[]> {
    const result = await db.query(
      'SELECT id, name, description FROM categories ORDER BY item_count DESC'
    );
    return result.rows;
  }

  /**
   * Batch process multiple items (for tidy jobs)
   */
  async batchAnalyze(items: any[]): Promise<Map<string, ContentAnalysis>> {
    const results = new Map<string, ContentAnalysis>();

    // Process in parallel with concurrency limit
    const concurrency = 3;
    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      const analyses = await Promise.all(
        batch.map(item => this.analyze(item).then(a => ({ id: item.id, analysis: a })))
      );

      for (const { id, analysis } of analyses) {
        results.set(id, analysis);
      }
    }

    return results;
  }

  /**
   * Analyze junk drawer to find patterns and suggest categories
   */
  async analyzeJunkDrawer(): Promise<{
    patterns: Array<{
      theme: string;
      items: string[];
      suggestedCategory: {
        id: string;
        name: string;
        description: string;
      };
    }>;
    itemsToRecategorize: Array<{
      itemId: string;
      newCategory: string;
      confidence: number;
    }>;
  }> {
    // Get items from junk drawer
    const result = await db.query(
      `SELECT id, raw_content, parsed_content, user_context, ai_analysis
       FROM content_items
       WHERE category_id = 'junk-drawer'
       ORDER BY created_at DESC
       LIMIT 50`
    );

    if (result.rows.length < 3) {
      return { patterns: [], itemsToRecategorize: [] };
    }

    const items = result.rows;
    const categories = await this.getCategories();

    const prompt = `You are organizing a digital junk drawer. Analyze these uncategorized items and find patterns.

## Items in Junk Drawer
${items.map((item, i) => `
${i + 1}. [ID: ${item.id}]
   Content: ${item.raw_content.substring(0, 200)}...
   Context: ${item.user_context || 'none'}
   Previous AI Summary: ${item.ai_analysis?.summary || 'none'}
`).join('\n')}

## Existing Categories
${categories.map(c => `- ${c.id}: ${c.name}`).join('\n')}

## Your Task

1. Find patterns/themes among these items
2. Suggest new categories for recurring themes (at least 3 similar items)
3. Identify items that could now fit existing categories

Respond in JSON:
{
  "patterns": [
    {
      "theme": "Description of the pattern",
      "items": ["id1", "id2", "id3"],
      "suggestedCategory": {
        "id": "category-slug",
        "name": "Category Name",
        "description": "What this category is for"
      }
    }
  ],
  "itemsToRecategorize": [
    {
      "itemId": "uuid",
      "newCategory": "existing-category-id",
      "confidence": 0.8
    }
  ]
}`;

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }]
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON in response');
      }

      return JSON.parse(jsonMatch[0]);

    } catch (error) {
      console.error('Junk drawer analysis failed:', error);
      return { patterns: [], itemsToRecategorize: [] };
    }
  }
}
