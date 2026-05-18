// ============================================================
// Semantic Token Limit Validator — LLM Call Safety
// ============================================================
//
// Validates that LLM prompts + context don't exceed token limits.
// Estimates tokens using common heuristics (not precise, but safe).
// Prevents runaway costs and timeout errors from oversized requests.
// ============================================================

import { createLogger_Scoped } from '../logging/index.js';

const logger = createLogger_Scoped('validation:token-limits');

// Token estimation ratios (conservative to be safe)
const CHARS_PER_TOKEN = 3.5; // Average English characters per token
const WORDS_PER_TOKEN = 1.3; // Average English words per token
const CODE_CHARS_PER_TOKEN = 2.8; // Code has denser tokens

interface TokenBudget {
  modelName: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
  isWithinBudget: boolean;
  errors: string[];
}

/**
 * Estimate token count for text using character-based heuristic.
 * Conservative estimate to avoid exceeding limits.
 */
export function estimateTokens(text: string, type: 'text' | 'code' = 'text'): number {
  if (!text) return 0;

  // Special handling for code (more tokens per character)
  if (type === 'code') {
    return Math.ceil(text.length / CODE_CHARS_PER_TOKEN);
  }

  // For regular text, use character ratio (more conservative)
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Validate that a prompt + context fits within token limits.
 * Returns detailed budget report.
 */
export function validateTokenBudget(
  systemPrompt: string,
  userPrompt: string,
  context: string,
  options: {
    modelName: string;
    maxInputTokens?: number;
    maxOutputTokens?: number;
    contextType?: 'text' | 'code';
  }
): TokenBudget {
  const { modelName, maxInputTokens = 8000, maxOutputTokens = 4000, contextType = 'text' } = options;

  const systemTokens = estimateTokens(systemPrompt, 'text');
  const userTokens = estimateTokens(userPrompt, 'text');
  const contextTokens = estimateTokens(context, contextType);

  const totalInputTokens = systemTokens + userTokens + contextTokens;

  const errors: string[] = [];

  // Check input tokens
  if (totalInputTokens > maxInputTokens) {
    errors.push(
      `Input tokens exceed limit: ${totalInputTokens} > ${maxInputTokens}. ` +
      `System: ${systemTokens}, User: ${userTokens}, Context: ${contextTokens}`
    );
  }

  // Conservative check: ensure we have room for output
  if (totalInputTokens + maxOutputTokens > maxInputTokens * 1.2) {
    errors.push(
      `Not enough token budget for input + output: ${totalInputTokens} + ${maxOutputTokens} > ` +
      `${Math.floor(maxInputTokens * 1.2)}`
    );
  }

  const isWithinBudget = errors.length === 0 && totalInputTokens <= maxInputTokens;

  if (!isWithinBudget) {
    logger.warn(
      {
        modelName,
        systemTokens,
        userTokens,
        contextTokens,
        totalInputTokens,
        maxInputTokens,
        errors,
      },
      'Token budget exceeded'
    );
  } else {
    logger.debug(
      {
        modelName,
        systemTokens,
        userTokens,
        contextTokens,
        totalInputTokens,
        maxInputTokens,
        utilization: `${Math.round((totalInputTokens / maxInputTokens) * 100)}%`,
      },
      'Token budget check passed'
    );
  }

  return {
    modelName,
    maxInputTokens,
    maxOutputTokens,
    estimatedInputTokens: totalInputTokens,
    estimatedOutputTokens: maxOutputTokens,
    isWithinBudget,
    errors,
  };
}

/**
 * Truncate text to fit within token budget.
 * Preserves important parts: start, end, and any marked sections.
 */
export function truncateToTokenBudget(
  text: string,
  maxTokens: number,
  type: 'text' | 'code' = 'text',
  options?: { preserveStart?: number; preserveEnd?: number }
): string {
  const { preserveStart = 0.2, preserveEnd = 0.1 } = options || {};

  const estimatedTokens = estimateTokens(text, type);

  // If already within budget, no truncation needed
  if (estimatedTokens <= maxTokens) {
    return text;
  }

  // Calculate character limit based on token budget
  const tokensPerChar = type === 'code' ? CODE_CHARS_PER_TOKEN : CHARS_PER_TOKEN;
  const charLimit = Math.floor(maxTokens * tokensPerChar);

  // If text is shorter than character limit, return as-is
  if (text.length <= charLimit) {
    return text;
  }

  // Calculate preservation sizes
  const startChars = Math.floor(charLimit * preserveStart);
  const endChars = Math.floor(charLimit * preserveEnd);
  const middleChars = charLimit - startChars - endChars - 20; // -20 for "[...truncated...]"

  if (middleChars < 0) {
    // If budget is too small, just take start
    return text.slice(0, charLimit) + '\n[...truncated...]';
  }

  const start = text.slice(0, startChars);
  const middle = text.slice(Math.floor(text.length / 2) - Math.floor(middleChars / 2), Math.floor(text.length / 2) + Math.floor(middleChars / 2));
  const end = text.slice(-endChars);

  logger.debug(
    {
      originalLength: text.length,
      truncatedLength: start.length + middle.length + end.length + 20,
      estimatedTokens,
      maxTokens,
    },
    'Text truncated to fit token budget'
  );

  return `${start}\n[...truncated ${text.length - charLimit} chars...]\n${middle}\n${end}`;
}

/**
 * Get recommended token limits for common models.
 */
export function getModelTokenLimits(modelName: string): { input: number; output: number } {
  const limits: Record<string, { input: number; output: number }> = {
    'gpt-4o': { input: 128000, output: 4096 },
    'gpt-4o-mini': { input: 128000, output: 4096 },
    'gpt-4-turbo': { input: 128000, output: 4096 },
    'gpt-4': { input: 8192, output: 2048 },
    'gpt-3.5-turbo': { input: 4096, output: 2048 },
    'claude-3-opus': { input: 200000, output: 4096 },
    'claude-3-sonnet': { input: 200000, output: 4096 },
    'claude-3-haiku': { input: 200000, output: 4096 },
  };

  return limits[modelName] || { input: 4096, output: 2048 };
}

/**
 * Validate multiple text chunks against combined token budget.
 */
export function validateMultipleChunks(
  chunks: Array<{ text: string; type?: 'text' | 'code'; weight?: number }>,
  maxTotalTokens: number
): { valid: boolean; totalTokens: number; errors: string[] } {
  let totalTokens = 0;
  const errors: string[] = [];

  for (const chunk of chunks) {
    const type = chunk.type || 'text';
    const weight = chunk.weight || 1;
    const chunkTokens = Math.ceil(estimateTokens(chunk.text, type) * weight);

    totalTokens += chunkTokens;

    if (totalTokens > maxTotalTokens) {
      errors.push(
        `Token budget exceeded at chunk: total ${totalTokens} > max ${maxTotalTokens}`
      );
      break;
    }
  }

  const valid = errors.length === 0;

  if (!valid) {
    logger.warn(
      { totalTokens, maxTotalTokens, chunkCount: chunks.length, errors },
      'Multi-chunk token validation failed'
    );
  }

  return { valid, totalTokens, errors };
}
