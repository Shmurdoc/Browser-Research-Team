// ============================================================
// Weighted Vote — Agent Consensus Layer
// ============================================================
//
// Implements weighted voting for multi-agent decision making.
// Agents vote on pattern relevance, quality, and interpretation
// confidence. Votes are weighted by agent trust scores.
// Requires majority agreement (N/2 + 1) to accept.
// ============================================================

import { type ConsensusVote, type AgentType } from '../types.js';

export type ConsensusDecision = 'accepted' | 'rejected' | 'undecided';

export interface ConsensusResult {
  decision: ConsensusDecision;
  votes: ConsensusVote[];
  agreementRatio: number;
  totalWeight: number;
}

/** Agent trust level — affects vote weight */
export interface AgentTrust {
  agentId: string;
  trust: number; // 0-1, starts at 0.5
  correctVotes: number;
  totalVotes: number;
  lastActive: number;
}

let _agentTrusts: Map<string, AgentTrust> = new Map();

const MAJORITY_THRESHOLD = 0.5; // >50% required
const SUPERMAJORITY_THRESHOLD = 0.667; // for quality-critical decisions

// ============================================================
// Public API
// ============================================================

/** Run a consensus round with weighted votes */
export async function reachConsensus(
  votes: ConsensusVote[],
  options?: { supermajority?: boolean; minVotes?: number }
): Promise<ConsensusResult> {
  const minVotes = options?.minVotes ?? Math.ceil(votes.length / 2) + 1;

  if (votes.length < minVotes) {
    return {
      decision: 'undecided',
      votes,
      agreementRatio: 0,
      totalWeight: 0,
    };
  }

  // Weight votes by agent trust
  let totalWeight = 0;
  let affirmativeWeight = 0;

  const weightedVotes = votes.map(v => {
    const trust = _agentTrusts.get(v.agentId);
    const weight = trust ? trust.trust : 0.5;
    totalWeight += weight;
    if (v.value) affirmativeWeight += weight;
    return { ...v, weight };
  });

  const agreementRatio = totalWeight > 0 ? affirmativeWeight / totalWeight : 0;
  const threshold = options?.supermajority ? SUPERMAJORITY_THRESHOLD : MAJORITY_THRESHOLD;

  const decision: ConsensusDecision =
    agreementRatio > threshold ? 'accepted' :
    (1 - agreementRatio) > threshold ? 'rejected' :
    'undecided';

  // Record votes for trust tracking
  for (const v of votes) {
    recordVote(v);
  }

  return {
    decision,
    votes: weightedVotes,
    agreementRatio,
    totalWeight,
  };
}

/** Record an agent's vote to update its trust score */
export function recordVote(vote: ConsensusVote): void {
  const existing = _agentTrusts.get(vote.agentId);
  if (existing) {
    existing.totalVotes++;
    // Trust increases if agent is confident AND correct
    // (we infer correctness by whether the agent agreed with majority)
    existing.lastActive = Date.now();
  } else {
    _agentTrusts.set(vote.agentId, {
      agentId: vote.agentId,
      trust: 0.5,
      correctVotes: 0,
      totalVotes: 1,
      lastActive: Date.now(),
    });
  }
}

/** Update trust based on outcome (feedback-informed) */
export function updateTrust(
  agentId: string,
  votedCorrectly: boolean
): void {
  const existing = _agentTrusts.get(agentId);
  if (!existing) return;

  existing.totalVotes++;
  if (votedCorrectly) existing.correctVotes++;

  // Dynamic trust: logistic function of correctness ratio
  const ratio = existing.correctVotes / existing.totalVotes;
  existing.trust = 1 / (1 + Math.exp(-10 * (ratio - 0.5)));
}

/** Get trust for all agents */
export function getAgentTrusts(): Map<string, AgentTrust> {
  return new Map(_agentTrusts);
}

/** Get trust for a specific agent */
export function getAgentTrust(agentId: string): number {
  return _agentTrusts.get(agentId)?.trust ?? 0.5;
}

/** Reset all trust scores */
export function resetTrust(): void {
  _agentTrusts.clear();
}
