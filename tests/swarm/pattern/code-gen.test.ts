// ============================================================
// Code Generation Tests
// ============================================================

import { describe, it, expect } from 'vitest';
import { generateCode } from '../../../dist/src/swarm/pattern/code-gen.js';
import { putPattern } from '../../../dist/src/storage/local.js';
import { createMockPattern } from '../../../tests/fixtures/patterns.js';

describe('Code Generation', () => {
  const mockPattern = createMockPattern({
    id: 'test-cg-pattern',
    title: 'Test Card',
    components: ['card', 'button'] as any,
  });

  const noMatchPattern = createMockPattern({
    id: 'test-cg-no-match',
    title: 'No Match',
    components: ['nonexistent-component'] as any,
  });

  beforeAll(async () => {
    await putPattern(mockPattern);
    await putPattern(noMatchPattern);
  });

  describe('generateCode', () => {
    it('should generate React components matching stored pattern components', async () => {
      const result = await generateCode({
        patternId: 'test-cg-pattern',
        framework: 'react',
        style: 'tailwind',
        options: { typescript: true },
      });

      expect(result.patternId).toBe('test-cg-pattern');
      expect(result.framework).toBe('react');
      expect(result.files.length).toBeGreaterThan(0);

      const filePaths = result.files.map(f => f.path);
      expect(filePaths.some(p => p.includes('Card'))).toBe(true);
      expect(filePaths.some(p => p.includes('Button'))).toBe(true);
      expect(filePaths.some(p => p.includes('Navbar'))).toBe(false);
      expect(filePaths.some(p => p.includes('Modal'))).toBe(false);
    });

    it('should generate Vue components when specified', async () => {
      const result = await generateCode({
        patternId: 'test-cg-pattern',
        framework: 'vue',
        style: 'tailwind',
        options: { typescript: true },
      });

      expect(result.framework).toBe('vue');
      const filePaths = result.files.map(f => f.path);
      expect(filePaths.some(p => p.endsWith('.vue'))).toBe(true);
    });

    it('should fallback to card component when none match templates', async () => {
      const result = await generateCode({
        patternId: 'test-cg-no-match',
        framework: 'react',
        style: 'tailwind',
        options: { typescript: true },
      });

      expect(result.files.length).toBeGreaterThanOrEqual(1);
      const filePaths = result.files.map(f => f.path);
      expect(filePaths.some(p => p.includes('Card'))).toBe(true);
    });

    it('should include test files when requested', async () => {
      const result = await generateCode({
        patternId: 'test-cg-pattern',
        framework: 'react',
        style: 'tailwind',
        options: { typescript: true, includeTests: true },
      });

      const testFiles = result.files.filter(f => f.path.includes('__tests__'));
      expect(testFiles.length).toBeGreaterThan(0);
    });

    it('should skip test files by default', async () => {
      const result = await generateCode({
        patternId: 'test-cg-pattern',
        framework: 'react',
        style: 'tailwind',
        options: { typescript: true },
      });

      const testFiles = result.files.filter(f => f.path.includes('__tests__'));
      expect(testFiles.length).toBe(0);
    });

    it('should generate valid JSX/TSX syntax', async () => {
      const result = await generateCode({
        patternId: 'test-cg-pattern',
        framework: 'react',
        style: 'tailwind',
        options: { typescript: true },
      });

      const cardFile = result.files.find(f => f.path.includes('Card'));
      expect(cardFile).toBeDefined();
      const content = cardFile?.content || '';
      expect(content).toContain('export function');
      expect(content).toContain('return');
    });

    it('should generate preview HTML', async () => {
      const result = await generateCode({
        patternId: 'test-cg-pattern',
        framework: 'react',
        style: 'tailwind',
        options: { typescript: true },
      });

      expect(result.preview).toBeDefined();
      expect(result.preview.length).toBeGreaterThan(0);
      expect(result.preview).toContain('Design Pattern Multiverse');
    });
  });
});