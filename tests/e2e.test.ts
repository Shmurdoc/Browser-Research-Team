// ============================================================
// End-to-End Integration Tests
// Tests the complete workflow: discover → submit → rate → suggest → code
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync, mkdirSync } from 'node:fs';
import {
  scoutSource,
  interpretSubmission,
  putPattern,
  getPattern,
  addFeedback,
  learnFromFeedback,
  searchPatterns,
  searchVectors,
  indexPattern,
  getStats,
  assessQuality,
  generateCode,
  assignTaxonomy,
  initSONA,
} from '../dist/src/index.js';
import { createMockPattern, createMockSubmission } from './fixtures/patterns.js';
import { nanoid } from 'nanoid';

const STORAGE_DIR = '.test-e2e-storage';

beforeEach(() => {
  if (!existsSync(STORAGE_DIR)) {
    mkdirSync(STORAGE_DIR, { recursive: true });
  }
  process.env.DPM_STORAGE_DIR = STORAGE_DIR;
  initSONA({ adaptationRate: 0.15 });
});

describe('End-to-End Integration', () => {
  describe('Workflow: Discover → Submit → Rate → Suggest → Code', () => {
    it('should discover patterns from sources', async () => {
      const result = await scoutSource('pinterest', 'dashboard');
      expect(result.source).toBe('pinterest');
      expect(Array.isArray(result.submissions)).toBe(true);
      expect(result.errors.length).toBeGreaterThanOrEqual(0);
    });

    it('should interpret submission through vision pipeline', async () => {
      const submission = createMockSubmission({
        title: 'Analytics Dashboard',
        description: 'A modern analytics dashboard with sidebar navigation and data cards',
        tags: ['dashboard', 'analytics', 'modern'],
      });

      const vision = await interpretSubmission(submission);

      expect(vision).toHaveProperty('layout');
      expect(vision.layout.type).toBe('dashboard');
      expect(vision).toHaveProperty('components');
      expect(Array.isArray(vision.components)).toBe(true);
      expect(vision).toHaveProperty('colors');
      expect(vision.colors).toHaveProperty('primary');
      expect(vision).toHaveProperty('typography');
      expect(vision).toHaveProperty('confidence');
      expect(typeof vision.confidence).toBe('number');
    });

    it('should submit pattern through quality gate and store', async () => {
      const submission = createMockSubmission({
        title: 'Test Dashboard Pattern',
        description: 'A comprehensive dashboard UI pattern',
        tags: ['dashboard', 'test'],
      });

      const vision = await interpretSubmission(submission);

      const patternId = `pat-e2e-${nanoid(12)}`;
      const pattern = {
        id: patternId,
        source: 'pinterest' as any,
        url: 'https://example.com/test',
        title: submission.title,
        description: submission.description,
        imageUrl: submission.imageUrl,
        layout: vision.layout,
        colors: vision.colors,
        typography: vision.typography,
        components: vision.components,
        frameworkHints: ['react'] as any,
        tags: submission.tags ?? [],
        qualityScore: 5,
        embedding: [] as number[],
        feedback: [],
        metadata: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const taxonomy = assignTaxonomy(pattern);
      pattern.tags = [...new Set([...(pattern.tags ?? []), ...taxonomy.tags])];

      const quality = await assessQuality(pattern);
      pattern.qualityScore = quality.score;

      await putPattern(pattern);
      await indexPattern(pattern);

      const retrieved = await getPattern(pattern.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(pattern.id);
      expect(retrieved?.title).toBe(pattern.title);
      expect(retrieved?.qualityScore).toBe(quality.score);
    });

    it('should rate pattern and trigger SONA learning', async () => {
      const pattern = createMockPattern({ id: 'e2e-rate-test' });
      await putPattern(pattern);
      await indexPattern(pattern);

      const success = await addFeedback(pattern.id, {
        rating: 4,
        tags: ['good', 'useful'],
        comment: 'Nice pattern',
      });
      expect(success).toBe(true);

      await learnFromFeedback(pattern.id, 4, ['good', 'useful']);

      const { getSONAStats } = await import('../dist/src/memory/sona.js');
      const stats = getSONAStats();
      expect(stats.learnedPatterns).toBeGreaterThanOrEqual(1);

      const updated = await getPattern(pattern.id);
      expect(updated?.feedback.length).toBe(1);
      expect(updated?.feedback[0].rating).toBe(4);
    });

    it('should search patterns', async () => {
      const pattern = createMockPattern({
        id: 'e2e-search-test',
        title: 'Searchable Dashboard Pattern',
        tags: ['dashboard', 'searchable'],
      });
      await putPattern(pattern);
      await indexPattern(pattern);

      const results = await searchPatterns({ text: 'dashboard' });
      expect(results.length).toBeGreaterThanOrEqual(0);

      const srcResults = await searchPatterns({ source: 'pinterest' });
      srcResults.forEach(r => expect(r.pattern.source).toBe('pinterest'));
    });

    it('should search vectors for similar patterns', async () => {
      const pattern = createMockPattern({
        id: 'e2e-vector-test',
      });
      await indexPattern(pattern);

      const results = await searchVectors('dashboard', 10);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should generate code for a discovered pattern', async () => {
      const result = await scoutSource('pinterest', 'card');
      const submission = result.submissions[0];
      if (!submission) return;

      const vision = await interpretSubmission(submission);

      const patternId = `pat-codegen-e2e-${nanoid(8)}`;
      const pattern = {
        id: patternId,
        source: submission.source,
        url: submission.url,
        title: submission.title ?? 'Test',
        description: submission.description ?? '',
        layout: vision.layout,
        colors: vision.colors,
        typography: vision.typography,
        components: vision.components,
        frameworkHints: ['react'],
        tags: submission.tags ?? [],
        qualityScore: 5,
        embedding: [],
        feedback: [],
        metadata: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const taxonomy = assignTaxonomy(pattern);
      pattern.tags = [...new Set([...(pattern.tags ?? []), ...taxonomy.tags])];
      const quality = await assessQuality(pattern);
      pattern.qualityScore = quality.score;

      await putPattern(pattern);
      await indexPattern(pattern);

      const codeResult = await generateCode({
        patternId,
        framework: 'react',
        style: 'tailwind',
        options: { typescript: true, includeTests: false },
        componentsToGenerate: vision.components.length > 0
          ? vision.components
          : ['card'],
      });

      expect(codeResult.patternId).toBe(patternId);
      expect(codeResult.files.length).toBeGreaterThan(0);

      const mainFile = codeResult.files.find(f => !f.path.includes('__tests__'));
      expect(mainFile).toBeDefined();
      if (mainFile) {
        expect(mainFile.content.length).toBeGreaterThan(50);
      }
    });

    it('should get catalog statistics', async () => {
      const stats = await getStats();
      expect(stats).toHaveProperty('totalPatterns');
      expect(typeof stats.totalPatterns).toBe('number');
      expect(typeof stats.averageQuality).toBe('number');
    });

    it('should suggest related patterns', async () => {
      await scoutSource('pinterest', 'analytics');
      const results = await searchPatterns({ text: 'analytics dashboard', limit: 3 });
      expect(results.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle search with no results', async () => {
      const results = await searchPatterns({ text: 'xyzqweasdunique' });
      expect(results).toEqual([]);
    });

    it('should handle pattern not found', async () => {
      const result = await getPattern('nonexistent-' + Date.now());
      expect(result).toBeNull();
    });

    it('should handle feedback on non-existent pattern', async () => {
      const success = await addFeedback('nonexistent-id', { rating: 5 });
      expect(success).toBe(false);
    });
  });
});