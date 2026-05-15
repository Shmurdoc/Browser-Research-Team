// ============================================================
// Pinterest Scout Agent
// ============================================================
//
// Queries Pinterest for design inspiration pins.
// Uses the Pinterest API via REST (requires PIN_API_KEY env var).
// Falls back to mock data if no API key is set.
// ============================================================

import { type PatternSubmission } from '../../types.js';
import { createLogger_Scoped } from '../../logging/index.js';
import type { ScoutResult } from './index.js';

const logger = createLogger_Scoped('scout:pinterest');
const PINTEREST_API = 'https://api.pinterest.com/v5';
const API_KEY = process.env.PIN_API_KEY ?? process.env.PINTEREST_API_KEY ?? '';

export async function scoutPinterest(query: string): Promise<ScoutResult> {
  const start = Date.now();
  const errors: string[] = [];

  logger.debug({ query }, 'Starting Pinterest scout query');

  if (API_KEY) {
    try {
      const url = `${PINTEREST_API}/pins/search?query=${encodeURIComponent(query + ' ui design')}&page_size=25`;
      logger.debug({ url }, 'Calling Pinterest API');

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });

      if (!res.ok) {
        const error = `Pinterest API error: ${res.status} ${res.statusText}`;
        errors.push(error);
        logger.warn({ status: res.status, statusText: res.statusText }, error);
        // Fall through to mock
      } else {
        const data = await res.json() as any;
        const submissions: PatternSubmission[] = (data.items ?? []).map((item: any) => ({
          source: 'pinterest' as const,
          url: item.link ?? `https://pinterest.com/pin/${item.id}`,
          title: item.title ?? item.alt_text ?? 'Untitled',
          imageUrl: item.media?.images?.original?.url,
          description: item.alt_text ?? item.description ?? '',
          tags: (item.hashtags ?? []).map((t: string) => t.replace('#', '')),
        }));

        const tookMs = Date.now() - start;
        logger.info({ count: submissions.length, tookMs }, 'Pinterest scout completed successfully');
        return { source: 'pinterest', submissions, errors, tookMs };
      }
    } catch (e: any) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      errors.push(`Pinterest API exception: ${errorMsg}`);
      logger.error({ error: e }, 'Pinterest API exception');
    }
  }

  // No API key or error: return curated mock data
  const mockDesigns = getMockDesigns(query);
  const fallbackMsg = 'No Pinterest API key set (PIN_API_KEY). Using built-in design library.';
  errors.push(fallbackMsg);
  const tookMs = Date.now() - start;
  logger.info({ count: mockDesigns.length, tookMs }, fallbackMsg);
  return { source: 'pinterest', submissions: mockDesigns, errors, tookMs };
}

function getMockDesigns(query: string): PatternSubmission[] {
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

  // Filter by query relevance
  const scored = designs.map(d => {
    const tagScore = (d.tags ?? []).filter(t => q.includes(t)).length;
    const titleScore = (d.title ?? '').toLowerCase().includes(q) ? 2 : 0;
    const descScore = (d.description ?? '').toLowerCase().includes(q) ? 1 : 0;
    return { design: d, score: tagScore + titleScore + descScore };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, 8).map(s => s.design);
}
