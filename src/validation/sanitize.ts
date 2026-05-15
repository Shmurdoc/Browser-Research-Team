// ============================================================
// Input Sanitization — XSS, SQL Injection, Path Traversal Prevention
// ============================================================

/**
 * Sanitize strings to prevent XSS attacks
 * Removes/escapes HTML tags and dangerous characters
 */
export function sanitizeXSS(input: string): string {
  if (!input) return '';
  
  // Remove script tags and content
  let result = input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove iframe tags
  result = result.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  
  // Escape HTML entities
  result = result
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
  
  return result;
}

/**
 * Prevent SQL injection - sanitize strings that might be used in SQL queries
 * NOTE: In practice, use parameterized queries instead!
 */
export function sanitizeSQLInjection(input: string): string {
  if (!input) return '';
  
  // Escape single quotes and semicolons
  return input
    .replace(/'/g, "''")
    .replace(/;/g, '')
    .replace(/--/g, '')
    .replace(/\/\*/g, '')
    .replace(/\*\//g, '');
}

/**
 * Prevent path traversal attacks
 * Removes .. and other path traversal sequences
 */
export function sanitizePathTraversal(input: string): string {
  if (!input) return '';
  
  // Remove path traversal patterns
  let result = input
    .replace(/\.\.\//g, '')
    .replace(/\.\./g, '')
    .replace(/\\\\../g, '')
    .replace(/\\\.\./, '');
  
  // Remove Windows UNC paths
  result = result.replace(/^\\\\[^\\]+\\[^\\]+/, '');
  
  // Remove absolute paths
  result = result.replace(/^[a-zA-Z]:[\\\/]/, '');
  result = result.replace(/^\//, '');
  
  return result;
}

/**
 * Sanitize URL to prevent javascript: and data: protocols
 */
export function sanitizeURL(input: string): string {
  if (!input) return '';
  
  const trimmed = input.trim().toLowerCase();
  
  // Block dangerous protocols
  if (trimmed.startsWith('javascript:') ||
      trimmed.startsWith('data:') ||
      trimmed.startsWith('vbscript:') ||
      trimmed.startsWith('file:')) {
    return '';
  }
  
  return input;
}

/**
 * Sanitize all user inputs comprehensively
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
  } else if (type === 'path') {
    result = sanitizePathTraversal(result);
  }
  
  return result;
}

/**
 * Sanitize an object recursively
 */
export function sanitizeObject<T extends Record<string, any>>(
  obj: T,
  allowedKeys?: Set<string>
): T {
  const result: any = {};
  
  for (const [key, value] of Object.entries(obj)) {
    // Skip keys not in allowlist if provided
    if (allowedKeys && !allowedKeys.has(key)) {
      continue;
    }
    
    if (typeof value === 'string') {
      result[key] = sanitizeXSS(value);
    } else if (Array.isArray(value)) {
      result[key] = value.map(v => typeof v === 'string' ? sanitizeXSS(v) : v);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeObject(value, allowedKeys);
    } else {
      result[key] = value;
    }
  }
  
  return result;
}
