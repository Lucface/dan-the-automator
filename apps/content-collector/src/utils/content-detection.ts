/**
 * Content Detection Utilities
 *
 * Detect content type and extract metadata
 */

import * as cheerio from 'cheerio';

/**
 * Detect the type of content from raw input
 */
export function detectContentType(content: string): string {
  // Check for URL
  const urlPattern = /^https?:\/\/[^\s]+$/i;
  if (urlPattern.test(content.trim())) {
    return detectUrlType(content.trim());
  }

  // Check for multiple URLs
  const urls = content.match(/https?:\/\/[^\s]+/gi);
  if (urls && urls.length > 1) {
    return 'mixed';
  }

  // Check for file reference
  if (content.startsWith('[FILE:') || content.includes('attachment:')) {
    return 'file';
  }

  // Check for image URL or base64
  if (/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(content)) {
    return 'image';
  }
  if (content.startsWith('data:image/')) {
    return 'image';
  }

  // Check for video URL
  if (/\.(mp4|webm|mov|avi)(\?|$)/i.test(content)) {
    return 'video';
  }

  // Check for code blocks
  if (content.includes('```') || /^(function|const|let|var|class|import|export)\s/m.test(content)) {
    return 'code';
  }

  // Default to text
  return 'text';
}

/**
 * Detect specific URL type
 */
function detectUrlType(url: string): string {
  const hostname = new URL(url).hostname.toLowerCase();

  // Video platforms
  if (/youtube\.com|youtu\.be|vimeo\.com|tiktok\.com/.test(hostname)) {
    return 'video';
  }

  // Image platforms
  if (/imgur\.com|giphy\.com|unsplash\.com|pexels\.com/.test(hostname)) {
    return 'image';
  }

  // Code platforms
  if (/github\.com|gitlab\.com|gist\.github\.com|codepen\.io|jsfiddle\.net/.test(hostname)) {
    return 'code';
  }

  // Design platforms
  if (/dribbble\.com|behance\.net|figma\.com/.test(hostname)) {
    return 'design';
  }

  // Generic link
  return 'link';
}

/**
 * Extract metadata from content
 */
export async function extractMetadata(content: string, contentType: string): Promise<Record<string, any>> {
  const metadata: Record<string, any> = {};

  // If it's a URL, try to fetch metadata
  const urlMatch = content.match(/https?:\/\/[^\s]+/);
  if (urlMatch) {
    metadata.url = urlMatch[0];

    try {
      // For now, extract what we can from the URL itself
      const url = new URL(metadata.url);
      metadata.domain = url.hostname;
      metadata.path = url.pathname;

      // Special handling for known platforms
      if (url.hostname.includes('youtube.com')) {
        const videoId = url.searchParams.get('v');
        if (videoId) {
          metadata.youtube_id = videoId;
          metadata.thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        }
      }

      if (url.hostname.includes('github.com')) {
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts.length >= 2) {
          metadata.github_owner = parts[0];
          metadata.github_repo = parts[1];
          if (parts[2] === 'issues' && parts[3]) {
            metadata.github_issue = parts[3];
          }
          if (parts[2] === 'pull' && parts[3]) {
            metadata.github_pr = parts[3];
          }
        }
      }

      // TODO: Fetch actual page metadata (title, description, og tags)
      // This would require an HTTP fetch which we'll do asynchronously

    } catch (e) {
      // Invalid URL, ignore
    }
  }

  // Extract any text content (excluding URLs)
  const textContent = content.replace(/https?:\/\/[^\s]+/g, '').trim();
  if (textContent) {
    metadata.text = textContent;

    // Extract any hashtags
    const hashtags = textContent.match(/#\w+/g);
    if (hashtags) {
      metadata.hashtags = hashtags.map(t => t.substring(1).toLowerCase());
    }

    // Extract any @mentions
    const mentions = textContent.match(/@\w+/g);
    if (mentions) {
      metadata.mentions = mentions.map(m => m.substring(1));
    }
  }

  return metadata;
}

/**
 * Parse HTML page and extract metadata
 */
export async function fetchPageMetadata(url: string): Promise<Record<string, any>> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ContentCollector/1.0'
      }
    });

    if (!response.ok) {
      return {};
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    return {
      title: $('title').text() || $('meta[property="og:title"]').attr('content'),
      description: $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content'),
      image: $('meta[property="og:image"]').attr('content'),
      type: $('meta[property="og:type"]').attr('content'),
      siteName: $('meta[property="og:site_name"]').attr('content'),
      author: $('meta[name="author"]').attr('content')
    };

  } catch (error) {
    console.error('Failed to fetch page metadata:', error);
    return {};
  }
}
