// ============================================================
// ReasoningBank — Persistent Pattern Store
// ============================================================
//
// Stores successful pattern interpretations and reasoning traces
// so the system learns "what worked" over time.
// Uses Elastic Weight Consolidation (EWC) principles to prevent
// catastrophic forgetting of previously learned patterns.
// ============================================================

import { type PatternId, type DesignPattern, type QualityScore } from '../types.js';

/** A reasoning trace stored when a pattern is processed */
interface ReasoningTrace {
  patternId: PatternId;
  inputContext: {
    source: string;
    url: string;
    imageHash?: string;
  };
  interpretation: {
    layoutType: string;
    detectedComponents: string[];
    confidence: number;
  };
  outcome: {
    qualityScore: QualityScore;
    userRatings: number[];
    wasAccepted: boolean;
  };
  timestamp: number;
}

/** A consolidated memory — EWC-style */
interface ConsolidatedMemory {
  patternId: PatternId;
  embeddingSignature: number[]; // compressed representation
  importance: number; // EWC importance weight
  lastAccessed: number;
  accessCount: number;
}

const MAX_TRACES = 500;
const MAX_MEMORIES = 200;
const EWC_IMPORTANCE_DECAY = 0.99; // how fast importance fades if unused

let _traces: ReasoningTrace[] = [];
let _memories: ConsolidatedMemory[] = [];

// ============================================================
// Public API
// ============================================================

/** Record a reasoning trace for a pattern */
export function recordTrace(
  patternId: PatternId,
  context: { source: string; url: string; imageHash?: string },
  interpretation: { layoutType: string; detectedComponents: string[]; confidence: number },
  outcome: { qualityScore: QualityScore; userRatings: number[]; wasAccepted: boolean }
): void {
  _traces.push({
    patternId,
    inputContext: context,
    interpretation,
    outcome,
    timestamp: Date.now(),
  });

  // Prune oldest traces if over limit
  if (_traces.length > MAX_TRACES) {
    _traces.sort((a, b) => a.timestamp - b.timestamp);
    _traces = _traces.slice(-MAX_TRACES);
  }

  // Update consolidated memory with EWC
  consolidateMemory(patternId, outcome.qualityScore);
}

/** Find similar reasoning traces for a given pattern context */
export function findSimilarTraces(
  layoutType: string,
  components: string[],
  limit: number = 5
): ReasoningTrace[] {
  return _traces
    .filter(t => t.interpretation.layoutType === layoutType)
    .map(t => ({
      trace: t,
      score: t.interpretation.detectedComponents.filter(c => components.includes(c)).length,
    }))
    .filter(t => t.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(t => t.trace);
}

/** Get consolidated memories sorted by importance */
export function getImportantMemories(limit: number = 10): ConsolidatedMemory[] {
  return [..._memories]
    .sort((a, b) => b.importance - a.importance)
    .slice(0, limit);
}

/** EWC: compute importance-weighted loss penalty for a pattern */
export function getEWCPenalty(
  patternId: PatternId,
  newEmbedding: number[]
): number {
  const memory = _memories.find(m => m.patternId === patternId);
  if (!memory) return 0;

  // Compute Fisher information approximation — how much this pattern matters
  const fisher = memory.importance / (memory.accessCount + 1);

  // Compute embedding drift
  let drift = 0;
  for (let i = 0; i < Math.min(newEmbedding.length, memory.embeddingSignature.length); i++) {
    drift += fisher * (newEmbedding[i] - memory.embeddingSignature[i]) ** 2;
  }

  return drift;
}

/** Apply EWC: decay importance for all memories (call periodically) */
export function decayMemories(): void {
  for (const m of _memories) {
    m.importance *= EWC_IMPORTANCE_DECAY;
    m.importance = Math.max(0.01, m.importance);
  }

  // Prune low-importance memories
  _memories = _memories.filter(m => m.importance > 0.05);
}

/** Get reasoning bank stats */
export function getReasoningStats(): {
  totalTraces: number;
  totalMemories: number;
  avgImportance: number;
} {
  const avgImp = _memories.length > 0
    ? _memories.reduce((s, m) => s + m.importance, 0) / _memories.length
    : 0;

  return {
    totalTraces: _traces.length,
    totalMemories: _memories.length,
    avgImportance: avgImp,
  };
}

/** Reset reasoning bank */
export function resetReasoningBank(): void {
  _traces = [];
  _memories = [];
}

// Internal: consolidate a pattern into long-term memory
function consolidateMemory(patternId: PatternId, qualityScore: QualityScore): void {
  const existing = _memories.find(m => m.patternId === patternId);

  if (existing) {
    existing.accessCount++;
    existing.lastAccessed = Date.now();
    existing.importance = Math.min(1, existing.importance + qualityScore / 100);
  } else {
    // Create new memory with compressed embedding signature
    _memories.push({
      patternId,
      embeddingSignature: [hashCode(patternId) % 1000 / 1000],
      importance: qualityScore / 20, // higher quality = higher importance
      lastAccessed: Date.now(),
      accessCount: 1,
    });
  }

  // Prune if over limit
  if (_memories.length > MAX_MEMORIES) {
    _memories.sort((a, b) => a.importance - b.importance);
    _memories = _memories.slice(-MAX_MEMORIES);
  }
}

function hashCode(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
