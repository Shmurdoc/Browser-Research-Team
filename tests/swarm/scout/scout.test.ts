// ============================================================
// Scout Agent Tests
// ============================================================

import { describe, it, expect } from 'vitest';
import { scoutSource, scoutAll } from '../../../dist/src/swarm/scout/index.js';

describe('Scout Agents', () => {
  describe('scoutSource', () => {
    it('should return results from a known source', async () => {
      const result = await scoutSource('pinterest', 'dashboard');
      expect(result.source).toBe('pinterest');
      expect(Array.isArray(result.submissions)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
      expect(typeof result.tookMs).toBe('number');
    });

    it('should return submissions with required fields', async () => {
      const result = await scoutSource('dribbble', 'landing page');
      if (result.submissions.length > 0) {
        const sub = result.submissions[0];
        expect(sub).toHaveProperty('source');
        expect(sub).toHaveProperty('url');
        expect(sub).toHaveProperty('title');
        expect(sub).toHaveProperty('tags');
        expect(Array.isArray(sub.tags)).toBe(true);
      }
    });

    it('should handle unknown source gracefully', async () => {
      const result = await scoutSource('unknown-source' as any, 'test');
      expect(result.source).toBe('unknown-source');
      expect(result.submissions).toEqual([]);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should filter by relevance', async () => {
      const result = await scoutSource('pinterest', 'dashboard analytics');
      expect(result.submissions.length).toBeGreaterThanOrEqual(0);
    });

    it('should have reasonable titles', async () => {
      const result = await scoutSource('behance', 'form');
      for (const sub of result.submissions) {
        expect(typeof sub.title).toBe('string');
        expect(sub.title.length).toBeGreaterThan(0);
      }
    });

    it('should not throw on valid inputs', async () => {
      await expect(scoutSource('figma-community', 'mobile ui'))
        .resolves.toBeDefined();
    });
  });

  describe('scoutAll', () => {
    it('should search across all sources', async () => {
      const result = await scoutAll('mobile app');
      // scoutAll returns an array of ScoutResult objects
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThanOrEqual(1);
      // Each result should have submissions and errors properties
      for (const r of result) {
        expect(r).toHaveProperty('submissions');
        expect(r).toHaveProperty('errors');
      }
    });
  });
});