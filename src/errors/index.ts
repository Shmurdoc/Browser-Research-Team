// ============================================================
// Custom Error Types for Design Pattern Multiverse
// ============================================================

/**
 * Base error for all DPM errors
 */
export class DPMError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'DPMError';
    Object.setPrototypeOf(this, DPMError.prototype);
  }
}

/**
 * Scout agent errors - when fetching from external sources fails
 */
export class ScoutError extends DPMError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'SCOUT_ERROR', context);
    this.name = 'ScoutError';
    Object.setPrototypeOf(this, ScoutError.prototype);
  }
}

/**
 * Vision agent errors - when CV analysis fails
 */
export class VisionError extends DPMError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'VISION_ERROR', context);
    this.name = 'VisionError';
    Object.setPrototypeOf(this, VisionError.prototype);
  }
}

/**
 * Storage errors - when file operations fail
 */
export class StorageError extends DPMError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'STORAGE_ERROR', context);
    this.name = 'StorageError';
    Object.setPrototypeOf(this, StorageError.prototype);
  }
}

/**
 * Validation errors - when input validation fails
 */
export class ValidationError extends DPMError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', context);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Consensus errors - when Raft voting fails
 */
export class ConsensusError extends DPMError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CONSENSUS_ERROR', context);
    this.name = 'ConsensusError';
    Object.setPrototypeOf(this, ConsensusError.prototype);
  }
}

/**
 * Timeout errors - when operations exceed time limits
 */
export class TimeoutError extends DPMError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'TIMEOUT_ERROR', context);
    this.name = 'TimeoutError';
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

/**
 * Rate limit errors - when hitting rate limits
 */
export class RateLimitError extends DPMError {
  constructor(message: string, retryAfter?: number) {
    const context: Record<string, unknown> = {};
    if (retryAfter !== undefined) {
      context.retryAfterMs = retryAfter;
    }
    super(message, 'RATE_LIMIT_ERROR', context);
    this.name = 'RateLimitError';
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}
