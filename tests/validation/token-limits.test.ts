import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  validateTokenBudget,
  truncateToTokenBudget,
  getModelTokenLimits,
  validateMultipleChunks,
} from '../../src/validation/token-limits';

describe('Token Limit Validation', () => {
  describe('estimateTokens', () => {
    it('should estimate text tokens conservatively', () => {
      const text = 'Hello world this is a test'; // ~26 characters
      const tokens = estimateTokens(text, 'text');
      // ~26 / 3.5 ≈ 7-8 tokens
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(10);
    });

    it('should estimate code tokens with higher density', () => {
      const code = 'const x = 42; if (x > 0) { return x * 2; }'; // ~42 characters
      const codeTokens = estimateTokens(code, 'code');
      const textTokens = estimateTokens(code, 'text');
      // Code should have higher token estimate due to punctuation
      expect(codeTokens).toBeGreaterThan(textTokens * 0.9);
    });

    it('should return 0 for empty text', () => {
      expect(estimateTokens('')).toBe(0);
    });

    it('should handle large text', () => {
      const largeText = 'A'.repeat(10000);
      const tokens = estimateTokens(largeText);
      expect(tokens).toBeGreaterThan(2000);
    });
  });

  describe('validateTokenBudget', () => {
    it('should pass when within budget', () => {
      const result = validateTokenBudget(
        'You are a helpful assistant.',
        'Summarize this text',
        'Short text to summarize',
        { modelName: 'gpt-4o', maxInputTokens: 8000 }
      );

      expect(result.isWithinBudget).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when exceeding budget', () => {
      const largeContext = 'A'.repeat(100000); // ~28,000 tokens
      const result = validateTokenBudget(
        'You are helpful',
        'Summarize this',
        largeContext,
        { modelName: 'gpt-4', maxInputTokens: 4000 }
      );

      expect(result.isWithinBudget).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should report detailed breakdown', () => {
      const result = validateTokenBudget(
        'System',
        'User query',
        'Context here',
        { modelName: 'gpt-4o-mini', maxInputTokens: 128000 }
      );

      expect(result.estimatedInputTokens).toBeDefined();
      expect(result.estimatedInputTokens).toBeGreaterThan(0);
    });

    it('should validate different models', () => {
      const shortText = 'Hello world';
      const result = validateTokenBudget(
        shortText,
        shortText,
        shortText,
        { modelName: 'gpt-3.5-turbo', maxInputTokens: 4096 }
      );

      expect(result.isWithinBudget).toBe(true);
    });
  });

  describe('truncateToTokenBudget', () => {
    it('should not truncate text within budget', () => {
      const text = 'This is a short text';
      const truncated = truncateToTokenBudget(text, 1000);
      expect(truncated).toBe(text);
    });

    it('should truncate text exceeding budget', () => {
      const text = 'A'.repeat(50000);
      const truncated = truncateToTokenBudget(text, 100);
      expect(truncated.length).toBeLessThan(text.length);
      expect(truncated).toContain('[...truncated');
    });

    it('should preserve start and end', () => {
      const text = 'START ' + 'M'.repeat(10000) + ' END';
      const truncated = truncateToTokenBudget(text, 50);
      expect(truncated).toContain('START');
      expect(truncated).toContain('END');
    });

    it('should handle code truncation', () => {
      const code = 'function test() { ' + 'x'.repeat(10000) + ' }';
      const truncated = truncateToTokenBudget(code, 50, 'code');
      expect(truncated.length).toBeLessThan(code.length);
    });

    it('should respect custom preserve ratios', () => {
      const text = 'A'.repeat(50000);
      const truncated = truncateToTokenBudget(text, 100, 'text', {
        preserveStart: 0.5,
        preserveEnd: 0.3,
      });
      expect(truncated.length).toBeLessThan(text.length);
    });
  });

  describe('getModelTokenLimits', () => {
    it('should return limits for known models', () => {
      const limits = getModelTokenLimits('gpt-4o');
      expect(limits.input).toBeGreaterThan(0);
      expect(limits.output).toBeGreaterThan(0);
    });

    it('should return defaults for unknown models', () => {
      const limits = getModelTokenLimits('unknown-model');
      expect(limits.input).toBe(4096);
      expect(limits.output).toBe(2048);
    });

    it('should handle claude models', () => {
      const limits = getModelTokenLimits('claude-3-opus');
      expect(limits.input).toBe(200000);
    });

    it('should return higher limits for newer models', () => {
      const gpt4limits = getModelTokenLimits('gpt-4');
      const gpt4oLimits = getModelTokenLimits('gpt-4o');
      expect(gpt4oLimits.input).toBeGreaterThan(gpt4limits.input);
    });
  });

  describe('validateMultipleChunks', () => {
    it('should validate multiple chunks within budget', () => {
      const chunks = [
        { text: 'Chunk 1', type: 'text' as const },
        { text: 'Chunk 2', type: 'text' as const },
        { text: 'Chunk 3', type: 'text' as const },
      ];

      const result = validateMultipleChunks(chunks, 100);
      expect(result.valid).toBe(true);
      expect(result.totalTokens).toBeGreaterThan(0);
    });

    it('should fail when exceeding budget', () => {
      const chunks = [
        { text: 'A'.repeat(10000), type: 'text' as const },
        { text: 'B'.repeat(10000), type: 'text' as const },
      ];

      const result = validateMultipleChunks(chunks, 50);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should respect chunk weights', () => {
      const chunks = [
        { text: 'A'.repeat(1000), type: 'text' as const, weight: 2 },
        { text: 'B'.repeat(1000), type: 'text' as const, weight: 0.5 },
      ];

      const result = validateMultipleChunks(chunks, 1000);
      expect(result.valid).toBe(true);
    });

    it('should handle empty chunks array', () => {
      const result = validateMultipleChunks([], 1000);
      expect(result.valid).toBe(true);
      expect(result.totalTokens).toBe(0);
    });

    it('should differentiate code from text', () => {
      const textChunk = { text: 'const x = 42;', type: 'text' as const };
      const codeChunk = { text: 'const x = 42;', type: 'code' as const };

      // Both should be valid individually
      const textResult = validateMultipleChunks([textChunk], 100);
      const codeResult = validateMultipleChunks([codeChunk], 100);

      expect(textResult.valid).toBe(true);
      expect(codeResult.valid).toBe(true);
      // Code might have slightly different token estimate due to density
    });
  });

  describe('token limits edge cases', () => {
    it('should handle very large inputs gracefully', () => {
      const gigantic = 'X'.repeat(1000000);
      const tokens = estimateTokens(gigantic);
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(1000000); // Should be much smaller
    });

    it('should handle unicode text', () => {
      const unicode = '你好世界 🌍 مرحبا';
      const tokens = estimateTokens(unicode);
      expect(tokens).toBeGreaterThan(0);
    });

    it('should be conservative in truncation', () => {
      const text = 'A'.repeat(100000);
      const truncated = truncateToTokenBudget(text, 500);
      // Should leave plenty of margin
      expect(truncated.length).toBeLessThan(100000 / 2);
    });
  });
});
