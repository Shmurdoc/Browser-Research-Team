// ============================================================
// Figma Scout Agent — Design System Pattern Discovery
// ============================================================
//
// Searches Figma Community for design systems and components
// via the Figma REST API. Falls back to curated dataset.
// Downloads and processes component images for color extraction.
// Implements rate limiting to prevent API bans.
// ============================================================

import { type PatternSubmission } from '../../types.js';
import type { ScoutResult } from './index.js';
import { getPage, releasePage } from './browser.js';
import { createLogger_Scoped } from '../../logging/index.js';
import { downloadAndProcessImage } from '../../utils/image-pipeline.js';
import { config } from '../../config.js';
import { figmaLimiter, withRateLimit } from './rate-limiter.js';

const logger = createLogger_Scoped('scout:figma');
const FIGMA_API_URL = 'https://api.figma.com/v1/files/recent';
const FIGMA_SEARCH_URL = 'https://www.figma.com/community/search';

export async function scoutFigma(query: string): Promise<ScoutResult> {
  return withRateLimit(async () => {
    const start = Date.now();
    const errors: string[] = [];
    const submissions: PatternSubmission[] = [];

    // Try Figma API first (most reliable)
    if (config.figmaAccessToken) {
      try {
        const apiResults = await searchFigmaAPI(query);
        submissions.push(...apiResults);
        logger.info({ query, found: apiResults.length }, 'Figma API scout completed');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn({ query, error: message }, 'Figma API failed, trying scraping');
        errors.push(`Figma API failed: ${message}`);
      }
    }

    // Fallback to scraping
    if (submissions.length === 0 && process.env.NODE_ENV !== 'test') {
    try {
      const page = await getPage();
      try {
        const searchUrl = `${FIGMA_SEARCH_URL}?query=${encodeURIComponent(query)}&sort_by=relevancy&content_type=files`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForSelector('[data-testid="file-card"], article', { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(1500);

        const files = await page.evaluate(() => {
          const results: Array<{ title: string; url: string; imageUrl: string; description: string }> = [];
          const seen = new Set<string>();
          const elements = Array.from(document.querySelectorAll('[data-testid="file-card"], article'));

          for (const el of elements) {
            const link = el.querySelector('a[href*="/community/file/"]') as HTMLAnchorElement | null;
            const img = el.querySelector('img[src]') as HTMLImageElement | null;
            if (!img) continue;

            const href = link?.href || '';
            const fullUrl = href.startsWith('/') ? `https://www.figma.com${href}` : href;
            const key = fullUrl || img.src;
            if (seen.has(key) || !key) continue;
            seen.add(key);

            results.push({
              title: img.alt || el.querySelector('h3')?.textContent?.trim() || '',
              url: fullUrl,
              imageUrl: img.src,
              description: '',
            });

            if (results.length >= 10) break;
          }
          return results;
        });

        for (const file of files) {
          if (!file.imageUrl) continue;
          submissions.push({
            source: 'figma-community',
            url: file.url || file.imageUrl,
            title: file.title || `Figma Community — ${query}`,
            imageUrl: file.imageUrl,
            description: file.description || '',
            tags: [query.toLowerCase(), 'figma', 'design'],
          });
        }
      } finally {
        await releasePage(page);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn({ query, error: message }, 'Figma scraping failed');
      errors.push(`Figma scrape failed: ${message}`);
    }
  }

  // Final fallback
  if (submissions.length === 0) {
    submissions.push(...getFallbackFigma(query));
    if (errors.length === 0) {
      errors.push('Figma access token not set (FIGMA_ACCESS_TOKEN). Using built-in design library.');
    }
  }

  // Download images
  if (config.enableImageDownload) {
    for (const sub of submissions) {
      if (sub.imageUrl && sub.imageUrl.startsWith('http')) {
        const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const result = await downloadAndProcessImage(sub.imageUrl, tempId);
        if (result) {
          sub.imageUrl = result.localPath;
          sub.imageHash = result.hash;
        }
      }
    }
  }

  return { source: 'figma-community', submissions, errors, tookMs: Date.now() - start };
  }, figmaLimiter);
}

async function searchFigmaAPI(query: string): Promise<PatternSubmission[]> {
  const url = `${FIGMA_API_URL}?query=${encodeURIComponent(query)}&page_size=12`;
  const response = await fetch(url, {
    headers: {
      'X-Figma-Token': config.figmaAccessToken!,
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Figma API returned ${response.status}`);
  }

  const data = await response.json() as { items: Array<{
    id: string;
    name: string;
    description: string;
    thumbnail_url: string;
    tags: string[];
  }>};

  return (data.items || []).map(item => ({
    source: 'figma-community' as const,
    url: `https://figma.com/community/file/${item.id}`,
    title: item.name || `Figma File ${item.id}`,
    imageUrl: item.thumbnail_url || '',
    description: item.description || '',
    tags: [...(item.tags || []), 'figma', 'design'],
  }));
}

function getFallbackFigma(query: string): PatternSubmission[] {
  const q = query.toLowerCase();
  const designs: PatternSubmission[] = [
    {
      source: 'figma-community', url: 'https://figma.com/community/file/component-lib',
      title: 'UI Component Library', imageUrl: 'https://images.unsplash.com/photo-1558655146-9f40138ed1cb?w=800',
      description: 'Comprehensive component library with auto-layout variants and themes',
      tags: ['components', 'library', 'auto-layout', 'variants'],
    },
    {
      source: 'figma-community', url: 'https://figma.com/community/file/wireframe-kit',
      title: 'Wireframe Starter Kit', imageUrl: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=800',
      description: 'Low-fidelity wireframe kit for rapid prototyping and ideation',
      tags: ['wireframe', 'prototyping', 'lo-fi', 'kit'],
    },
    {
      source: 'figma-community', url: 'https://figma.com/community/file/icon-set',
      title: 'Minimal Icon Set (1000+)', imageUrl: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800',
      description: 'Large icon set with outlined and filled variants for UI design',
      tags: ['icons', 'minimal', 'ui', 'design-system'],
    },
  ];

  return designs
    .map(d => ({ design: d, score: (d.tags ?? []).filter(t => q.includes(t)).length }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(s => s.design);
}
