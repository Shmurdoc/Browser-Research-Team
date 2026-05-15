// ============================================================
// Behance Scout Agent
// ============================================================

import { type PatternSubmission } from '../../types.js';
import type { ScoutResult } from './index.js';

export async function scoutBehance(query: string): Promise<ScoutResult> {
  const start = Date.now();
  const errors: string[] = [];
  const submissions: PatternSubmission[] = getMockBehance(query);

  return { source: 'behance', submissions, errors, tookMs: Date.now() - start };
}

function getMockBehance(query: string): PatternSubmission[] {
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
