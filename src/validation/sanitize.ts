// ============================================================
// Input Sanitization — XSS, SQL Injection, Path Traversal Prevention
// ============================================================
//
// Uses safe, non-regex approaches where possible to avoid ReDoS.
// Path traversal uses path.resolve() + prefix check instead of regex.
// ============================================================

import { resolve, normalize } from 'path';

/**
 * Sanitize strings to prevent XSS attacks.
 * Uses direct character replacement — NO regex to avoid ReDoS.
 */
export function sanitizeXSS(input: string): string {
  if (!input) return '';

  // Length limit to prevent abuse
  if (input.length > 10000) {
    input = input.slice(0, 10000);
  }

  // Direct character replacement — safe from ReDoS
  let result = '';
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    switch (char) {
      case '&': result += '&amp;'; break;
      case '<': result += '&lt;'; break;
      case '>': result += '&gt;'; break;
      case '"': result += '&quot;'; break;
      case "'": result += '&#x27;'; break;
      case '/': result += '&#x2F;'; break;
      case '`': result += '&#x60;'; break;
      case '=': result += '&#x3D;'; break;
      default: result += char;
    }
  }

  return result;
}

/**
 * Prevent SQL injection — escape dangerous characters.
 * NOTE: Always use parameterized queries in production.
 */
export function sanitizeSQLInjection(input: string): string {
  if (!input) return '';

  return input
    .replace(/'/g, "''")
    .replace(/;/g, '')
    .replace(/--/g, '')
    .replace(/\/\*/g, '')
    .replace(/\*\//g, '');
}

/**
 * Prevent path traversal using path.resolve() + prefix check.
 * This is the ONLY safe approach — regex-based checks are bypassable.
 */
export function sanitizePathTraversal(input: string, baseDir: string): string {
  if (!input) return '';

  // Resolve the full path
  const resolved = resolve(baseDir, normalize(input));
  const resolvedBase = resolve(baseDir);

  // Check that resolved path starts with base directory
  if (!resolved.startsWith(resolvedBase)) {
    throw new Error(`Path traversal detected: ${input}`);
  }

  return resolved;
}

/**
 * Extract just the filename from a path, stripping all directory components.
 * Safe against all traversal attempts.
 */
export function safeBasename(input: string): string {
  if (!input) return '';

  // Replace all path separators, then take only alphanumeric, hyphens, underscores, dots
  const stripped = input.replace(/[/\\]/g, '');
  return stripped.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 255);
}

/**
 * Sanitize URL to prevent javascript:, data:, and other dangerous protocols.
 */
export function sanitizeURL(input: string): string {
  if (!input) return '';

  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();

  // Block dangerous protocols
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('file:') ||
    lower.startsWith('blob:')
  ) {
    return '';
  }

  return trimmed;
}

/**
 * Sanitize all user inputs comprehensively.
 */
export function sanitizeInput(input: string, type: 'text' | 'url' | 'path' = 'text'): string {
  let result = input;

  // Always prevent XSS
  result = sanitizeXSS(result);

  // Always prevent SQL injection
  result = sanitizeSQLInjection(result);

  // Type-specific sanitization
  if (type === 'url') {
    result = sanitizeURL(result);
  }
  // Note: path sanitization requires baseDir — use sanitizePathTraversal directly

  return result;
}

/**
 * Sanitize an object recursively.
 */
export function sanitizeObject<T extends Record<string, unknown>>(
  obj: T,
  allowedKeys?: Set<string>
): T {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Skip keys not in allowlist if provided
    if (allowedKeys && !allowedKeys.has(key)) {
      continue;
    }

    // Prevent prototype pollution
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }

    if (typeof value === 'string') {
      result[key] = sanitizeXSS(value);
    } else if (Array.isArray(value)) {
      result[key] = value.map(v => typeof v === 'string' ? sanitizeXSS(v) : v);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeObject(value as Record<string, unknown>, allowedKeys);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}

/**
 * Sanitize input to prevent prompt injection attacks against LLM calls.
 * Detects and neutralizes common prompt injection patterns.
 */
export function sanitizePromptInjection(input: string): string {
  if (!input) return '';

  // Length limit
  if (input.length > 50000) {
    input = input.slice(0, 50000);
  }

  // Remove common prompt injection patterns
  const injectionPatterns = [
    /ignore\s+(all\s+)?(previous\s+)?instructions?/gi,
    /ignore\s+(all\s+)?(above\s+)?rules?/gi,
    /you\s+are\s+now\s+/gi,
    /system\s*:\s*/gi,
    /\[system\]/gi,
    /\[\/system\]/gi,
    /<\|system\|>/gi,
    /<\|\/system\|>/gi,
    /assistant\s*:\s*/gi,
    /user\s*:\s*/gi,
    /human\s*:\s*/gi,
    /ai\s*:\s*/gi,
    /###\s*instruction/gi,
    /###\s*response/gi,
    /###\s*end/gi,
    /\n\s*---\s*\n/g,
    /disregard\s+(all\s+)?(previous\s+)?/gi,
    /forget\s+(all\s+)?(previous\s+)?/gi,
    /override\s+(all\s+)?(previous\s+)?/gi,
    /bypass\s+(all\s+)?(security\s+)?/gi,
    /do\s+not\s+follow\s+(any\s+)?(previous\s+)?/gi,
  ];

  let result = input;
  for (const pattern of injectionPatterns) {
    result = result.replace(pattern, '[FILTERED]');
  }

  return result;
}
