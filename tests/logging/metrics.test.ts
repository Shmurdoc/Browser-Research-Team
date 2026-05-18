import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordError,
  recordLatency,
  recordSourceMetric,
  getLatencyMetrics,
  getErrorMetrics,
  getSourceMetrics,
  getHealthMetrics,
  exportMetrics,
  clearMetrics,
} from '../../src/logging/metrics';

describe('Metrics System', () => {
  beforeEach(() => {
    clearMetrics();
  });

  describe('recordError', () => {
    it('should record and count errors', () => {
      recordError('Test error', { source: 'pinterest', operation: 'scout' });
      recordError('Test error', { source: 'pinterest', operation: 'scout' });

      const errors = getErrorMetrics();
      expect(errors).toHaveLength(1);
      expect(errors[0].count).toBe(2);
      expect(errors[0].error).toBe('Test error');
    });

    it('should track different errors separately', () => {
      recordError('Error 1', { source: 'pinterest' });
      recordError('Error 2', { source: 'dribbble' });

      const errors = getErrorMetrics();
      expect(errors).toHaveLength(2);
    });

    it('should update lastOccurred timestamp', () => {
      recordError('Error', { source: 'pinterest' });
      const errors1 = getErrorMetrics();
      const timestamp1 = errors1[0].lastOccurred;

      // Small delay
      const wait = new Promise(resolve => setTimeout(resolve, 10));
      return wait.then(() => {
        recordError('Error', { source: 'pinterest' });
        const errors2 = getErrorMetrics();
        expect(errors2[0].lastOccurred).toBeGreaterThanOrEqual(timestamp1);
      });
    });

    it('should handle Error objects', () => {
      const error = new Error('Test error');
      recordError(error, { source: 'pinterest' });

      const errors = getErrorMetrics();
      expect(errors[0].error).toBe('Test error');
    });
  });

  describe('recordLatency', () => {
    it('should record latencies', () => {
      recordLatency('scout', 100);
      recordLatency('scout', 200);
      recordLatency('scout', 300);

      const metrics = getLatencyMetrics('scout');
      expect(metrics.count).toBe(3);
      expect(metrics.average).toBeGreaterThan(0);
    });

    it('should calculate percentiles', () => {
      for (let i = 1; i <= 100; i++) {
        recordLatency('operation', i * 10);
      }

      const metrics = getLatencyMetrics('operation');
      expect(metrics.p50).toBeGreaterThan(0);
      expect(metrics.p95).toBeGreaterThan(metrics.p50);
      expect(metrics.p99).toBeGreaterThanOrEqual(metrics.p95);
    });

    it('should limit storage to 1000 measurements', () => {
      for (let i = 0; i < 1100; i++) {
        recordLatency('operation', i);
      }

      const metrics = getLatencyMetrics('operation');
      expect(metrics.count).toBeLessThanOrEqual(1001); // 1000 + 1 for the current measurement
    });

    it('should handle operations without data', () => {
      const metrics = getLatencyMetrics('nonexistent');
      expect(metrics.count).toBe(0);
      expect(metrics.average).toBe(0);
    });
  });

  describe('recordSourceMetric', () => {
    it('should record source metrics', () => {
      recordSourceMetric('pinterest', {
        success: true,
        responseTimeMs: 500,
        submissionCount: 10,
      });

      const sources = getSourceMetrics();
      expect(sources).toHaveLength(1);
      expect(sources[0].source).toBe('pinterest');
      expect(sources[0].successCount).toBe(1);
      expect(sources[0].submissionCount).toBe(10);
    });

    it('should track failures', () => {
      recordSourceMetric('pinterest', { success: true, responseTimeMs: 100 });
      recordSourceMetric('pinterest', { success: false, responseTimeMs: 200 });

      const sources = getSourceMetrics();
      expect(sources[0].totalRequests).toBe(2);
      expect(sources[0].successCount).toBe(1);
      expect(sources[0].failureCount).toBe(1);
    });

    it('should calculate rolling average response time', () => {
      recordSourceMetric('pinterest', { success: true, responseTimeMs: 100 });
      recordSourceMetric('pinterest', { success: true, responseTimeMs: 300 });

      const sources = getSourceMetrics();
      expect(sources[0].averageResponseTimeMs).toBe(200);
    });

    it('should track filtered submissions', () => {
      recordSourceMetric('pinterest', {
        success: true,
        responseTimeMs: 100,
        submissionCount: 10,
        filteredCount: 2,
      });

      const sources = getSourceMetrics();
      expect(sources[0].submissionCount).toBe(10);
      expect(sources[0].filteredCount).toBe(2);
    });
  });

  describe('getHealthMetrics', () => {
    it('should report overall health', () => {
      recordError('Error', { source: 'pinterest' });
      recordSourceMetric('pinterest', { success: true, responseTimeMs: 100 });
      recordSourceMetric('pinterest', { success: true, responseTimeMs: 100 });

      const health = getHealthMetrics();
      expect(health.totalErrors).toBeGreaterThan(0);
      expect(health.sourceSuccessRate).toBeGreaterThan(0);
      expect(health.uptimeHours).toBeGreaterThanOrEqual(0);
    });

    it('should calculate error rate', () => {
      recordSourceMetric('pinterest', { success: true, responseTimeMs: 100 });
      recordSourceMetric('pinterest', { success: false, responseTimeMs: 100 });

      const health = getHealthMetrics();
      expect(health.errorRate).toBeLessThanOrEqual(100);
    });

    it('should calculate average source quality', () => {
      recordSourceMetric('pinterest', { success: true, responseTimeMs: 100 });
      recordSourceMetric('dribbble', { success: true, responseTimeMs: 100 });

      const health = getHealthMetrics();
      expect(health.avgSourceQuality).toBeGreaterThan(0);
      expect(health.avgSourceQuality).toBeLessThanOrEqual(100);
    });

    it('should handle zero operations', () => {
      const health = getHealthMetrics();
      expect(health.totalOperations).toBe(0);
      expect(health.errorRate).toBe(0);
    });
  });

  describe('exportMetrics', () => {
    it('should export complete metrics snapshot', () => {
      recordError('Error', { source: 'pinterest' });
      recordLatency('scout', 100);
      recordSourceMetric('pinterest', { success: true, responseTimeMs: 100 });

      const exported = exportMetrics();
      expect(exported.snapshot).toBeDefined();
      expect(exported.health).toBeDefined();
      expect(exported.errors).toBeDefined();
      expect(exported.sources).toBeDefined();
      expect(exported.operations).toBeDefined();
    });

    it('should include ISO timestamp', () => {
      const exported = exportMetrics();
      expect(new Date(exported.snapshot)).not.toBeNaN();
    });
  });

  describe('clearMetrics', () => {
    it('should clear all metrics', () => {
      recordError('Error', { source: 'pinterest' });
      recordLatency('operation', 100);

      clearMetrics();

      const errors = getErrorMetrics();
      const health = getHealthMetrics();

      expect(errors).toHaveLength(0);
      expect(health.totalErrors).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle concurrent metric recording', async () => {
      const promises = [];

      for (let i = 0; i < 10; i++) {
        promises.push(
          Promise.resolve().then(() => {
            recordError(`Error ${i}`, { source: 'test' });
            recordLatency('operation', Math.random() * 1000);
            recordSourceMetric('test', { success: true, responseTimeMs: 100 });
          })
        );
      }

      await Promise.all(promises);

      const errors = getErrorMetrics();
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should handle large latency values', () => {
      recordLatency('slow_operation', 999999);
      recordLatency('slow_operation', 1000000);

      const metrics = getLatencyMetrics('slow_operation');
      expect(metrics.average).toBeGreaterThan(900000);
    });

    it('should handle negative durations gracefully', () => {
      recordLatency('operation', -100);
      const metrics = getLatencyMetrics('operation');
      expect(metrics.count).toBe(1);
    });
  });
});
