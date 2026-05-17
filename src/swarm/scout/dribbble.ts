// ============================================================
// Dribbble Scout Agent — Real Design Pattern Discovery
// ============================================================
//
// Searches Dribbble for design shots using Playwright.
// Extracts shots with titles, image URLs, descriptions, and links.
// Falls back to heuristic mock data if scraping fails.
// ============================================================

import { type PatternSubmission } from '../../types.js';
import type { ScoutResult } from './index.js';
import { getPage, releasePage } from './browser.js';
import { createLogger_Scoped } from '../../logging/index.js';

const logger = createLogger_Scoped('scout:dribbble');
const DRIBBBLE_SEARCH_URL = 'https://dribbble.com/search/';

export async function scoutDribbble(query: string): Promise<ScoutResult> {
  const start = Date.now();
  const errors: string[] = [];
  const submissions: PatternSubmission[] = [];

  // Skip Playwright in test environment
  if (process.env.NODE_ENV !== 'test') {
    try {
      const page = await getPage();

    try {
      const searchUrl = `${DRIBBBLE_SEARCH_URL}?q=${encodeURIComponent(query + ' ui')}`;
      logger.debug({ url: searchUrl }, 'Navigating to Dribbble search');

      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

      await page.waitForSelector(
        'article, [data-test-id="shot"], .shot-thumbnail, [class*="ShotCard"]',
        { timeout: 8000 }
      ).catch(() => { /* shots may already be rendered */ });

      await page.waitForTimeout(1500);

      const shots = await page.evaluate(() => {
        const results: Array<{ title: string; url: string; imageUrl: string; description: string }> = [];
        const seen = new Set<string>();

        const selectors = [
          'article',
          '[data-test-id="shot"]',
          '.shot-thumbnail',
          '[class*="ShotCard"]',
          'li[class*="shot"]',
        ];

        const allElements = new Set<Element>();
        for (const sel of selectors) {
          document.querySelectorAll(sel).forEach(el => allElements.add(el));
        }

        for (const el of allElements) {
          const link = el.querySelector('a[href*="/shots/"]') as HTMLAnchorElement | null;
          const img = el.querySelector('img[src]') as HTMLImageElement | null;
          const titleEl = el.querySelector('[class*="title"], h2, h3') as HTMLElement | null;

          if (!img) continue;

          const href = link?.href || '';
          const fullUrl = href.startsWith('/') ? `https://dribbble.com${href}` : href;
          const key = fullUrl || img.src;
          if (seen.has(key) || !key) continue;
          seen.add(key);

          results.push({
            title: titleEl?.textContent?.trim() || '',
            url: fullUrl,
            imageUrl: img.src || img.getAttribute('data-src') || '',
            description: el.querySelector('[class*="description"]')?.textContent?.trim() || '',
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

      logger.info({ query, found: submissions.length }, 'Dribbble scout completed');
    } finally {
      await releasePage(page);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ query, error: message }, 'Dribbble scrape failed, using fallback');
    errors.push(`Dribbble scrape failed: ${message}`);
  }
  } // end of NODE_ENV check

  if (submissions.length === 0) {
    submissions.push(...getFallbackDribbble(query));
    if (errors.length === 0) {
      errors.push('Dribbble scrape unavailable. Using built-in design library.');
    }
  }

  return { source: 'dribbble', submissions, errors, tookMs: Date.now() - start };
}

function getFallbackDribbble(query: string): PatternSubmission[] {
  const q = query.toLowerCase();
  const designs: PatternSubmission[] = [
    {
      source: 'dribbble', url: 'https://dribbble.com/shots/dashboard-002',
      title: 'E-commerce Dashboard', imageUrl: '',
      description: 'Full admin panel with sales metrics, order list, and inventory management',
      tags: ['dashboard', 'ecommerce', 'admin', 'metrics'],
    },
    {
      source: 'dribbble', url: 'https://dribbble.com/shots/onboarding-001',
      title: 'Mobile Onboarding Flow', imageUrl: '',
      description: 'Smooth onboarding with illustrations, progress dots, and skip option',
      tags: ['onboarding', 'mobile', 'illustration', 'flow'],
    },
    {
      source: 'dribbble', url: 'https://dribbble.com/shots/card-001',
      title: 'Social Media Card UI', imageUrl: '',
      description: 'Content cards with avatars, interaction buttons, and image placeholders',
      tags: ['cards', 'social', 'feed', 'content'],
    },
    {
      source: 'dribbble', url: 'https://dribbble.com/shots/search-001',
      title: 'Advanced Search Interface', imageUrl: '',
      description: 'Search page with filters, facets, autocomplete, and results grid',
      tags: ['search', 'filters', 'results', 'discovery'],
    },
    {
      source: 'dribbble', url: 'https://dribbble.com/shots/footer-001',
      title: 'Footer Design Patterns', imageUrl: '',
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
