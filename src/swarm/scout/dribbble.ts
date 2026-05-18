// ============================================================
// Dribbble Scout Agent — Real Design Pattern Discovery
// ============================================================
//
// Searches Dribbble for design shots via the Dribbble API v2.
// Falls back to Playwright scraping, then to curated dataset.
// Downloads and processes images for real color extraction.
// Implements rate limiting to prevent API bans.
// ============================================================

import { type PatternSubmission } from '../../types.js';
import type { ScoutResult } from './index.js';
import { getPage, releasePage } from './browser.js';
import { createLogger_Scoped } from '../../logging/index.js';
import { downloadAndProcessImage } from '../../utils/image-pipeline.js';
import { config } from '../../config.js';
import { dribbbleLimiter, withRateLimit } from './rate-limiter.js';

const logger = createLogger_Scoped('scout:dribbble');
const DRIBBBLE_API_URL = 'https://api.dribbble.com/v2/shots';
const DRIBBBLE_SEARCH_URL = 'https://dribbble.com/search/';

export async function scoutDribbble(query: string): Promise<ScoutResult> {
  return withRateLimit(async () => {
    const start = Date.now();
    const errors: string[] = [];
    const submissions: PatternSubmission[] = [];

    // Try Dribbble API first if key is available
    if (config.dribbbleApiKey) {
    try {
      const apiResults = await searchDribbbleAPI(query);
      submissions.push(...apiResults);
      logger.info({ query, found: apiResults.length }, 'Dribbble API scout completed');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn({ query, error: message }, 'Dribbble API failed, trying scraping');
      errors.push(`Dribbble API failed: ${message}`);
    }
  }

  // Fallback to scraping if API didn't return results
  if (submissions.length === 0 && process.env.NODE_ENV !== 'test') {
    try {
      const page = await getPage();
      try {
        const searchUrl = `${DRIBBBLE_SEARCH_URL}?q=${encodeURIComponent(query + ' ui')}`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForSelector('article, [data-test-id="shot"]', { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(1500);

        const shots = await page.evaluate(() => {
          const results: Array<{ title: string; url: string; imageUrl: string; description: string }> = [];
          const seen = new Set<string>();
          const elements = Array.from(document.querySelectorAll('article, [data-test-id="shot"]'));

          for (const el of elements) {
            const link = el.querySelector('a[href*="/shots/"]') as HTMLAnchorElement | null;
            const img = el.querySelector('img[src]') as HTMLImageElement | null;
            if (!img) continue;

            const href = link?.href || '';
            const fullUrl = href.startsWith('/') ? `https://dribbble.com${href}` : href;
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

        for (const shot of shots) {
          if (!shot.imageUrl) continue;
          submissions.push({
            source: 'dribbble',
            url: shot.url || shot.imageUrl,
            title: shot.title || `Dribbble Shot — ${query}`,
            imageUrl: shot.imageUrl,
            description: shot.description || '',
            tags: [query.toLowerCase(), 'dribbble', 'design'],
          });
        }
      } finally {
        await releasePage(page);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn({ query, error: message }, 'Dribbble scraping failed');
      errors.push(`Dribbble scrape failed: ${message}`);
    }
  }

  // Final fallback to curated dataset
  if (submissions.length === 0) {
    submissions.push(...getFallbackDribbble(query));
    if (errors.length === 0) {
      errors.push('Dribbble API key not set (DRIBBBLE_API_KEY). Using built-in design library.');
    }
  }

  // Download images if enabled
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

  return { source: 'dribbble', submissions, errors, tookMs: Date.now() - start };
  }, dribbbleLimiter);
}

async function searchDribbbleAPI(query: string): Promise<PatternSubmission[]> {
  const url = `${DRIBBBLE_API_URL}?search=${encodeURIComponent(query)}&per_page=12&sort=recent`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${config.dribbbleApiKey}`,
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Dribbble API returned ${response.status}`);
  }

  const data = await response.json() as Array<{
    id: number;
    title: string;
    description: string;
    html_url: string;
    images: { normal: string; hidpi: string };
    tags: string[];
  }>;

  return data.map(shot => ({
    source: 'dribbble' as const,
    url: shot.html_url,
    title: shot.title || `Dribbble Shot ${shot.id}`,
    imageUrl: shot.images?.hidpi || shot.images?.normal || '',
    description: shot.description || '',
    tags: [...(shot.tags || []), 'dribbble', 'design'],
  }));
}

function getFallbackDribbble(query: string): PatternSubmission[] {
  const q = query.toLowerCase();
  const designs: PatternSubmission[] = [
    {
      source: 'dribbble', url: 'https://dribbble.com/shots/dashboard-002',
      title: 'E-commerce Dashboard', imageUrl: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800',
      description: 'Full admin panel with sales metrics, order list, and inventory management',
      tags: ['dashboard', 'ecommerce', 'admin', 'metrics'],
    },
    {
      source: 'dribbble', url: 'https://dribbble.com/shots/onboarding-001',
      title: 'Mobile Onboarding Flow', imageUrl: 'https://images.unsplash.com/photo-1616469829581-73993eb86b02?w=800',
      description: 'Smooth onboarding with illustrations, progress dots, and skip option',
      tags: ['onboarding', 'mobile', 'illustration', 'flow'],
    },
    {
      source: 'dribbble', url: 'https://dribbble.com/shots/card-001',
      title: 'Social Media Card UI', imageUrl: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=800',
      description: 'Content cards with avatars, interaction buttons, and image placeholders',
      tags: ['cards', 'social', 'feed', 'content'],
    },
    {
      source: 'dribbble', url: 'https://dribbble.com/shots/search-001',
      title: 'Advanced Search Interface', imageUrl: 'https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?w=800',
      description: 'Search page with filters, facets, autocomplete, and results grid',
      tags: ['search', 'filters', 'results', 'discovery'],
    },
    {
      source: 'dribbble', url: 'https://dribbble.com/shots/footer-001',
      title: 'Footer Design Patterns', imageUrl: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=800',
      description: 'Multi-column footer with newsletter signup, links, and social icons',
      tags: ['footer', 'navigation', 'links', 'newsletter'],
    },
  ];

  return designs
    .map(d => ({ design: d, score: (d.tags ?? []).filter(t => q.includes(t)).length }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(s => s.design);
}
