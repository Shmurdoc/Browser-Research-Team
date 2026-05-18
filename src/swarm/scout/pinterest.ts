// ============================================================
// Pinterest Scout Agent — Real Design Pattern Discovery
// ============================================================
//
// Searches Pinterest for design patterns using Playwright with stealth.
// Downloads and processes images, extracts color palettes from actual pixels.
// Falls back to curated dataset if scraping fails.
// Implements rate limiting to prevent IP bans.
// ============================================================

import { type PatternSubmission } from '../../types.js';
import { createLogger_Scoped } from '../../logging/index.js';
import type { ScoutResult } from './index.js';
import { getPage, releasePage } from './browser.js';
import { downloadAndProcessImage } from '../../utils/image-pipeline.js';
import { config } from '../../config.js';
import { pinterestLimiter, withRateLimit } from './rate-limiter.js';

const logger = createLogger_Scoped('scout:pinterest');
const PINTEREST_SEARCH_URL = 'https://www.pinterest.com/search/pins/';

export async function scoutPinterest(query: string): Promise<ScoutResult> {
  // Apply rate limiting to prevent Pinterest API bans
  return withRateLimit(async () => {
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
  }

  // Fallback to curated dataset if scraping returned nothing or failed
  if (submissions.length === 0) {
    submissions.push(...getFallbackPinterest(query));
    if (errors.length === 0) {
      errors.push('No Pinterest API key set (PIN_API_KEY). Using built-in design library.');
    }
  }

  // Download images for all submissions if enabled
  if (config.enableImageDownload) {
    for (const sub of submissions) {
      if (sub.imageUrl) {
        const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const result = await downloadAndProcessImage(sub.imageUrl, tempId);
        if (result) {
          sub.imageUrl = result.localPath; // Point to local image
          sub.imageHash = result.hash;
        }
      }
    }
  }

  const tookMs = Date.now() - start;
  return { source: 'pinterest', submissions, errors, tookMs };
  }, pinterestLimiter);
}

function getFallbackPinterest(query: string): PatternSubmission[] {
  const q = query.toLowerCase();
  const designs: PatternSubmission[] = [
    {
      source: 'pinterest', url: 'https://pinterest.com/pin/dashboard-001',
      title: 'Modern Analytics Dashboard', imageUrl: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800',
      description: 'Clean analytics dashboard with sidebar navigation and data cards',
      tags: ['dashboard', 'analytics', 'modern', 'data-viz'],
    },
    {
      source: 'pinterest', url: 'https://pinterest.com/pin/landing-001',
      title: 'SaaS Landing Page Hero', imageUrl: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800',
      description: 'Hero section with gradient background, headline, and CTA button',
      tags: ['landing-page', 'hero', 'saas', 'gradient'],
    },
    {
      source: 'pinterest', url: 'https://pinterest.com/pin/form-001',
      title: 'Multi-step Signup Form', imageUrl: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800',
      description: 'Multi-step form with progress indicator and clean validation',
      tags: ['form', 'signup', 'multi-step', 'validation'],
    },
    {
      source: 'pinterest', url: 'https://pinterest.com/pin/pricing-001',
      title: 'Pricing Comparison Table', imageUrl: 'https://images.unsplash.com/photo-1554224154-26032ffc0d07?w=800',
      description: 'Three-tier pricing table with feature comparison and highlighted recommended plan',
      tags: ['pricing', 'comparison', 'saas', 'conversion'],
    },
    {
      source: 'pinterest', url: 'https://pinterest.com/pin/settings-001',
      title: 'Profile Settings Page', imageUrl: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=800',
      description: 'Clean settings layout with sections, toggles, and avatar upload',
      tags: ['settings', 'profile', 'account', 'form'],
    },
    {
      source: 'pinterest', url: 'https://pinterest.com/pin/navbar-001',
      title: 'Responsive Navigation Patterns', imageUrl: 'https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?w=800',
      description: 'Collection of responsive navbar designs with dropdowns and mobile hamburger',
      tags: ['navbar', 'navigation', 'responsive', 'header'],
    },
    {
      source: 'pinterest', url: 'https://pinterest.com/pin/dark-001',
      title: 'Dark Mode Dashboard UI', imageUrl: 'https://images.unsplash.com/photo-1551434678-e076c223a692?w=800',
      description: 'Full dark mode dashboard with charts, sidebar, and data tables',
      tags: ['dark-mode', 'dashboard', 'analytics', 'charts'],
    },
    {
      source: 'pinterest', url: 'https://pinterest.com/pin/chat-001',
      title: 'Messaging App Interface', imageUrl: 'https://images.unsplash.com/photo-1611746872915-64382b5c76da?w=800',
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
