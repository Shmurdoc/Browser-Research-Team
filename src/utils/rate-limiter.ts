// ============================================================
// Rate Limiter — Request Throttling & Backpressure
// ============================================================

import { RateLimitError } from '../errors/index.js';
import { createLogger_Scoped } from '../logging/index.js';

const logger = createLogger_Scoped('rate-limiter');

interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
}

interface RateLimitConfig {
  maxTokens: number;
  refillRate: number; // tokens per second
  retryAfterMs?: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxTokens: 100,
  refillRate: 1, // 1 token per second = 60 tokens per minute
  retryAfterMs: 60000,
};

/**
 * Token bucket rate limiter
 * Allows distributed rate limiting with per-API tracking
 */
class TokenBucketLimiter {
  private buckets: Map<string, RateLimitBucket> = new Map();
  private config: RateLimitConfig;

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if request is allowed (consumes 1 token if allowed)
   */
  isAllowed(key: string): boolean {
    const bucket = this.getOrCreateBucket(key);
    const now = Date.now();
    
    // Refill tokens based on elapsed time
    const elapsed = (now - bucket.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.config.refillRate;
    bucket.tokens = Math.min(
      bucket.tokens + tokensToAdd,
      this.config.maxTokens
    );
    bucket.lastRefill = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }
    return false;
  }

  /**
   * Check rate limit and throw if exceeded
   */
  check(key: string, retryAfterMs?: number): void {
    if (!this.isAllowed(key)) {
      const retryAfter = retryAfterMs ?? this.config.retryAfterMs;
      logger.warn(
        { key, retryAfterMs: retryAfter },
        'Rate limit exceeded'
      );
      throw new RateLimitError(
        `Rate limit exceeded for ${key}. Please retry after ${retryAfter}ms`,
        retryAfter
      );
    }
  }

  /**
   * Get remaining tokens for a key
   */
  remaining(key: string): number {
    const bucket = this.getOrCreateBucket(key);
    const now = Date.now();
    const elapsed = (now - bucket.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.config.refillRate;
    return Math.min(
      bucket.tokens + tokensToAdd,
      this.config.maxTokens
    );
  }

  private getOrCreateBucket(key: string): RateLimitBucket {
    if (!this.buckets.has(key)) {
      this.buckets.set(key, {
        tokens: this.config.maxTokens,
        lastRefill: Date.now(),
      });
    }
    return this.buckets.get(key)!;
  }
}

// Global rate limiters
const apiLimiter = new TokenBucketLimiter({
  maxTokens: parseInt(process.env.DPM_RATE_LIMIT_PER_MINUTE ?? '100'),
  refillRate: parseInt(process.env.DPM_RATE_LIMIT_PER_MINUTE ?? '100') / 60,
});

/**
 * Rate limit an API call
 */
export function rateLimitAPI(apiName: string): void {
  apiLimiter.check(`api:${apiName}`);
}

/**
 * Check if API call is allowed without throwing
 */
export function canCallAPI(apiName: string): boolean {
  return apiLimiter.isAllowed(`api:${apiName}`);
}

/**
 * Get remaining rate limit tokens for an API
 */
export function getRemainingTokens(apiName: string): number {
  return apiLimiter.remaining(`api:${apiName}`);
}

export function getRateLimiter(config?: Partial<RateLimitConfig>): TokenBucketLimiter {
  return new TokenBucketLimiter(config);
}
