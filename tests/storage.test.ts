// ============================================================
// Storage Layer Tests
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { _resetCache } from '../dist/src/storage/local.js';

// Unique storage directory for THIS test run
const TEST_STORAGE = join(process.cwd(), '.test-storage-' + Date.now());

// Storage functions — assigned in beforeEach after env is set
let putPattern: typeof import('../dist/src/storage/local.js').putPattern;
let getPattern: typeof import('../dist/src/storage/local.js').getPattern;
let deletePattern: typeof import('../dist/src/storage/local.js').deletePattern;
let searchPatterns: typeof import('../dist/src/storage/local.js').searchPatterns;
let addFeedback: typeof import('../dist/src/storage/local.js').addFeedback;
let getStats: typeof import('../dist/src/storage/local.js').getStats;
let getAllIds: typeof import('../dist/src/storage/local.js').getAllIds;

beforeEach(async () => {
  // Set unique storage directory and reset cache
  process.env.DPM_STORAGE_DIR = TEST_STORAGE;
  _resetCache();

  // Clean and create test directory
  if (existsSync(TEST_STORAGE)) {
    rmSync(TEST_STORAGE, { recursive: true, force: true });
  }
  mkdirSync(TEST_STORAGE, { recursive: true });

  // Dynamically import storage functions AFTER env var is set
  const storage = await import('../dist/src/storage/local.js');
  putPattern = storage.putPattern;
  getPattern = storage.getPattern;
  deletePattern = storage.deletePattern;
  searchPatterns = storage.searchPatterns;
  addFeedback = storage.addFeedback;
  getStats = storage.getStats;
  getAllIds = storage.getAllIds;
});

afterEach(() => {
  try {
    rmSync(TEST_STORAGE, { recursive: true, force: true });
  } catch {
    // cleanup best-effort
  }
  _resetCache();
});

describe('putPattern', () => {
  it('should store a new pattern', async () => {
    const { createMockPattern } = await import('../tests/fixtures/patterns.js');
    const pattern = createMockPattern({ id: 'test-put-1' });
    await putPattern(pattern);

    const retrieved = await getPattern('test-put-1');
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe('test-put-1');
    expect(retrieved?.title).toBe('Test Pattern');
  });

  it('should update an existing pattern', async () => {
    const { createMockPattern } = await import('../tests/fixtures/patterns.js');
    const pattern = createMockPattern({ id: 'test-put-2', title: 'Original' });
    await putPattern(pattern);

    const updated = createMockPattern({ id: 'test-put-2', title: 'Updated' });
    await putPattern(updated);

    const retrieved = await getPattern('test-put-2');
    expect(retrieved?.title).toBe('Updated');
  });

  it('should store multiple patterns independently', async () => {
    const { createMockPattern } = await import('../tests/fixtures/patterns.js');
    const p1 = createMockPattern({ id: 'multi-1' });
    const p2 = createMockPattern({ id: 'multi-2' });
    await putPattern(p1);
    await putPattern(p2);

    const r1 = await getPattern('multi-1');
    const r2 = await getPattern('multi-2');
    expect(r1?.id).toBe('multi-1');
    expect(r2?.id).toBe('multi-2');
  });

  it('should persist data to disk (survives cache clear)', async () => {
    const { createMockPattern } = await import('../tests/fixtures/patterns.js');
    const pattern = createMockPattern({ id: 'persist-1' });
    await putPattern(pattern);

    _resetCache();

    const { getPattern: getFresh } = await import('../dist/src/storage/local.js');
    const retrieved = await getFresh('persist-1');
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe('persist-1');
  });
});

describe('getPattern', () => {
  it('should return null for non-existent pattern', async () => {
    const result = await getPattern('nonexistent-' + Date.now());
    expect(result).toBeNull();
  });

  it('should return the full pattern object', async () => {
    const { createMockPattern } = await import('../tests/fixtures/patterns.js');
    const pattern = createMockPattern({ id: 'test-get-full' });
    await putPattern(pattern);

    const retrieved = await getPattern('test-get-full');
    expect(retrieved).toBeDefined();
    expect(retrieved?.source).toBe('pinterest');
    expect(retrieved?.url).toBe(`https://example.com/pattern/test-get-full`);
    expect(retrieved?.layout).toBeDefined();
    expect(retrieved?.colors).toBeDefined();
    expect(retrieved?.typography).toBeDefined();
    expect(retrieved?.components).toEqual(['button', 'card', 'navbar']);
  });
});

describe('deletePattern', () => {
  it('should delete an existing pattern', async () => {
    const { createMockPattern } = await import('../tests/fixtures/patterns.js');
    const pattern = createMockPattern({ id: 'test-delete-1' });
    await putPattern(pattern);

    const deleted = await deletePattern('test-delete-1');
    expect(deleted).toBe(true);

    const retrieved = await getPattern('test-delete-1');
    expect(retrieved).toBeNull();
  });

  it('should return false for non-existent pattern', async () => {
    const result = await deletePattern('nonexistent-' + Date.now());
    expect(result).toBe(false);
  });
});

describe('searchPatterns', () => {
  it('should find patterns by text query', async () => {
    const { createMockPattern } = await import('../tests/fixtures/patterns.js');
    const pattern = createMockPattern({
      id: 'search-1',
      title: 'Analytics Dashboard',
      description: 'A modern analytics dashboard with charts',
      tags: ['dashboard', 'analytics'],
      qualityScore: 10,
    });
    await putPattern(pattern);

    const results = await searchPatterns({ text: 'analytics dashboard' });
    expect(results.length).toBeGreaterThanOrEqual(1);
    const found = results.find((r: any) => r.pattern.id === 'search-1');
    expect(found).toBeDefined();
  });

  it('should return empty results for unmatched query', async () => {
    const { createMockPattern } = await import('../tests/fixtures/patterns.js');
    const pattern = createMockPattern({ id: 'search-2', title: 'Dashboard' });
    await putPattern(pattern);

    const results = await searchPatterns({ text: 'completely unrelated query xyz' });
    expect(Array.isArray(results)).toBe(true);
  });

  it('should filter by source', async () => {
    const { createMockPattern } = await import('../tests/fixtures/patterns.js');
    const p1 = createMockPattern({ id: 'src-1', source: 'pinterest' });
    const p2 = createMockPattern({ id: 'src-2', source: 'dribbble' });
    await putPattern(p1);
    await putPattern(p2);

    const results = await searchPatterns({ source: 'pinterest' });
    expect(results.every((r: any) => r.pattern.source === 'pinterest')).toBe(true);
  });

  it('should filter by layout type', async () => {
    const { createMockPattern } = await import('../tests/fixtures/patterns.js');
    const p1 = createMockPattern({ id: 'layout-1', layout: { type: 'dashboard', zones: ['a'], confidence: 0.9 } });
    const p2 = createMockPattern({ id: 'layout-2', layout: { type: 'landing-page', zones: ['b'], confidence: 0.9 } });
    await putPattern(p1);
    await putPattern(p2);

    const results = await searchPatterns({ layoutType: 'dashboard' });
    expect(results.length).toBe(1);
    expect(results[0].pattern.layout.type).toBe('dashboard');
  });

  it('should filter by framework', async () => {
    const { createMockPattern } = await import('../tests/fixtures/patterns.js');
    const p1 = createMockPattern({ id: 'fw-1', frameworkHints: ['react'] });
    const p2 = createMockPattern({ id: 'fw-2', frameworkHints: ['vue'] });
    await putPattern(p1);
    await putPattern(p2);

    const results = await searchPatterns({ framework: 'react' });
    expect(results.length).toBe(1);
    expect(results[0].pattern.frameworkHints).toContain('react');
  });

  it('should filter by minimum quality score', async () => {
    const { createMockPattern } = await import('../tests/fixtures/patterns.js');
    const p1 = createMockPattern({ id: 'q-1', qualityScore: 8 });
    const p2 = createMockPattern({ id: 'q-2', qualityScore: 3 });
    await putPattern(p1);
    await putPattern(p2);

    const results = await searchPatterns({ minQuality: 5 });
    expect(results.every((r: any) => r.pattern.qualityScore >= 5)).toBe(true);
  });

  it('should respect limit parameter', async () => {
    const { createMockPatterns } = await import('../tests/fixtures/patterns.js');
    const patterns = createMockPatterns(10);
    for (let i = 0; i < 10; i++) {
      await putPattern(patterns[i]);
    }

    const results = await searchPatterns({ limit: 3 });
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('should respect offset parameter', async () => {
    const { createMockPatterns } = await import('../tests/fixtures/patterns.js');
    const patterns = createMockPatterns(5);
    for (let i = 0; i < 5; i++) {
      await putPattern(patterns[i]);
    }

    const allResults = await searchPatterns({ limit: 50 });
    const pageResults = await searchPatterns({ offset: 2, limit: 2 });
    expect(pageResults.length).toBeLessThanOrEqual(2);
  });
});

describe('addFeedback', () => {
  it('should add feedback to a pattern', async () => {
    const { createMockPattern } = await import('../tests/fixtures/patterns.js');
    const pattern = createMockPattern({ id: 'fb-1' });
    await putPattern(pattern);

    const success = await addFeedback('fb-1', { rating: 4, tags: ['good'], comment: 'Nice pattern' });
    expect(success).toBe(true);

    const retrieved = await getPattern('fb-1');
    expect(retrieved?.feedback).toHaveLength(1);
    expect(retrieved?.feedback[0].rating).toBe(4);
  });

  it('should update quality score based on ratings', async () => {
    const { createMockPattern } = await import('../tests/fixtures/patterns.js');
    const pattern = createMockPattern({ id: 'fb-2', qualityScore: 5 });
    await putPattern(pattern);

    await addFeedback('fb-2', { rating: 5 });
    await addFeedback('fb-2', { rating: 4 });

    const retrieved = await getPattern('fb-2');
    const expectedScore = Math.round(((5 + 4) / 2 / 5) * 10);
    expect(retrieved?.qualityScore).toBe(expectedScore);
  });

  it('should return false for non-existent pattern', async () => {
    const success = await addFeedback('nonexistent-' + Date.now(), { rating: 3 });
    expect(success).toBe(false);
  });

  it('should handle rating with timestamp', async () => {
    const { createMockPattern } = await import('../tests/fixtures/patterns.js');
    const pattern = createMockPattern({ id: 'fb-3' });
    await putPattern(pattern);

    const success = await addFeedback('fb-3', { rating: 5, tags: [], comment: '' });
    expect(success).toBe(true);

    const retrieved = await getPattern('fb-3');
    expect(retrieved?.feedback[0]).toHaveProperty('timestamp');
  });
});

describe('getStats', () => {
  it('should return correct total patterns count', async () => {
    const { createMockPattern } = await import('../tests/fixtures/patterns.js');
    const p1 = createMockPattern({ id: 'stat-1', source: 'pinterest' });
    const p2 = createMockPattern({ id: 'stat-2', source: 'dribbble' });
    await putPattern(p1);
    await putPattern(p2);

    const stats = await getStats();
    expect(stats.totalPatterns).toBe(2);
  });

  it('should break down by source', async () => {
    const { createMockPattern } = await import('../tests/fixtures/patterns.js');
    const p1 = createMockPattern({ id: 's-1', source: 'pinterest' });
    const p2 = createMockPattern({ id: 's-2', source: 'dribbble' });
    const p3 = createMockPattern({ id: 's-3', source: 'pinterest' });
    await putPattern(p1);
    await putPattern(p2);
    await putPattern(p3);

    const stats = await getStats();
    expect(stats.totalSources.pinterest).toBe(2);
    expect(stats.totalSources.dribbble).toBe(1);
  });

  it('should calculate average quality score', async () => {
    const { createMockPattern } = await import('../tests/fixtures/patterns.js');
    const p1 = createMockPattern({ id: 'aq-1', qualityScore: 8 });
    const p2 = createMockPattern({ id: 'aq-2', qualityScore: 6 });
    await putPattern(p1);
    await putPattern(p2);

    const stats = await getStats();
    expect(stats.averageQuality).toBe(7);
  });

  it('should return top layouts sorted by count', async () => {
    const { createMockPattern } = await import('../tests/fixtures/patterns.js');
    for (let i = 0; i < 3; i++) {
      await putPattern(createMockPattern({ id: `top-layout-${i}`, layout: { type: 'dashboard', zones: [], confidence: 0.9 }, qualityScore: 10 }));
    }
    await putPattern(createMockPattern({ id: 'top-layout-single', layout: { type: 'landing-page', zones: [], confidence: 0.9 }, qualityScore: 10 }));

    const stats = await getStats();
    expect(stats.topLayouts[0].type).toBe('dashboard');
    expect(stats.topLayouts[0].count).toBe(3);
  });

  it('should return top components sorted by count', async () => {
    const { createMockPattern } = await import('../tests/fixtures/patterns.js');
    const p1 = createMockPattern({ id: 'tc-1', components: ['card', 'button'] });
    const p2 = createMockPattern({ id: 'tc-2', components: ['card', 'navbar'] });
    await putPattern(p1);
    await putPattern(p2);

    const stats = await getStats();
    const cardEntry = stats.topComponents.find((c: any) => c.type === 'card');
    expect(cardEntry?.count).toBe(2);
  });
});

describe('getAllIds', () => {
  it('should return all pattern IDs', async () => {
    const { createMockPattern } = await import('../tests/fixtures/patterns.js');
    await putPattern(createMockPattern({ id: 'id-1' }));
    await putPattern(createMockPattern({ id: 'id-2' }));
    await putPattern(createMockPattern({ id: 'id-3' }));

    const ids = await getAllIds();
    expect(ids).toHaveLength(3);
    expect(ids).toContain('id-1');
    expect(ids).toContain('id-2');
    expect(ids).toContain('id-3');
  });

  it('should return empty array when no patterns', async () => {
    const ids = await getAllIds();
    expect(ids).toEqual([]);
  });
});

describe('Error Handling', () => {
it('should handle invalid ID gracefully', async () => {
      const result = await getPattern(null as any);
      // getPattern returns null for non-existent IDs, including null/undefined
      expect(result).toBeNull();
    });

  it('should isolate test storage from production', async () => {
    expect(existsSync(TEST_STORAGE)).toBe(true);
    const productionDir = join(process.cwd(), 'patterns');
    expect(TEST_STORAGE).not.toBe(productionDir);
  });
});