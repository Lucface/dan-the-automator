/**
 * File Storage Utilities
 *
 * Store content items as Markdown files for easy access
 */

import { promises as fs } from 'fs';
import path from 'path';
import matter from 'gray-matter';

const STORAGE_PATH = process.env.STORAGE_PATH || './content';

/**
 * Write a content item to the file system as Markdown
 */
export async function writeContentFile(item: any): Promise<string> {
  // Determine the directory based on categorization
  let dir: string;

  if (item.project_id) {
    dir = path.join(STORAGE_PATH, 'projects', item.project_id);
  } else if (item.category_id && item.category_id !== 'junk-drawer') {
    dir = path.join(STORAGE_PATH, 'categories', item.category_id);
  } else {
    // Junk drawer, organized by month
    const date = new Date(item.created_at);
    const monthDir = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    dir = path.join(STORAGE_PATH, 'junk-drawer', monthDir);
  }

  // Ensure directory exists
  await fs.mkdir(dir, { recursive: true });

  // Generate filename from content
  const filename = generateFilename(item);
  const filepath = path.join(dir, `${filename}.md`);

  // Create Markdown content with frontmatter
  const frontmatter = {
    id: item.id,
    created: item.created_at,
    source: item.source,
    type: item.content_type,
    tags: item.tags || [],
    project: item.project_id,
    category: item.category_id,
    status: item.status
  };

  // Remove undefined values
  Object.keys(frontmatter).forEach(key => {
    if (frontmatter[key as keyof typeof frontmatter] === undefined) {
      delete frontmatter[key as keyof typeof frontmatter];
    }
  });

  // Build the markdown body
  let body = '';

  // Title from parsed content or generated
  const title = item.parsed_content?.title || generateTitle(item);
  body += `# ${title}\n\n`;

  // User context
  if (item.user_context) {
    body += `> ${item.user_context}\n\n`;
  }

  // Main content
  if (item.parsed_content?.url) {
    body += `**Link:** ${item.parsed_content.url}\n\n`;
  }

  if (item.parsed_content?.description) {
    body += `${item.parsed_content.description}\n\n`;
  }

  if (item.content_type === 'text' || item.content_type === 'code') {
    if (item.content_type === 'code') {
      body += '```\n' + item.raw_content + '\n```\n\n';
    } else {
      body += item.raw_content + '\n\n';
    }
  }

  // AI Analysis
  if (item.ai_analysis?.summary) {
    body += `---\n\n## AI Analysis\n\n`;
    body += `**Summary:** ${item.ai_analysis.summary}\n\n`;
    if (item.ai_analysis.reasoning) {
      body += `**Reasoning:** ${item.ai_analysis.reasoning}\n\n`;
    }
  }

  // Combine frontmatter and body
  const fileContent = matter.stringify(body, frontmatter);

  // Write file
  await fs.writeFile(filepath, fileContent);

  return filepath;
}

/**
 * Generate a filename from content
 */
function generateFilename(item: any): string {
  const date = new Date(item.created_at);
  const dateStr = date.toISOString().slice(0, 10);

  // Try to get a meaningful name
  let name = '';

  if (item.parsed_content?.title) {
    name = slugify(item.parsed_content.title);
  } else if (item.parsed_content?.domain) {
    name = slugify(item.parsed_content.domain);
  } else if (item.content_type === 'text' && item.raw_content) {
    // First few words
    name = slugify(item.raw_content.slice(0, 50));
  } else {
    name = item.id.slice(0, 8);
  }

  // Limit length and combine with date
  name = name.slice(0, 50);

  return `${dateStr}-${name}`;
}

/**
 * Generate a title from content
 */
function generateTitle(item: any): string {
  if (item.parsed_content?.title) {
    return item.parsed_content.title;
  }

  if (item.parsed_content?.domain) {
    return `Link from ${item.parsed_content.domain}`;
  }

  if (item.content_type === 'text' && item.raw_content) {
    const firstLine = item.raw_content.split('\n')[0];
    if (firstLine.length <= 100) {
      return firstLine;
    }
    return firstLine.slice(0, 100) + '...';
  }

  return `Captured ${item.content_type}`;
}

/**
 * Convert text to URL-safe slug
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

/**
 * Read a content file and parse it
 */
export async function readContentFile(filepath: string): Promise<any> {
  const content = await fs.readFile(filepath, 'utf-8');
  const { data, content: body } = matter(content);

  return {
    ...data,
    body
  };
}

/**
 * List all content files in a directory
 */
export async function listContentFiles(directory: string): Promise<string[]> {
  const dir = path.join(STORAGE_PATH, directory);

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true, recursive: true });

    return entries
      .filter(e => e.isFile() && e.name.endsWith('.md'))
      .map(e => path.join(e.parentPath || e.path, e.name));

  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Move a content file to a new location
 */
export async function moveContentFile(
  itemId: string,
  fromPath: string,
  newProject?: string,
  newCategory?: string
): Promise<string> {
  // Determine new directory
  let newDir: string;

  if (newProject) {
    newDir = path.join(STORAGE_PATH, 'projects', newProject);
  } else if (newCategory && newCategory !== 'junk-drawer') {
    newDir = path.join(STORAGE_PATH, 'categories', newCategory);
  } else {
    const now = new Date();
    const monthDir = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    newDir = path.join(STORAGE_PATH, 'junk-drawer', monthDir);
  }

  await fs.mkdir(newDir, { recursive: true });

  const filename = path.basename(fromPath);
  const newPath = path.join(newDir, filename);

  await fs.rename(fromPath, newPath);

  return newPath;
}
