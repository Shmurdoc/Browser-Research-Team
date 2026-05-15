// ============================================================
// Figma Community Scout Agent
// ============================================================

import { type PatternSubmission } from '../../types.js';
import type { ScoutResult } from './index.js';

export async function scoutFigma(query: string): Promise<ScoutResult> {
  const start = Date.now();
  const errors: string[] = [];

  const figmaToken = process.env.FIGMA_ACCESS_TOKEN ?? '';
  if (figmaToken) {
    try {
      const url = `https://api.figma.com/v1/community?query=${encodeURIComponent(query)}&page_size=10`;
      const res = await fetch(url, {
        headers: { 'X-Figma-Token': figmaToken },
      });

      if (res.ok) {
        const data = await res.json() as any;
        const submissions: PatternSubmission[] = (data.items ?? []).map((item: any) => ({
          source: 'figma-community' as const,
          url: `https://figma.com/community/file/${item.id}`,
          title: item.name ?? 'Untitled',
          imageUrl: item.thumbnail_url,
          description: item.description ?? '',
          tags: item.tags ?? [],
        }));
        return { source: 'figma-community', submissions, errors, tookMs: Date.now() - start };
      }
    } catch (e: any) {
      errors.push(`Figma API error: ${e.message}`);
    }
  }

  const submissions: PatternSubmission[] = getMockFigma(query);
  errors.push('No FIGMA_ACCESS_TOKEN set. Using built-in design library.');
  return { source: 'figma-community', submissions, errors, tookMs: Date.now() - start };
}

function getMockFigma(query: string): PatternSubmission[] {
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
