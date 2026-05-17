// ============================================================
// Figma Community Scout Agent — Real Design Pattern Discovery
// ============================================================
//
// Searches Figma Community for design files using Playwright.
// Falls back to Figma API if token available, then mock data.
// ============================================================

import { type PatternSubmission } from '../../types.js';
import type { ScoutResult } from './index.js';
import { getPage, releasePage } from './browser.js';
import { createLogger_Scoped } from '../../logging/index.js';

const logger = createLogger_Scoped('scout:figma');
const FIGMA_SEARCH_URL = 'https://www.figma.com/community/search';

export async function scoutFigma(query: string): Promise<ScoutResult> {
  const start = Date.now();
  const errors: string[] = [];
  const submissions: PatternSubmission[] = [];

  // Try Playwright scraping first (skip in test environment)
  if (process.env.NODE_ENV !== 'test') {
    try {
      const page = await getPage();

    try {
      const searchUrl = `${FIGMA_SEARCH_URL}?query=${encodeURIComponent(query)}&sort_by=relevancy&editors_pick=false&creators=&price=all&content_type=files`;
      logger.debug({ url: searchUrl }, 'Navigating to Figma Community search');

      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

      await page.waitForSelector(
        '[data-testid="file-card"], article, [class*="FileCard"]',
        { timeout: 8000 }
      ).catch(() => { /* files may already be rendered */ });

      await page.waitForTimeout(1500);

      const files = await page.evaluate(() => {
        const results: Array<{ title: string; url: string; imageUrl: string; description: string }> = [];
        const seen = new Set<string>();

        const selectors = [
          '[data-testid="file-card"]',
          'article',
          '[class*="FileCard"]',
          '[class*="resource-card"]',
        ];

        const allElements = new Set<Element>();
        for (const sel of selectors) {
          document.querySelectorAll(sel).forEach(el => allElements.add(el));
        }

        for (const el of allElements) {
          const link = el.querySelector('a[href*="/community/file/"], a[href*="/community/plugin/"]') as HTMLAnchorElement | null;
          const img = el.querySelector('img[src]') as HTMLImageElement | null;
          const titleEl = el.querySelector('[class*="title"], h2, h3') as HTMLElement | null;

          if (!img) continue;

          const href = link?.href || '';
          const fullUrl = href.startsWith('/') ? `https://www.figma.com${href}` : href;
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

      logger.info({ query, found: submissions.length }, 'Figma scout completed via Playwright');
    } finally {
      await releasePage(page);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ query, error: message }, 'Figma scrape failed, trying API');
    errors.push(`Figma scrape failed: ${message}`);
  }
  } // end of NODE_ENV check

  // Fallback to Figma API if token available
  if (submissions.length === 0) {
    const figmaToken = process.env.FIGMA_ACCESS_TOKEN ?? '';
    if (figmaToken) {
      try {
        const url = `https://api.figma.com/v1/files/recent?query=${encodeURIComponent(query)}&page_size=10`;
        const res = await fetch(url, {
          headers: { 'X-Figma-Token': figmaToken },
        });

        if (res.ok) {
          const data = await res.json() as any;
          const apiSubmissions: PatternSubmission[] = (data.items ?? []).map((item: any) => ({
            source: 'figma-community' as const,
            url: `https://figma.com/community/file/${item.id}`,
            title: item.name ?? 'Untitled',
            imageUrl: item.thumbnail_url,
            description: item.description ?? '',
            tags: item.tags ?? [],
          }));
          submissions.push(...apiSubmissions);
          logger.info({ query, found: apiSubmissions.length }, 'Figma scout completed via API');
        }
      } catch (e: any) {
        errors.push(`Figma API error: ${e.message}`);
      }
    }
  }

  // Final fallback to mock data
  if (submissions.length === 0) {
    submissions.push(...getFallbackFigma(query));
    if (errors.length === 0) {
      errors.push('No FIGMA_ACCESS_TOKEN set. Using built-in design library.');
    }
  }

  return { source: 'figma-community', submissions, errors, tookMs: Date.now() - start };
}

function getFallbackFigma(query: string): PatternSubmission[] {
  const q = query.toLowerCase();
  const designs: PatternSubmission[] = [
    {
      source: 'figma-community', url: 'https://figma.com/community/file/component-lib',
      title: 'UI Component Library', imageUrl: '',
      description: 'Comprehensive component library with auto-layout variants and themes',
      tags: ['components', 'library', 'auto-layout', 'variants'],
    },
    {
      source: 'figma-community', url: 'https://figma.com/community/file/wireframe-kit',
      title: 'Wireframe Starter Kit', imageUrl: '',
      description: 'Low-fidelity wireframe kit for rapid prototyping and ideation',
      tags: ['wireframe', 'prototyping', 'lo-fi', 'kit'],
    },
    {
      source: 'figma-community', url: 'https://figma.com/community/file/icon-set',
      title: 'Minimal Icon Set (1000+)', imageUrl: '',
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
