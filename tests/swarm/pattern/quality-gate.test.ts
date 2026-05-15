// ============================================================
// Quality Gate & Consensus Tests
// ============================================================

import { describe, it, expect } from 'vitest';
import { assessQuality, passesQualityGate } from '../../../dist/src/swarm/pattern/quality-gate.js';
import { createMockPattern } from '../../../tests/fixtures/patterns.js';
import { reachConsensus, recordVote, resetTrust, getAgentTrust, getAgentTrusts } from '../../../dist/src/consensus/raft.js';

describe('Quality Gate', () => {
  describe('assessQuality', () => {
    it('should assess quality of a complete pattern', async () => {
      const pattern = createMockPattern({
        title: 'Test Pattern',
        description: 'A well-described test pattern for quality assessment',
        tags: ['dashboard', 'analytics', 'modern'],
        components: ['navbar', 'card', 'button'],
      });
      const result = await assessQuality(pattern);
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('breakdown');
      expect(result).toHaveProperty('issues');
      expect(result).toHaveProperty('suggestions');
      expect(typeof result.score).toBe('number');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(10);
    });

it('should give low score for incomplete pattern', async () => {
       const pattern = createMockPattern({
         title: '',
         description: '',
         tags: [],
         components: [],
       });
       const result = await assessQuality(pattern);
       // Incomplete patterns should score well below passing threshold (7)
       expect(result.score).toBeLessThan(7);
       expect(result.issues.length).toBeGreaterThan(0);
       // Verify completeness penalties are applied
       expect(result.breakdown.completeness).toBeLessThan(10);
     });

    it('should include breakdown scores', async () => {
      const pattern = createMockPattern();
      const result = await assessQuality(pattern);
      expect(result.breakdown).toHaveProperty('completeness');
      expect(result.breakdown).toHaveProperty('consistency');
      expect(result.breakdown).toHaveProperty('relevance');
      expect(result.breakdown).toHaveProperty('sourceTrust');
    });

    it('should handle missing layout gracefully', async () => {
      const pattern = createMockPattern({
        layout: { type: 'unknown' as any, zones: [], confidence: 0 },
      });
      const result = await assessQuality(pattern);
      expect(result).toBeDefined();
      expect(result.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('passesQualityGate', () => {
    it('should pass pattern with score above threshold', () => {
      const pattern = createMockPattern({ qualityScore: 7 });
      expect(passesQualityGate(pattern, 5)).toBe(true);
    });

    it('should reject pattern with score below threshold', () => {
      const pattern = createMockPattern({ qualityScore: 3 });
      expect(passesQualityGate(pattern, 5)).toBe(false);
    });

    it('should use default threshold of 5', () => {
      const pattern = createMockPattern({ qualityScore: 5 });
      expect(passesQualityGate(pattern)).toBe(true);
    });
  });
});

describe('Raft Consensus', () => {
  beforeEach(() => {
    resetTrust();
  });

  describe('reachConsensus', () => {
    it('should accept with majority agreement', async () => {
      const votes = [
        { agentId: 'agent1', value: true, confidence: 0.9 },
        { agentId: 'agent2', value: true, confidence: 0.8 },
        { agentId: 'agent3', value: false, confidence: 0.3 },
      ];
      const result = await reachConsensus(votes);
      expect(result.decision).toBe('accepted');
      expect(result.agreementRatio).toBeGreaterThan(0.5);
    });

    it('should reject with majority disagreement', async () => {
      const votes = [
        { agentId: 'agent1', value: false, confidence: 0.9 },
        { agentId: 'agent2', value: false, confidence: 0.8 },
        { agentId: 'agent3', value: true, confidence: 0.3 },
      ];
      const result = await reachConsensus(votes);
      expect(result.decision).toBe('rejected');
    });

    it('should return undecided without enough votes', async () => {
      const votes = [
        { agentId: 'agent1', value: true, confidence: 0.9 },
      ];
      const result = await reachConsensus(votes, { minVotes: 3 });
      expect(result.decision).toBe('undecided');
    });

    it('should require supermajority when specified', async () => {
      const votes = [
        { agentId: 'a1', value: true, confidence: 0.9 },
        { agentId: 'a2', value: true, confidence: 0.8 },
        { agentId: 'a3', value: false, confidence: 0.7 },
      ];
      const result = await reachConsensus(votes, { supermajority: true });
      expect(result.agreementRatio).toBeCloseTo(2 / 3, 1);
    });

    it('should handle weighted votes by trust', async () => {
      recordVote({ agentId: 'trusted', value: true, confidence: 0.9 });
      const votes = [
        { agentId: 'trusted', value: true, confidence: 0.9 },
        { agentId: 'new-agent', value: false, confidence: 0.9 },
      ];
      const result = await reachConsensus(votes, { minVotes: 2 });
      expect(result.decision).toBe('undecided');
    });
  });

  describe('recordVote & trust tracking', () => {
    it('should track agent trust', () => {
      recordVote({ agentId: 'test-agent', value: true, confidence: 0.8 });
      const trust = getAgentTrust('test-agent');
      expect(typeof trust).toBe('number');
    });

    it('should have initial trust of 0.5', () => {
      resetTrust();
      expect(getAgentTrust('new-agent')).toBe(0.5);
    });

    it('should get all trusts', () => {
      resetTrust();
      recordVote({ agentId: 'a1', value: true, confidence: 0.8 });
      recordVote({ agentId: 'a2', value: false, confidence: 0.7 });
      const trusts = getAgentTrusts();
      expect(trusts.size).toBe(2);
    });
  });
});