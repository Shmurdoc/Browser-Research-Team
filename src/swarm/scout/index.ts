// ============================================================
// Scout Swarm — Internet Research Agents
// ============================================================
//
// Discovers design patterns from multiple internet sources.
// Each scout agent queries a specific platform and returns
// raw pattern data for processing.
// ============================================================

import { type PatternSource, type PatternSubmission, type PatternId } from '../../types.js';
import { ScoutError } from '../../errors/index.js';
import { retry, type RetryConfig } from '../../utils/retry.js';
import { createLogger_Scoped } from '../../logging/index.js';
import { scoutPinterest } from './pinterest.js';
import { scoutDribbble } from './dribbble.js';
import { scoutBehance } from './behance.js';
import { scoutFigma } from './figma.js';

const logger = createLogger_Scoped('scout:orchestrator');

export interface ScoutResult {
  source: PatternSource;
  submissions: PatternSubmission[];
  errors: string[];
  tookMs: number;
}

/** Default retry configuration for scouts */
const SCOUT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 500,
  multiplier: 2,
  maxDelayMs: 5000,
  jitterFraction: 0.1,
  onRetry: (attempt, delay, error) => {
    logger.debug(
      { attempt, delay, error: error.message },
      'Scout retry attempt'
    );
  },
};

/** Run all scouts for a given query */
export async function scoutAll(query: string): Promise<ScoutResult[]> {
  logger.info({ query }, 'Running all scouts in parallel');

  const results = await Promise.allSettled([
    scoutWithRetry(query, 'pinterest', scoutPinterest),
    scoutWithRetry(query, 'dribbble', scoutDribbble),
    scoutWithRetry(query, 'behance', scoutBehance),
    scoutWithRetry(query, 'figma-community', scoutFigma),
  ]);

  const scoutResults = results.map((r, i) => {
    const sources: PatternSource[] = ['pinterest', 'dribbble', 'behance', 'figma-community'];
    if (r.status === 'fulfilled') return r.value;
    
    const error = r.reason;
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.warn(
      { source: sources[i], error: errorMsg },
      `Scout ${sources[i]} failed`
    );
    return {
      source: sources[i],
      submissions: [],
      errors: [errorMsg ?? 'Unknown scout error'],
      tookMs: 0,
    };
  });

  const totalSubmissions = scoutResults.reduce((sum, r) => sum + r.submissions.length, 0);
  logger.info({ total: totalSubmissions, sources: scoutResults.length }, 'All scouts completed');

  return scoutResults;
}

/**
 * Wrap a scout function with retry logic and error handling
 */
async function scoutWithRetry(
  query: string,
  source: PatternSource,
  scoutFn: (q: string) => Promise<ScoutResult>
): Promise<ScoutResult> {
  try {
    const result = await retry(
      () => scoutFn(query),
      SCOUT_RETRY_CONFIG
    );
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      { source, query, error: message },
      `Scout ${source} failed after retries`
    );
    throw new ScoutError(
      `Scout ${source} failed after retries: ${message}`,
      { source, query }
    );
  }
}

/** Run a specific scout by source type */
export async function scoutSource(
  source: PatternSource,
  query: string
): Promise<ScoutResult> {
  const scouts: Record<PatternSource, ((q: string) => Promise<ScoutResult>) | null> = {
    pinterest: scoutPinterest,
    dribbble: scoutDribbble,
    behance: scoutBehance,
    'figma-community': scoutFigma,
    web: null,
    manual: null,
    api: null,
  };

  const scout = scouts[source];
  if (!scout) {
    return {
      source,
      submissions: [],
      errors: [`Scout for source "${source}" is not implemented`],
      tookMs: 0,
    };
  }

  try {
    return await scoutWithRetry(query, source, scout);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      source,
      submissions: [],
      errors: [message],
      tookMs: 0,
    };
  }
}

export { scoutPinterest } from './pinterest.js';
export { scoutDribbble } from './dribbble.js';
export { scoutBehance } from './behance.js';
export { scoutFigma } from './figma.js';
