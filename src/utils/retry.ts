// ============================================================
// Retry with Exponential Backoff + Jitter
// ============================================================

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxAttempts?: number;          // Default: 3
  initialDelayMs?: number;       // Default: 500ms
  multiplier?: number;           // Default: 2x
  maxDelayMs?: number;           // Default: 10000ms
  jitterFraction?: number;       // Default: 0.1 (10%)
  onRetry?: (attempt: number, delay: number, error: Error) => void;
}

const DEFAULT_CONFIG: Required<RetryConfig> = {
  maxAttempts: 3,
  initialDelayMs: 500,
  multiplier: 2,
  maxDelayMs: 10000,
  jitterFraction: 0.1,
  onRetry: () => {},
};

/**
 * Calculates delay with exponential backoff and jitter
 */
function calculateDelay(
  attempt: number,
  config: Required<RetryConfig>
): number {
  const exponentialDelay = config.initialDelayMs * Math.pow(config.multiplier, attempt);
  const capped = Math.min(exponentialDelay, config.maxDelayMs);
  
  // Apply jitter: ±jitterFraction * delay
  const jitterRange = capped * config.jitterFraction;
  const jitter = (Math.random() - 0.5) * 2 * jitterRange;
  
  return Math.max(0, capped + jitter);
}

/**
 * Delays execution for a given number of milliseconds
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retries a function with exponential backoff and jitter
 * 
 * @param fn Function to retry
 * @param config Retry configuration
 * @returns Result of the function
 * @throws Last error if all retries fail
 * 
 * @example
 * const result = await retry(
 *   () => fetchData(),
 *   { maxAttempts: 3, initialDelayMs: 500 }
 * );
 */
export async function retry<T>(
  fn: () => Promise<T>,
  config?: RetryConfig
): Promise<T> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < finalConfig.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry if we've exhausted attempts
      if (attempt >= finalConfig.maxAttempts - 1) {
        break;
      }

      const delayMs = calculateDelay(attempt, finalConfig);
      finalConfig.onRetry(attempt + 1, delayMs, lastError);
      await delay(delayMs);
    }
  }

  throw lastError ?? new Error('Retry failed without error');
}

/**
 * Retries a function with timeout protection
 * 
 * @param fn Function to retry
 * @param timeoutMs Timeout for each attempt
 * @param config Retry configuration
 * @returns Result of the function
 * @throws TimeoutError if function exceeds timeout
 */
export async function retryWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  config?: RetryConfig
): Promise<T> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  async function withTimeout(): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Operation timed out after ${timeoutMs}ms`)),
          timeoutMs
        )
      ),
    ]);
  }

  return retry(withTimeout, config);
}
