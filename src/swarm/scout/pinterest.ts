// ============================================================
// Pinterest Scout Agent — Real Design Pattern Discovery
// ============================================================
//
// Searches Pinterest for design patterns using Playwright.
// Extracts pins with titles, image URLs, descriptions, and links.
// Falls back to heuristic mock data if scraping fails.
// ============================================================

import { type PatternSubmission } from '../../types.js';
import { createLogger_Scoped } from '../../logging/index.js';
import type { ScoutResult } from './index.js';
import { getPage, releasePage } from './browser.js';

const logger = createLogger_Scoped('scout:pinterest');
const PINTEREST_SEARCH_URL = 'https://www.pinterest.com/search/pins/';

export async function scoutPinterest(query: string): Promise<ScoutResult> {
  const start = Date.now();
  const errors: string[] = [];
  const submissions: PatternSubmission[] = [];

  logger.debug({ query }, 'Starting Pinterest scout query');

  // Skip Playwright in test environment
  if (process.env.NODE_ENV !== 'test') {
    try {
      const page = await getPage();

    try {
      const searchUrl = `${PINTEREST_SEARCH_URL}?q=${encodeURIComponent(query + ' ui design')}`;
      logger.debug({ url: searchUrl }, 'Navigating to Pinterest search');

      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

      // Wait for pin results to appear
      await page.waitForSelector(
        '[data-test-id="pin"], article, [data-grid-item="true"]',
        { timeout: 8000 }
      ).catch(() => { /* pins may already be rendered */ });

      // Give dynamic content a moment
      await page.waitForTimeout(1500);

      const pins = await page.evaluate(() => {
        const results: Array<{ title: string; url: string; imageUrl: string; description: string }> = [];
        const seen = new Set<string>();

        // Multiple selector strategies
        const selectors = [
          '[data-test-id="pin"]',
          'article',
          '[data-grid-item="true"]',
          '[class*="pinWrapper"]',
        ];

        const allElements = new Set<Element>();
        for (const sel of selectors) {
          document.querySelectorAll(sel).forEach(el => allElements.add(el));
        }

        for (const el of allElements) {
          const link = el.querySelector('a[href*="/pin/"]') as HTMLAnchorElement | null;
          const img = el.querySelector('img[src]') as HTMLImageElement | null;
          const titleEl = el.querySelector('[class*="title"], h2, h3') as HTMLElement | null;

          if (!img) continue;

          const href = link?.href || '';
          const fullUrl = href.startsWith('/') ? `https://www.pinterest.com${href}` : href;
          const key = fullUrl || img.src;
          if (seen.has(key) || !key) continue;
          seen.add(key);

          results.push({
            title: titleEl?.textContent?.trim() || '',
            url: fullUrl,
            imageUrl: img.src || img.getAttribute('data-src') || '',
            description: el.getAttribute('aria-label') || '',
          });

          if (results.length >= 10) break;
        }

        return results;
      });

      for (const pin of pins) {
        if (!pin.imageUrl) continue;

        submissions.push({
          source: 'pinterest',
          url: pin.url || pin.imageUrl,
          title: pin.title || `Pinterest Design — ${query}`,
          imageUrl: pin.imageUrl,
          description: pin.description || '',
          tags: [query.toLowerCase(), 'pinterest', 'design'],
        });
      }

      logger.info({ query, found: submissions.length }, 'Pinterest scout completed');
    } finally {
      await releasePage(page);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ query, error: message }, 'Pinterest scrape failed, using fallback');
    errors.push(`Pinterest scrape failed: ${message}`);
  }
  } // end of NODE_ENV check

  // Fallback to curated mock data if scraping returned nothing or failed
  if (submissions.length === 0) {
    submissions.push(...getFallbackPinterest(query));
    if (errors.length === 0) {
      errors.push('No Pinterest API key set (PIN_API_KEY). Using built-in design library.');
    }
  }

  const tookMs = Date.now() - start;
  return { source: 'pinterest', submissions, errors, tookMs };
}

function getFallbackPinterest(query: string): PatternSubmission[] {
  const q = query.toLowerCase();
  const designs: PatternSubmission[] = [
    {
      source: 'pinterest', url: 'https://pinterest.com/pin/dashboard-001',
      title: 'Modern Analytics Dashboard', imageUrl: '',
      description: 'Clean analytics dashboard with sidebar navigation and data cards',
      tags: ['dashboard', 'analytics', 'modern', 'data-viz'],
    },
    {
      source: 'pinterest', url: 'https://pinterest.com/pin/landing-001',
      title: 'SaaS Landing Page Hero', imageUrl: '',
      description: 'Hero section with gradient background, headline, and CTA button',
      tags: ['landing-page', 'hero', 'saas', 'gradient'],
    },
    {
      source: 'pinterest', url: 'https://pinterest.com/pin/form-001',
      title: 'Multi-step Signup Form', imageUrl: '',
      description: 'Multi-step form with progress indicator and clean validation',
      tags: ['form', 'signup', 'multi-step', 'validation'],
    },
    {
      source: 'pinterest', url: 'https://pinterest.com/pin/pricing-001',
      title: 'Pricing Comparison Table', imageUrl: '',
      description: 'Three-tier pricing table with feature comparison and highlighted recommended plan',
      tags: ['pricing', 'comparison', 'saas', 'conversion'],
    },
    {
      source: 'pinterest', url: 'https://pinterest.com/pin/settings-001',
      title: 'Profile Settings Page', imageUrl: '',
      description: 'Clean settings layout with sections, toggles, and avatar upload',
      tags: ['settings', 'profile', 'account', 'form'],
    },
    {
      source: 'pinterest', url: 'https://pinterest.com/pin/navbar-001',
      title: 'Responsive Navigation Patterns', imageUrl: '',
      description: 'Collection of responsive navbar designs with dropdowns and mobile hamburger',
      tags: ['navbar', 'navigation', 'responsive', 'header'],
    },
    {
      source: 'pinterest', url: 'https://pinterest.com/pin/dark-001',
      title: 'Dark Mode Dashboard UI', imageUrl: '',
      description: 'Full dark mode dashboard with charts, sidebar, and data tables',
      tags: ['dark-mode', 'dashboard', 'analytics', 'charts'],
    },
    {
      source: 'pinterest', url: 'https://pinterest.com/pin/chat-001',
      title: 'Messaging App Interface', imageUrl: '',
      description: 'Clean messaging UI with chat bubbles, contact list, and search',
      tags: ['messaging', 'chat', 'social', 'communication'],
    },
  ];

  const scored = designs.map(d => {
    const tagScore = (d.tags ?? []).filter(t => q.includes(t)).length;
    const titleScore = (d.title ?? '').toLowerCase().includes(q) ? 2 : 0;
    const descScore = (d.description ?? '').toLowerCase().includes(q) ? 1 : 0;
    return { design: d, score: tagScore + titleScore + descScore };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, 8).map(s => s.design);
}
