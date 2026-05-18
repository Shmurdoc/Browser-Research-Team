// ============================================================
// Scout Rate Limiter — Prevent API Abuse and IP Bans
// ============================================================
//
// Uses bottleneck to rate-limit scout requests:
// - Pinterest: 10 requests per 10 seconds (60 req/min)
// - Dribbble: 15 requests per 10 seconds (90 req/min)
// - Behance: 10 requests per 10 seconds (60 req/min)
// - Figma: 5 requests per 10 seconds (30 req/min)
//
// Prevents IP bans and respects API quotas.
// ============================================================

import Bottleneck from 'bottleneck';
import { createLogger_Scoped } from '../../logging/index.js';

const logger = createLogger_Scoped('scout:rate-limiter');

/** Rate limiter for Pinterest API */
export const pinterestLimiter = new Bottleneck({
  minTime: 1000, // Min time between requests: 1 second
  maxConcurrent: 2,
  reservoir: 10, // 10 requests
  reservoirRefreshAmount: 10,
  reservoirRefreshInterval: 10 * 1000, // per 10 seconds
});

/** Rate limiter for Dribbble API */
export const dribbbleLimiter = new Bottleneck({
  minTime: 667, // ~1.5 requests per second
  maxConcurrent: 2,
  reservoir: 15, // 15 requests
  reservoirRefreshAmount: 15,
  reservoirRefreshInterval: 10 * 1000, // per 10 seconds
});

/** Rate limiter for Behance API */
export const behanceLimiter = new Bottleneck({
  minTime: 1000, // Min time between requests: 1 second
  maxConcurrent: 2,
  reservoir: 10, // 10 requests
  reservoirRefreshAmount: 10,
  reservoirRefreshInterval: 10 * 1000, // per 10 seconds
});

/** Rate limiter for Figma API */
export const figmaLimiter = new Bottleneck({
  minTime: 2000, // Min time between requests: 2 seconds
  maxConcurrent: 1,
  reservoir: 5, // 5 requests
  reservoirRefreshAmount: 5,
  reservoirRefreshInterval: 10 * 1000, // per 10 seconds
});

// Set up event listeners for logging
[
  { name: 'Pinterest', limiter: pinterestLimiter },
  { name: 'Dribbble', limiter: dribbbleLimiter },
  { name: 'Behance', limiter: behanceLimiter },
  { name: 'Figma', limiter: figmaLimiter },
].forEach(({ name, limiter }) => {
  limiter.on('debug', (msg: string) => {
    logger.debug(`${name}: ${msg}`);
  });

  limiter.on('error', (error: Error) => {
    logger.error({ error: error.message, source: name }, 'Rate limiter error');
  });
});

/**
 * Wrap a scout function with rate limiting
 * Usage: const results = await withRateLimit(scoutFunction, pinterestLimiter);
 */
export async function withRateLimit<T>(
  fn: () => Promise<T>,
  limiter: Bottleneck
): Promise<T> {
  return limiter.schedule(fn);
}
