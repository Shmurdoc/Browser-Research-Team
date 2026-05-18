// ============================================================
// Error Metrics + Observability — Production Monitoring
// ============================================================
//
// Collects error metrics, success rates, latency data.
// Provides observability hooks for monitoring systems.
// Tracks per-source and per-operation metrics.
// ============================================================

import { createLogger_Scoped } from './index.js';

const logger = createLogger_Scoped('metrics');

// Metric types
export interface ErrorMetric {
  error: string;
  code?: string;
  source?: string;
  operation?: string;
  count: number;
  lastOccurred: number;
}

export interface LatencyMetric {
  operation: string;
  p50: number;
  p95: number;
  p99: number;
  average: number;
  count: number;
}

export interface SourceMetric {
  source: string;
  totalRequests: number;
  successCount: number;
  failureCount: number;
  averageResponseTimeMs: number;
  submissionCount: number;
  filteredCount: number;
}

// Global metrics store
const metrics = {
  errors: new Map<string, ErrorMetric>(),
  latencies: new Map<string, number[]>(), // operation → array of latencies
  sources: new Map<string, SourceMetric>(),
  operationCounts: new Map<string, number>(),
  startTime: Date.now(),
};

/**
 * Record an error occurrence
 */
export function recordError(
  error: string | Error,
  context?: {
    code?: string;
    source?: string;
    operation?: string;
  }
): void {
  const message = error instanceof Error ? error.message : String(error);
  const key = `${context?.source || 'unknown'}:${context?.operation || 'unknown'}:${message}`;

  const existing = metrics.errors.get(key) || {
    error: message,
    code: context?.code,
    source: context?.source,
    operation: context?.operation,
    count: 0,
    lastOccurred: 0,
  };

  existing.count++;
  existing.lastOccurred = Date.now();

  metrics.errors.set(key, existing);

  logger.debug(
    {
      error: message,
      code: context?.code,
      source: context?.source,
      operation: context?.operation,
      totalOccurrences: existing.count,
    },
    'Error recorded'
  );
}

/**
 * Record operation latency
 */
export function recordLatency(operation: string, durationMs: number): void {
  if (!metrics.latencies.has(operation)) {
    metrics.latencies.set(operation, []);
  }

  const latencies = metrics.latencies.get(operation)!;
  latencies.push(durationMs);

  // Keep only last 1000 measurements to avoid memory bloat
  if (latencies.length > 1000) {
    latencies.shift();
  }

  logger.debug(
    {
      operation,
      durationMs,
      avgMs: Math.round(getAverageLatency(operation)),
    },
    'Latency recorded'
  );
}

/**
 * Record scout source metrics
 */
export function recordSourceMetric(
  source: string,
  options: {
    success: boolean;
    responseTimeMs: number;
    submissionCount?: number;
    filteredCount?: number;
  }
): void {
  const existing = metrics.sources.get(source) || {
    source,
    totalRequests: 0,
    successCount: 0,
    failureCount: 0,
    averageResponseTimeMs: 0,
    submissionCount: 0,
    filteredCount: 0,
  };

  existing.totalRequests++;

  if (options.success) {
    existing.successCount++;
  } else {
    existing.failureCount++;
  }

  // Update rolling average
  const prevAvg = existing.averageResponseTimeMs;
  const newTotal = prevAvg * (existing.totalRequests - 1) + options.responseTimeMs;
  existing.averageResponseTimeMs = Math.round(newTotal / existing.totalRequests);

  if (options.submissionCount !== undefined) {
    existing.submissionCount += options.submissionCount;
  }

  if (options.filteredCount !== undefined) {
    existing.filteredCount += options.filteredCount;
  }

  metrics.sources.set(source, existing);

  logger.debug(
    {
      ...existing,
      successRate: `${Math.round((existing.successCount / existing.totalRequests) * 100)}%`,
    },
    'Source metric recorded'
  );
}

/**
 * Get percentile latency for an operation
 */
function getPercentileLatency(operation: string, percentile: number): number {
  const latencies = metrics.latencies.get(operation) || [];
  if (latencies.length === 0) return 0;

  const sorted = [...latencies].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Get average latency for an operation
 */
function getAverageLatency(operation: string): number {
  const latencies = metrics.latencies.get(operation) || [];
  if (latencies.length === 0) return 0;
  return latencies.reduce((a, b) => a + b, 0) / latencies.length;
}

/**
 * Get latency metrics for an operation
 */
export function getLatencyMetrics(operation: string): LatencyMetric {
  const latencies = metrics.latencies.get(operation) || [];

  return {
    operation,
    p50: getPercentileLatency(operation, 50),
    p95: getPercentileLatency(operation, 95),
    p99: getPercentileLatency(operation, 99),
    average: getAverageLatency(operation),
    count: latencies.length,
  };
}

/**
 * Get all error metrics
 */
export function getErrorMetrics(): ErrorMetric[] {
  return Array.from(metrics.errors.values()).sort((a, b) => b.count - a.count);
}

/**
 * Get all source metrics
 */
export function getSourceMetrics(): SourceMetric[] {
  return Array.from(metrics.sources.values());
}

/**
 * Get overall system health metrics
 */
export function getHealthMetrics() {
  const totalErrors = Array.from(metrics.errors.values()).reduce((sum, m) => sum + m.count, 0);
  const totalOperations = Array.from(metrics.operationCounts.values()).reduce((sum, c) => sum + c, 0);
  const uptime = Date.now() - metrics.startTime;

  const sourceMetrics = getSourceMetrics();
  const totalSourceRequests = sourceMetrics.reduce((sum, m) => sum + m.totalRequests, 0);
  const totalSourceSuccesses = sourceMetrics.reduce((sum, m) => sum + m.successCount, 0);
  const sourceSuccessRate =
    totalSourceRequests > 0 ? Math.round((totalSourceSuccesses / totalSourceRequests) * 100) : 0;

  return {
    uptime,
    uptimeHours: Math.round(uptime / 3600000),
    totalErrors,
    totalOperations,
    errorRate: totalOperations > 0 ? Math.round((totalErrors / totalOperations) * 100) : 0,
    sourceSuccessRate,
    sources: sourceMetrics.length,
    avgSourceQuality:
      sourceMetrics.length > 0
        ? Math.round(
            sourceMetrics.reduce((sum, s) => sum + (s.successCount / s.totalRequests || 0), 0) /
              sourceMetrics.length *
              100
          )
        : 0,
  };
}

/**
 * Clear all metrics (for testing)
 */
export function clearMetrics(): void {
  metrics.errors.clear();
  metrics.latencies.clear();
  metrics.sources.clear();
  metrics.operationCounts.clear();
  metrics.startTime = Date.now();
  logger.info('Metrics cleared');
}

/**
 * Export metrics as JSON
 */
export function exportMetrics() {
  return {
    snapshot: new Date().toISOString(),
    health: getHealthMetrics(),
    errors: getErrorMetrics(),
    sources: getSourceMetrics(),
    operations: Array.from(metrics.operationCounts.entries()).map(([op, count]) => ({
      operation: op,
      count,
      latency: getLatencyMetrics(op),
    })),
  };
}

/**
 * Format metrics for logging
 */
export function formatMetricsSummary(): string {
  const health = getHealthMetrics();
  const errors = getErrorMetrics();
  const topError = errors[0];

  return `
📊 System Health:
  • Uptime: ${health.uptimeHours}h
  • Total Errors: ${health.totalErrors}
  • Error Rate: ${health.errorRate}%
  • Source Success Rate: ${health.sourceSuccessRate}%
  • Avg Quality: ${health.avgSourceQuality}%

🔴 Top Error: ${topError ? `${topError.error} (${topError.count}x)` : 'None'}

📈 Operations: ${health.totalOperations}
`.trim();
}

logger.info('Metrics system initialized');
