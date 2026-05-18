// ============================================================
// Input Validation Utilities
// ============================================================

import { ZodError, z } from 'zod';
import { ValidationError } from '../errors/index.js';
import { createLogger_Scoped } from '../logging/index.js';
import { sanitizeXSS, sanitizeSQLInjection, sanitizePathTraversal, sanitizeURL, sanitizeObject, sanitizePromptInjection } from './sanitize.js';

const logger = createLogger_Scoped('validation');

export { sanitizeXSS, sanitizeSQLInjection, sanitizePathTraversal, sanitizeURL, sanitizeObject, sanitizePromptInjection };

/**
 * Validate input using a Zod schema and throw ValidationError if invalid
 */
export function validate<T>(
  data: unknown,
  schema: z.ZodSchema<T>,
  context?: string
): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
      logger.warn({ context, issues }, 'Validation failed');
      throw new ValidationError(
        `Invalid input${context ? ` for ${context}` : ''}: ${issues}`,
        { context, issues: error.errors }
      );
    }
    throw new ValidationError(
      `Validation error: ${error instanceof Error ? error.message : String(error)}`,
      { context, error }
    );
  }
}

/**
 * Validate input and return null on error (for CLI usage)
 */
export function validateSafe<T>(
  data: unknown,
  schema: z.ZodSchema<T>,
  context?: string
): { data: T; error: null } | { data: null; error: ValidationError } {
  try {
    return { data: schema.parse(data), error: null };
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
      logger.warn({ context, issues }, 'Validation failed');
      return {
        data: null,
        error: new ValidationError(
          `Invalid input${context ? ` for ${context}` : ''}: ${issues}`,
          { context, issues: error.errors }
        ),
      };
    }
    return {
      data: null,
      error: new ValidationError(
        `Validation error: ${error instanceof Error ? error.message : String(error)}`,
        { context }
      ),
    };
  }
}

/**
 * Format validation errors for user display
 */
export function formatValidationError(error: ValidationError): string {
  return error.message.replace(/^Invalid input: /, '').trim();
}
