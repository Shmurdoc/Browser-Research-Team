// ============================================================
// Dribbble Scout Agent
// ============================================================

import { type PatternSubmission } from '../../types.js';
import type { ScoutResult } from './index.js';

export async function scoutDribbble(query: string): Promise<ScoutResult> {
  const start = Date.now();
  const errors: string[] = [];
  const submissions: PatternSubmission[] = getMockDribbble(query);

  return { source: 'dribbble', submissions, errors, tookMs: Date.now() - start };
}

function getMockDribbble(query: string): PatternSubmission[] {
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
