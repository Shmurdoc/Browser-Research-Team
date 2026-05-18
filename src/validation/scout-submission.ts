// ============================================================
// Scout Submission Validation — Safe Pattern Submission Processing
// ============================================================
//
// Validates scout submissions before processing to prevent:
// - Prompt injection via pattern titles/descriptions
// - Oversized payloads
// - Malicious URLs
// - Suspicious patterns that may indicate attacks
// ============================================================

import { type PatternSubmission } from '../types.js';
import { sanitizePromptInjection, sanitizeXSS } from './sanitize.js';
import { validateURL } from './url.js';
import { createLogger_Scoped } from '../logging/index.js';

const logger = createLogger_Scoped('validation:scout-submission');

// Configuration
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 50;
const MAX_URL_LENGTH = 2048;
const SUSPICIOUS_PATTERN_THRESHOLD = 0.5; // 50% suspicious indicators = reject

// Suspicious patterns that may indicate injection attempts
const SUSPICIOUS_INDICATORS = {
  'system_prompt_keywords': /\b(system\s*prompt|system\s*message|instructions|rules|constraints|guidelines|always|never|must|should|forbidden|allowed)\b/gi,
  'sql_injection_keywords': /\b(select|insert|update|delete|drop|create|alter|exec|execute|union|where|from|table|database|script)\b/gi,
  'shell_injection_keywords': /\b(bash|sh|powershell|cmd|rm\s+-rf|cat\s+\/etc|grep|sed|awk|wget|curl|nc|netcat|telnet)\b/gi,
  'control_sequences': /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,
  'excessive_special_chars': /[^\w\s\-.,;:!?()'"\n]/g,
};

interface ValidationResult {
  valid: boolean;
  errors: string[];
  sanitized?: PatternSubmission;
  suspicionScore: number;
}

/**
 * Validate a scout submission for safety and quality.
 * Returns validation result with sanitized version if valid.
 */
export function validateScoutSubmission(submission: PatternSubmission): ValidationResult {
  const errors: string[] = [];
  let suspicionScore = 0;

  // Check required fields
  if (!submission.url) {
    errors.push('Missing required field: url');
  }
  if (!submission.title) {
    errors.push('Missing required field: title');
  }

  // Validate URL
  if (submission.url) {
    if (!validateURL(submission.url)) {
      errors.push('Invalid URL: dangerous protocol or malformed');
      suspicionScore += 0.3;
    }
    if (submission.url.length > MAX_URL_LENGTH) {
      errors.push(`URL too long (max ${MAX_URL_LENGTH} chars)`);
      suspicionScore += 0.1;
    }
  }

  // Validate title
  if (submission.title) {
    if (submission.title.length > MAX_TITLE_LENGTH) {
      errors.push(`Title too long (max ${MAX_TITLE_LENGTH} chars)`);
      suspicionScore += 0.05;
    }

    const titleSuspicion = checkSuspiciousIndicators(submission.title);
    if (titleSuspicion > 0) {
      errors.push(`Suspicious content detected in title (score: ${titleSuspicion.toFixed(2)})`);
      suspicionScore += titleSuspicion * 0.3;
    }
  }

  // Validate description
  if (submission.description) {
    if (submission.description.length > MAX_DESCRIPTION_LENGTH) {
      errors.push(`Description too long (max ${MAX_DESCRIPTION_LENGTH} chars)`);
      suspicionScore += 0.05;
    }

    const descSuspicion = checkSuspiciousIndicators(submission.description);
    if (descSuspicion > 0) {
      errors.push(`Suspicious content detected in description (score: ${descSuspicion.toFixed(2)})`);
      suspicionScore += descSuspicion * 0.3;
    }
  }

  // Validate tags
  if (submission.tags && submission.tags.length > 0) {
    if (submission.tags.length > MAX_TAGS) {
      errors.push(`Too many tags (max ${MAX_TAGS})`);
      suspicionScore += 0.1;
    }

    for (const tag of submission.tags) {
      if (tag.length > MAX_TAG_LENGTH) {
        errors.push(`Tag too long: "${tag.slice(0, 20)}..." (max ${MAX_TAG_LENGTH} chars)`);
        suspicionScore += 0.05;
      }

      if (!/^[a-z0-9_-]+$/i.test(tag)) {
        errors.push(`Invalid tag format: "${tag}" (alphanumeric, hyphens, underscores only)`);
        suspicionScore += 0.1;
      }

      const tagSuspicion = checkSuspiciousIndicators(tag);
      if (tagSuspicion > 0.3) {
        errors.push(`Suspicious tag: "${tag}"`);
        suspicionScore += 0.1;
      }
    }
  }

  // Check source field
  const validSources = ['pinterest', 'dribbble', 'behance', 'figma-community', 'web', 'manual', 'api'];
  if (submission.source && !validSources.includes(submission.source)) {
    errors.push(`Invalid source: "${submission.source}"`);
    suspicionScore += 0.15;
  }

  // Reject if suspicion is too high
  if (suspicionScore >= SUSPICIOUS_PATTERN_THRESHOLD) {
    errors.push(`Overall suspicion score too high: ${suspicionScore.toFixed(2)} (threshold: ${SUSPICIOUS_PATTERN_THRESHOLD})`);
  }

  // If there are errors, return early
  if (errors.length > 0) {
    logger.warn(
      {
        source: submission.source,
        url: submission.url?.slice(0, 50),
        errors,
        suspicionScore: suspicionScore.toFixed(2),
      },
      'Scout submission validation failed'
    );
    return { valid: false, errors, suspicionScore };
  }

  // Sanitize the submission
  const sanitized: PatternSubmission = {
    ...submission,
    title: sanitizeXSS(sanitizePromptInjection(submission.title || '')),
    description: sanitizeXSS(sanitizePromptInjection(submission.description || '')),
    tags: (submission.tags || []).map(t => sanitizeXSS(t).toLowerCase()),
  };

  logger.debug(
    {
      source: submission.source,
      url: submission.url?.slice(0, 50),
      suspicionScore: suspicionScore.toFixed(2),
    },
    'Scout submission validation passed'
  );

  return { valid: true, errors: [], sanitized, suspicionScore };
}

/**
 * Check input for suspicious indicators related to injection attacks.
 * Returns a score from 0 (clean) to 1 (highly suspicious).
 */
function checkSuspiciousIndicators(input: string): number {
  if (!input) return 0;

  let suspicionScore = 0;
  let indicatorsFound = 0;

  // Check each pattern category
  for (const [category, pattern] of Object.entries(SUSPICIOUS_INDICATORS)) {
    if (category === 'control_sequences' || category === 'excessive_special_chars') {
      // For character-based patterns, count matches
      const matches = (input.match(pattern) || []).length;
      if (matches > 0) {
        indicatorsFound++;
        suspicionScore += Math.min(0.3, matches * 0.05);
      }
    } else {
      // For keyword patterns, check if any match
      if (pattern.test(input)) {
        indicatorsFound++;
        suspicionScore += 0.25;
      }
    }
  }

  // Normalize suspicion score
  return Math.min(1, suspicionScore);
}

/**
 * Batch validate multiple submissions, filtering out invalid ones.
 * Returns only valid, sanitized submissions.
 */
export function validateScoutSubmissions(
  submissions: PatternSubmission[]
): { valid: PatternSubmission[]; invalid: Array<{ submission: PatternSubmission; errors: string[] }> } {
  const valid: PatternSubmission[] = [];
  const invalid: Array<{ submission: PatternSubmission; errors: string[] }> = [];

  for (const submission of submissions) {
    const result = validateScoutSubmission(submission);
    if (result.valid && result.sanitized) {
      valid.push(result.sanitized);
    } else {
      invalid.push({ submission, errors: result.errors });
    }
  }

  if (invalid.length > 0) {
    logger.warn(
      { total: submissions.length, valid: valid.length, invalid: invalid.length },
      'Filtered out invalid submissions'
    );
  }

  return { valid, invalid };
}
