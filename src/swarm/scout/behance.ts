// ============================================================
// Behance Scout Agent — Real Design Pattern Discovery
// ============================================================
//
// Searches Behance for design projects using Playwright.
// Extracts projects with titles, image URLs, descriptions, and links.
// Falls back to heuristic mock data if scraping fails.
// ============================================================

import { type PatternSubmission } from '../../types.js';
import type { ScoutResult } from './index.js';
import { getPage, releasePage } from './browser.js';
import { createLogger_Scoped } from '../../logging/index.js';

const logger = createLogger_Scoped('scout:behance');
const BEHANCE_SEARCH_URL = 'https://www.behance.net/search/projects';

export async function scoutBehance(query: string): Promise<ScoutResult> {
  const start = Date.now();
  const errors: string[] = [];
  const submissions: PatternSubmission[] = [];

  // Skip Playwright in test environment
  if (process.env.NODE_ENV !== 'test') {
    try {
      const page = await getPage();

    try {
      const searchUrl = `${BEHANCE_SEARCH_URL}?search=${encodeURIComponent(query + ' ui design')}`;
      logger.debug({ url: searchUrl }, 'Navigating to Behance search');

      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

      await page.waitForSelector(
        '[class*="ProjectCard"], article, .ProjectCoverNeue',
        { timeout: 8000 }
      ).catch(() => { /* projects may already be rendered */ });

      await page.waitForTimeout(1500);

      const projects = await page.evaluate(() => {
        const results: Array<{ title: string; url: string; imageUrl: string; description: string }> = [];
        const seen = new Set<string>();

        const selectors = [
          '[class*="ProjectCard"]',
          'article',
          '.ProjectCoverNeue',
          '[data-testid="project-card"]',
        ];

        const allElements = new Set<Element>();
        for (const sel of selectors) {
          document.querySelectorAll(sel).forEach(el => allElements.add(el));
        }

        for (const el of allElements) {
          const link = el.querySelector('a[href*="/projects/"]') as HTMLAnchorElement | null;
          const img = el.querySelector('img[src]') as HTMLImageElement | null;
          const titleEl = el.querySelector('[class*="title"], h2, h3') as HTMLElement | null;

          if (!img) continue;

          const href = link?.href || '';
          const fullUrl = href.startsWith('/') ? `https://www.behance.net${href}` : href;
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

      logger.info({ query, found: submissions.length }, 'Behance scout completed');
    } finally {
      await releasePage(page);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ query, error: message }, 'Behance scrape failed, using fallback');
    errors.push(`Behance scrape failed: ${message}`);
  }
  } // end of NODE_ENV check

  if (submissions.length === 0) {
    submissions.push(...getFallbackBehance(query));
    if (errors.length === 0) {
      errors.push('Behance scrape unavailable. Using built-in design library.');
    }
  }

  return { source: 'behance', submissions, errors, tookMs: Date.now() - start };
}

function getFallbackBehance(query: string): PatternSubmission[] {
  const q = query.toLowerCase();
  const designs: PatternSubmission[] = [
    {
      source: 'behance', url: 'https://behance.net/gallery/design-system-001',
      title: 'Enterprise Design System', imageUrl: '',
      description: 'Complete design system with component library, tokens, and usage guidelines',
      tags: ['design-system', 'enterprise', 'components', 'tokens'],
    },
    {
      source: 'behance', url: 'https://behance.net/gallery/portfolio-001',
      title: 'Creative Portfolio Layout', imageUrl: '',
      description: 'Minimal portfolio with grid gallery, project cards, and smooth transitions',
      tags: ['portfolio', 'creative', 'grid', 'minimal'],
    },
    {
      source: 'behance', url: 'https://behance.net/gallery/auth-001',
      title: 'Auth Pages Exploration', imageUrl: '',
      description: 'Login, signup, password reset, and MFA verification screens',
      tags: ['authentication', 'login', 'signup', 'security'],
    },
    {
      source: 'behance', url: 'https://behance.net/gallery/email-001',
      title: 'Email Campaign Templates', imageUrl: '',
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
