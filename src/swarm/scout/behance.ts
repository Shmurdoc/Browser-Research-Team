// ============================================================
// Behance Scout Agent — Real Design Pattern Discovery
// ============================================================
//
// Searches Behance for design projects using the Behance API.
// Falls back to Playwright scraping, then to curated dataset.
// Downloads and processes project images for color extraction.
// Implements rate limiting to prevent API bans.
// ============================================================

import { type PatternSubmission } from '../../types.js';
import type { ScoutResult } from './index.js';
import { getPage, releasePage } from './browser.js';
import { createLogger_Scoped } from '../../logging/index.js';
import { downloadAndProcessImage } from '../../utils/image-pipeline.js';
import { config } from '../../config.js';
import { behanceLimiter, withRateLimit } from './rate-limiter.js';

const logger = createLogger_Scoped('scout:behance');
const BEHANCE_API_URL = 'https://api.behance.net/v2/projects';
const BEHANCE_SEARCH_URL = 'https://www.behance.net/search/projects';

export async function scoutBehance(query: string): Promise<ScoutResult> {
  return withRateLimit(async () => {
    const start = Date.now();
    const errors: string[] = [];
    const submissions: PatternSubmission[] = [];

    // Try Behance API first
    if (config.behanceApiKey) {
      try {
        const apiResults = await searchBehanceAPI(query);
        submissions.push(...apiResults);
        logger.info({ query, found: apiResults.length }, 'Behance API scout completed');
      } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn({ query, error: message }, 'Behance API failed, trying scraping');
      errors.push(`Behance API failed: ${message}`);
    }
  }

  // Fallback to scraping
  if (submissions.length === 0 && process.env.NODE_ENV !== 'test') {
    try {
      const page = await getPage();
      try {
        const searchUrl = `${BEHANCE_SEARCH_URL}?search=${encodeURIComponent(query + ' ui design')}`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForSelector('[class*="ProjectCard"], article', { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(1500);

        const projects = await page.evaluate(() => {
          const results: Array<{ title: string; url: string; imageUrl: string; description: string }> = [];
          const seen = new Set<string>();
          const elements = Array.from(document.querySelectorAll('[class*="ProjectCard"], article'));

          for (const el of elements) {
            const link = el.querySelector('a[href*="/projects/"]') as HTMLAnchorElement | null;
            const img = el.querySelector('img[src]') as HTMLImageElement | null;
            if (!img) continue;

            const href = link?.href || '';
            const fullUrl = href.startsWith('/') ? `https://www.behance.net${href}` : href;
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

        for (const proj of projects) {
          if (!proj.imageUrl) continue;
          submissions.push({
            source: 'behance',
            url: proj.url || proj.imageUrl,
            title: proj.title || `Behance Project — ${query}`,
            imageUrl: proj.imageUrl,
            description: proj.description || '',
            tags: [query.toLowerCase(), 'behance', 'design'],
          });
        }
      } finally {
        await releasePage(page);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn({ query, error: message }, 'Behance scraping failed');
      errors.push(`Behance scrape failed: ${message}`);
    }
  }

  // Final fallback
  if (submissions.length === 0) {
    submissions.push(...getFallbackBehance(query));
    if (errors.length === 0) {
      errors.push('Behance API key not set (BEHANCE_API_KEY). Using built-in design library.');
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

  return { source: 'behance', submissions, errors, tookMs: Date.now() - start };
  }, behanceLimiter);
}

async function searchBehanceAPI(query: string): Promise<PatternSubmission[]> {
  const url = `${BEHANCE_API_URL}?q=${encodeURIComponent(query)}&sort=featured_date&time=month&per_page=12`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${config.behanceApiKey}`,
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Behance API returned ${response.status}`);
  }

  const data = await response.json() as { projects: Array<{
    id: number;
    name: string;
    description: string;
    url: string;
    covers: Record<string, string>;
    tags: string[];
  }>};

  return (data.projects || []).map(proj => ({
    source: 'behance' as const,
    url: proj.url,
    title: proj.name || `Behance Project ${proj.id}`,
    imageUrl: proj.covers?.['404'] || proj.covers?.['202'] || '',
    description: proj.description || '',
    tags: [...(proj.tags || []), 'behance', 'design'],
  }));
}

function getFallbackBehance(query: string): PatternSubmission[] {
  const q = query.toLowerCase();
  const designs: PatternSubmission[] = [
    {
      source: 'behance', url: 'https://behance.net/gallery/design-system-001',
      title: 'Enterprise Design System', imageUrl: 'https://images.unsplash.com/photo-1558655146-9f40138ed1cb?w=800',
      description: 'Complete design system with component library, tokens, and usage guidelines',
      tags: ['design-system', 'enterprise', 'components', 'tokens'],
    },
    {
      source: 'behance', url: 'https://behance.net/gallery/portfolio-001',
      title: 'Creative Portfolio Layout', imageUrl: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=800',
      description: 'Minimal portfolio with grid gallery, project cards, and smooth transitions',
      tags: ['portfolio', 'creative', 'grid', 'minimal'],
    },
    {
      source: 'behance', url: 'https://behance.net/gallery/auth-001',
      title: 'Auth Pages Exploration', imageUrl: 'https://images.unsplash.com/photo-1611746872915-64382b5c76da?w=800',
      description: 'Login, signup, password reset, and MFA verification screens',
      tags: ['authentication', 'login', 'signup', 'security'],
    },
    {
      source: 'behance', url: 'https://behance.net/gallery/email-001',
      title: 'Email Campaign Templates', imageUrl: 'https://images.unsplash.com/photo-1563986768494-4dee2763ff3f?w=800',
      description: 'Responsive email templates for newsletters, notifications, and marketing',
      tags: ['email', 'newsletter', 'responsive', 'marketing'],
    },
  ];

  return designs
    .map(d => ({ design: d, score: (d.tags ?? []).filter(t => q.includes(t)).length }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(s => s.design);
}
