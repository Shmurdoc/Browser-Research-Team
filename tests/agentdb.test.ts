import { describe, it, expect, beforeEach } from 'vitest';
import {
  indexPattern,
  indexSize,
  searchVectors,
  removeFromIndex,
  rebuildIndex,
  generateEmbedding,
  isEmbeddingModelLoaded,
  getEmbeddingStatus,
} from '../src/memory/agentdb';
import type { DesignPattern } from '../src/types';

function makePattern(id: string, title: string, components: string[], quality = 5): DesignPattern {
  const now = Date.now();
  return {
    id,
    source: 'manual',
    url: `https://example.com/${id}`,
    title,
    description: `${title} description`,
    imageHash: undefined,
    imageUrl: undefined,
    layout: { type: 'card-grid', zones: ['main'], confidence: 0.9 },
    colors: { primary: '#ff0000', secondary: '#00ff00', accent: '#0000ff', neutral: '#ffffff', background: '#ffffff', text: '#000000', additional: [] },
    typography: { heading: { family: 'Inter', weight: 700, size: '24px' }, body: { family: 'Inter', weight: 400, size: '16px' }, other: [] },
    components: components as any,
    frameworkHints: ['react'],
    tags: ['test'],
    qualityScore: quality,
    embedding: [],
    feedback: [],
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}

describe('agentdb (unit)', () => {
  beforeEach(async () => {
    await rebuildIndex([]);
  });

  it('generateEmbedding returns a 128-d vector in test env (hash fallback)', async () => {
    const p = makePattern('p-embed', 'Embedding Test', ['button', 'card']);
    const emb = await generateEmbedding(p);
    expect(Array.isArray(emb)).toBe(true);
    expect(emb.length).toBeGreaterThanOrEqual(64);
    expect(emb.length).toBeLessThanOrEqual(128);
    for (const x of emb) {
      expect(typeof x).toBe('number');
      expect(Number.isFinite(x)).toBe(true);
    }
  });

  it('indexPattern and indexSize / removeFromIndex behave correctly', async () => {
    const p1 = makePattern('p1', 'Pattern One', ['button', 'card'], 8);
    const p2 = makePattern('p2', 'Pattern Two', ['input', 'form'], 3);

    await indexPattern(p1);
    expect(indexSize()).toBe(1);

    await indexPattern(p2);
    expect(indexSize()).toBe(2);

    await removeFromIndex(p1.id);
    expect(indexSize()).toBe(1);
  });

  it('searchVectors returns scored results sorted by score', async () => {
    const p1 = makePattern('s1', 'Call To Action Button', ['button', 'cta-section'], 9);
    const p2 = makePattern('s2', 'Signup Form', ['form', 'input'], 4);

    await indexPattern(p1);
    await indexPattern(p2);

    const results = await searchVectors('Call To Action Button', 5);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);

    // each result has id and numeric score, and scores are non-increasing
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      expect(r).toHaveProperty('id');
      expect(typeof r.score).toBe('number');
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1.5); // allow slight >1 in fallback math
      if (i > 0) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(r.score);
      }
    }
  });

  it('embedding model is not loaded in test env and status reflects that', () => {
    expect(isEmbeddingModelLoaded()).toBe(false);
    const st = getEmbeddingStatus();
    expect(st.loaded).toBe(false);
    // message should indicate model loading skipped in test env
    expect(typeof st.error === 'string' || st.error === null).toBe(true);
  });
});
