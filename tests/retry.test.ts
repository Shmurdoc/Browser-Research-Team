// ============================================================
// Retry Utility Tests
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { retry, retryWithTimeout } from '../dist/src/utils/retry.js';

describe('retry', () => {
  let mockFn: vi.Mock;

  beforeEach(() => {
    mockFn = vi.fn();
  });

  it('should succeed on first attempt when function succeeds', async () => {
    mockFn.mockResolvedValue('success');
    const result = await retry(() => mockFn());
    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and succeed', async () => {
    mockFn
      .mockRejectedValueOnce(new Error('first failure'))
      .mockRejectedValueOnce(new Error('second failure'))
      .mockResolvedValue('success');

    const result = await retry(() => mockFn(), { maxAttempts: 5 });
    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('should throw after exhausting all attempts', async () => {
    mockFn.mockRejectedValue(new Error('always fails'));
    await expect(
      retry(() => mockFn(), { maxAttempts: 3, initialDelayMs: 10 })
    ).rejects.toThrow('always fails');
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('should use exponential backoff with jitter', async () => {
    const delays: number[] = [];
    mockFn.mockRejectedValue(new Error('fail'));

    try {
      await retry(() => mockFn(), {
        maxAttempts: 4,
        initialDelayMs: 100,
        multiplier: 2,
        maxDelayMs: 10000,
        onRetry: (_, delay) => delays.push(delay),
      });
    } catch {
      // expected
    }

    expect(delays).toHaveLength(3);
    // First delay should be around 100ms (with jitter)
    expect(delays[0]).toBeGreaterThanOrEqual(80);
    expect(delays[0]).toBeLessThanOrEqual(120);
    // Second delay should be >= ~160ms
    expect(delays[1]).toBeGreaterThanOrEqual(150);
    // Third delay should be >= ~320ms
    expect(delays[2]).toBeGreaterThanOrEqual(300);
  });

  it('should respect maxDelayMs cap', async () => {
    const delays: number[] = [];
    mockFn.mockRejectedValue(new Error('fail'));

    try {
      await retry(() => mockFn(), {
        maxAttempts: 4,
        initialDelayMs: 5000,
        multiplier: 2,
        maxDelayMs: 8000,
        onRetry: (_, delay) => delays.push(delay),
      });
    } catch {
      // expected
    }

    // All delays should not significantly exceed maxDelayMs (allowing for jitter up to 10%)
    expect(delays.every(d => d <= 8800)).toBe(true);
    // First delay should be around initialDelayMs (with jitter)
    expect(delays[0]).toBeGreaterThanOrEqual(4500);
    expect(delays[0]).toBeLessThanOrEqual(5500);
  }, 30000); // Extended timeout for delay-based test

  it('should pass the error to onRetry callback', async () => {
    const errors: Error[] = [];
    mockFn.mockRejectedValue(new Error('test error'));

    try {
      await retry(() => mockFn(), {
        maxAttempts: 2,
        initialDelayMs: 10,
        onRetry: (_, __, error) => errors.push(error),
      });
    } catch {
      // expected
    }

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('test error');
  });

  it('should handle non-Error rejections', async () => {
    mockFn.mockRejectedValue('string error');
    await expect(
      retry(() => mockFn(), { maxAttempts: 2, initialDelayMs: 10 })
    ).rejects.toThrow('string error');
  });

  it('should accept default config when none provided', async () => {
    mockFn.mockResolvedValue('ok');
    const result = await retry(() => mockFn());
    expect(result).toBe('ok');
  });
});

describe('retryWithTimeout', () => {
  it('should succeed when function completes within timeout', async () => {
    const fn = async () => {
      return 'fast result';
    };
    const result = await retryWithTimeout(fn, 5000);
    expect(result).toBe('fast result');
  });

  it('should throw TimeoutError when function exceeds timeout', async () => {
    const slowFn = async () => {
      return new Promise((resolve) => setTimeout(() => resolve('late'), 200));
    };
    await expect(
      retryWithTimeout(slowFn, 50)
    ).rejects.toThrow(/timed out/i);
  });

  it('should retry timed-out attempts', async () => {
    let callCount = 0;
    const fn = async () => {
      callCount++;
      if (callCount < 3) {
        return new Promise((resolve) => setTimeout(() => resolve('late'), 200));
      }
      return 'fast result';
    };

    const result = await retryWithTimeout(fn, 50, { maxAttempts: 5, initialDelayMs: 10 });
    expect(result).toBe('fast result');
    expect(callCount).toBe(3);
  });
});