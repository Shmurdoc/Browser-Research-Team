// ============================================================
// Input Validation Tests
// ============================================================

import { describe, it, expect } from 'vitest';
import { PatternQuerySchema, SubmitPatternSchema, CodeGenRequestSchema, FeedbackSchema } from '../dist/src/validation/schemas.js';
import { sanitizeXSS, sanitizeSQLInjection, sanitizePathTraversal, sanitizeURL } from '../dist/src/validation/sanitize.js';

describe('Zod Validation Schemas', () => {
  describe('PatternQuerySchema', () => {
    it('should accept valid query with text only', () => {
      const result = PatternQuerySchema.safeParse({ text: 'dashboard' });
      expect(result.success).toBe(true);
    });

    it('should accept valid query with all fields', () => {
      const result = PatternQuerySchema.safeParse({
        text: 'dark mode dashboard',
        source: 'pinterest',
        layoutType: 'dashboard',
        framework: 'react',
        minQuality: 5,
        limit: 10,
        offset: 0,
        components: ['card', 'button'],
        tags: ['modern'],
      });
      expect(result.success).toBe(true);
    });

    it('should reject query with text shorter than 2 characters', () => {
      const result = PatternQuerySchema.safeParse({ text: 'a' });
      expect(result.success).toBe(false);
    });

    it('should accept empty text (optional)', () => {
      const result = PatternQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should reject invalid source', () => {
      const result = PatternQuerySchema.safeParse({ text: 'test', source: 'invalid-source' });
      expect(result.success).toBe(false);
    });

    it('should reject invalid framework', () => {
      const result = PatternQuerySchema.safeParse({ text: 'test', framework: 'invalid' as any });
      expect(result.success).toBe(false);
    });

    it('should reject minQuality below 0', () => {
      const result = PatternQuerySchema.safeParse({ text: 'test', minQuality: -1 });
      expect(result.success).toBe(false);
    });

    it('should reject minQuality above 10', () => {
      const result = PatternQuerySchema.safeParse({ text: 'test', minQuality: 11 });
      expect(result.success).toBe(false);
    });

    it('should reject limit below 1', () => {
      const result = PatternQuerySchema.safeParse({ text: 'test', limit: 0 });
      expect(result.success).toBe(false);
    });

    it('should reject limit above 100', () => {
      const result = PatternQuerySchema.safeParse({ text: 'test', limit: 101 });
      expect(result.success).toBe(false);
    });

    it('should reject negative offset', () => {
      const result = PatternQuerySchema.safeParse({ text: 'test', offset: -1 });
      expect(result.success).toBe(false);
    });
  });

  describe('SubmitPatternSchema', () => {
    it('should accept valid submission', () => {
      const result = SubmitPatternSchema.safeParse({
        source: 'pinterest',
        url: 'https://example.com/pattern',
        title: 'Test Pattern',
        description: 'A test description',
        tags: ['test'],
        imageUrl: 'https://example.com/image.png',
      });
      expect(result.success).toBe(true);
    });

    it('should accept submission with optional fields omitted', () => {
      const result = SubmitPatternSchema.safeParse({
        source: 'manual',
        url: 'https://example.com/pattern',
        title: 'Minimal Pattern',
      });
      expect(result.success).toBe(true);
    });

    it('should reject without required source', () => {
      const result = SubmitPatternSchema.safeParse({
        url: 'https://example.com',
        title: 'No source',
      });
      expect(result.success).toBe(false);
    });

    it('should reject without url', () => {
      const result = SubmitPatternSchema.safeParse({
        source: 'manual',
        title: 'No URL',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid url', () => {
      const result = SubmitPatternSchema.safeParse({
        source: 'manual',
        url: 'not-a-url',
        title: 'Bad URL',
      });
      expect(result.success).toBe(false);
    });

    it('should reject title longer than 200 characters', () => {
      const result = SubmitPatternSchema.safeParse({
        source: 'manual',
        url: 'https://example.com',
        title: 'a'.repeat(201),
      });
      expect(result.success).toBe(false);
    });

    it('should reject description longer than 1000 characters', () => {
      const result = SubmitPatternSchema.safeParse({
        source: 'manual',
        url: 'https://example.com',
        title: 'Test',
        description: 'a'.repeat(1001),
      });
      expect(result.success).toBe(false);
    });

    it('should accept valid source enum values', () => {
      const sources = ['pinterest', 'dribbble', 'behance', 'figma-community', 'web', 'manual', 'api'];
      for (const source of sources) {
        const result = SubmitPatternSchema.safeParse({ source: source as any, url: 'https://example.com', title: 'Test' });
        expect(result.success, `Source ${source} should be valid`).toBe(true);
      }
    });
  });

  describe('CodeGenRequestSchema', () => {
    it('should accept valid code gen request with all fields', () => {
      const result = CodeGenRequestSchema.safeParse({
        patternId: 'pat_abc123',
        framework: 'react',
        style: 'tailwind',
        options: { typescript: true, includeTests: false },
      });
      expect(result.success).toBe(true);
    });

    it('should accept code gen request with required fields only', () => {
      const result = CodeGenRequestSchema.safeParse({
        patternId: 'pat_abc123',
        framework: 'react',
        style: 'tailwind',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty patternId', () => {
      const result = CodeGenRequestSchema.safeParse({ patternId: '', framework: 'react', style: 'tailwind' });
      expect(result.success).toBe(false);
    });

    it('should reject invalid framework', () => {
      const result = CodeGenRequestSchema.safeParse({ patternId: 'pat_123', framework: 'invalid' as any, style: 'tailwind' });
      expect(result.success).toBe(false);
    });

    it('should reject invalid style', () => {
      const result = CodeGenRequestSchema.safeParse({ patternId: 'pat_123', framework: 'react', style: 'invalid-style' as any });
      expect(result.success).toBe(false);
    });

    it('should accept all valid frameworks', () => {
      ['react', 'vue', 'svelte', 'angular', 'vanilla', 'unknown'].forEach(fw => {
        const result = CodeGenRequestSchema.safeParse({ patternId: 'pat_123', framework: fw as any, style: 'tailwind' });
        expect(result.success, `Framework ${fw} should be valid`).toBe(true);
      });
    });

    it('should accept all valid styles', () => {
      ['tailwind', 'css-modules', 'styled-components', 'vanilla-css'].forEach(style => {
        const result = CodeGenRequestSchema.safeParse({ patternId: 'pat_123', framework: 'react', style: style as any });
        expect(result.success, `Style ${style} should be valid`).toBe(true);
      });
    });

    it('should validate options types correctly', () => {
      const result = CodeGenRequestSchema.safeParse({
        patternId: 'pat_123',
        framework: 'react',
        style: 'tailwind',
        options: { typescript: true, includeTests: true, includeStories: false },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('FeedbackSchema', () => {
    it('should accept valid feedback', () => {
      const result = FeedbackSchema.safeParse({
        patternId: 'pat_abc123',
        rating: 4,
        tags: ['good', 'clean'],
        comment: 'Nice pattern',
      });
      expect(result.success).toBe(true);
    });

    it('should accept minimal feedback (only required fields)', () => {
      const result = FeedbackSchema.safeParse({
        patternId: 'pat_abc123',
        rating: 3,
      });
      expect(result.success).toBe(true);
    });

    it('should reject rating below 1', () => {
      const result = FeedbackSchema.safeParse({ patternId: 'pat_123', rating: 0 });
      expect(result.success).toBe(false);
    });

    it('should reject rating above 5', () => {
      const result = FeedbackSchema.safeParse({ patternId: 'pat_123', rating: 6 });
      expect(result.success).toBe(false);
    });

    it('should reject empty patternId', () => {
      const result = FeedbackSchema.safeParse({ patternId: '', rating: 3 });
      expect(result.success).toBe(false);
    });

    it('should reject comment exceeding 500 characters', () => {
      const result = FeedbackSchema.safeParse({
        patternId: 'pat_123',
        rating: 4,
        comment: 'a'.repeat(501),
      });
      expect(result.success).toBe(false);
    });

    it('should accept comment at exactly 500 characters', () => {
      const result = FeedbackSchema.safeParse({
        patternId: 'pat_123',
        rating: 4,
        comment: 'a'.repeat(500),
      });
      expect(result.success).toBe(true);
    });
  });
});

describe('Sanitization Functions', () => {
  describe('sanitizeXSS', () => {
    it('should escape script tags to prevent XSS', () => {
      const result = sanitizeXSS('<script>alert("xss")</script>');
      // New implementation escapes all HTML characters — tags become safe text
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('</script>');
      expect(result).toContain('&lt;');
      expect(result).toContain('&gt;');
    });

    it('should remove iframe tags', () => {
      const result = sanitizeXSS('<iframe src="evil.com"></iframe>');
      expect(result).not.toContain('<iframe');
    });

    it('should escape HTML entities for safe text', () => {
      const result = sanitizeXSS('<b>bold</b>');
      // New implementation escapes < > / and other dangerous characters
      expect(result).toContain('&lt;');
      expect(result).toContain('&gt;');
      expect(result).toContain('b');
      expect(result).toContain('bold');
    });

    it('should handle empty string', () => {
      const result = sanitizeXSS('');
      expect(result).toBe('');
    });

    it('should escape quotes to prevent attribute injection', () => {
      const result = sanitizeXSS('<img src="x" onerror="alert(1)">');
      // sanitizeXSS escapes double quotes and angle brackets
      expect(result).toContain('&quot;');
      expect(result).toContain('&lt;');
      expect(result).toContain('&gt;');
    });

    it('should preserve plain text content', () => {
      const result = sanitizeXSS('Hello World');
      expect(result).toBe('Hello World');
    });
  });

  describe('sanitizeSQLInjection', () => {
    it('should escape single quotes by doubling them', () => {
      const result = sanitizeSQLInjection("test'value");
      expect(result).toBe("test''value");
    });

    it('should remove semicolons', () => {
      const result = sanitizeSQLInjection("test; DROP TABLE users");
      expect(result).not.toContain(';');
    });

    it('should remove SQL comment markers --', () => {
      const result = sanitizeSQLInjection("test -- comment");
      expect(result).not.toContain('--');
    });

    it('should remove block comments /* */', () => {
      const result = sanitizeSQLInjection("test /* comment */");
      expect(result).not.toContain('/*');
      expect(result).not.toContain('*/');
    });

    it('should preserve normal text', () => {
      const result = sanitizeSQLInjection('Hello World');
      expect(result).toBe('Hello World');
    });

    it('should handle empty string', () => {
      const result = sanitizeSQLInjection('');
      expect(result).toBe('');
    });
  });

  describe('sanitizePathTraversal', () => {
    const baseDir = '/safe/base';

    it('should block ../../../etc/passwd traversal', () => {
      expect(() => sanitizePathTraversal('../../../etc/passwd', baseDir)).toThrow('Path traversal detected');
    });

    it('should block ..\\..\\ traversal patterns', () => {
      expect(() => sanitizePathTraversal('..\\..\\windows\\system32', baseDir)).toThrow('Path traversal detected');
    });

    it('should allow safe relative path within base', () => {
      const result = sanitizePathTraversal('subdir/file.txt', baseDir);
      expect(result).toContain('file.txt');
    });

    it('should handle empty string', () => {
      const result = sanitizePathTraversal('', baseDir);
      expect(result).toBe('');
    });

    it('should block absolute path outside base', () => {
      expect(() => sanitizePathTraversal('/etc/passwd', baseDir)).toThrow('Path traversal detected');
    });
  });

  describe('sanitizeURL', () => {
    it('should return empty string for javascript: URLs', () => {
      const url = 'javascript:alert(1)';
      const result = sanitizeURL(url);
      expect(result).toBe('');
    });

    it('should return empty string for data: URLs', () => {
      const result = sanitizeURL('data:text/html,<script>alert(1)</script>');
      expect(result).toBe('');
    });

    it('should return empty string for vbscript: URLs', () => {
      const result = sanitizeURL('vbscript:alert(1)');
      expect(result).toBe('');
    });

    it('should preserve valid URLs', () => {
      const url = 'https://example.com/path?query=value';
      const result = sanitizeURL(url);
      expect(result).toBe(url);
    });

    it('should handle empty string', () => {
      const result = sanitizeURL('');
      expect(result).toBe('');
    });

    it('should preserve normal URLs with paths', () => {
      const url = 'https://github.com/user/repo/blob/main/readme.md';
      const result = sanitizeURL(url);
      expect(result).toBe(url);
    });
  });
});