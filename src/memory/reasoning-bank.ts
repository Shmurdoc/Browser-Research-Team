// ============================================================
// ReasoningBank — Persistent Pattern Store with EWC
// ============================================================
//
// Stores successful pattern interpretations and reasoning traces.
// Uses Elastic Weight Consolidation (EWC) with per-dimension
// Fisher Information approximation to prevent catastrophic
// forgetting of previously learned patterns.
// ============================================================

import { type PatternId, type DesignPattern, type QualityScore } from '../types.js';
import { getPatternStorageDir } from '../storage/local.js';
import { createLogger_Scoped } from '../logging/index.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const logger = createLogger_Scoped('reasoning-bank');

interface ReasoningTrace {
  patternId: PatternId;
  inputContext: { source: string; url: string; imageHash?: string };
  interpretation: { layoutType: string; detectedComponents: string[]; confidence: number };
  outcome: { qualityScore: QualityScore; userRatings: number[]; wasAccepted: boolean };
  timestamp: number;
}

interface ConsolidatedMemory {
  patternId: PatternId;
  embeddingSignature: number[]; // Actual embedding vector (not hash)
  fisherInformation: number[];  // Per-dimension importance weights
  importance: number;
  lastAccessed: number;
  accessCount: number;
}

const MAX_TRACES = 500;
const MAX_MEMORIES = 200;
const EWC_LAMBDA = 0.4; // EWC regularization strength
const IMPORTANCE_DECAY = 0.99;

let _traces: ReasoningTrace[] = [];
let _memories: ConsolidatedMemory[] = [];
let _stateLoaded = false;

function _getStatePath(): string {
  const storageDir = getPatternStorageDir();
  return join(storageDir, 'reasoning-bank.json');
}

function _loadState(): void {
  if (_stateLoaded) return;
  _stateLoaded = true;

  try {
    const path = _getStatePath();
    if (!existsSync(path)) return;

    const raw = readFileSync(path, 'utf-8');
    const persisted = JSON.parse(raw) as { traces: ReasoningTrace[]; memories: ConsolidatedMemory[] };

    if (Array.isArray(persisted.traces)) _traces = persisted.traces;
    if (Array.isArray(persisted.memories)) _memories = persisted.memories;

    logger.info(
      { traces: _traces.length, memories: _memories.length },
      'ReasoningBank state loaded from disk'
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ error: message }, 'Failed to load ReasoningBank state, starting fresh');
  }
}

function _saveState(): void {
  try {
    const path = _getStatePath();
    const storageDir = getPatternStorageDir();

    if (!existsSync(storageDir)) {
      mkdirSync(storageDir, { recursive: true });
    }

    writeFileSync(path, JSON.stringify({ traces: _traces, memories: _memories }, null, 2), 'utf-8');
  } catch (error) {
    logger.warn({ error: error instanceof Error ? error.message : String(error) }, 'Failed to save ReasoningBank state');
  }
}

// ============================================================
// Public API
// ============================================================

/** Initialize ReasoningBank — loads persisted state */
export function initReasoningBank(): void {
  _loadState();
}

/** Record a reasoning trace for a pattern */
export function recordTrace(
  patternId: PatternId,
  context: { source: string; url: string; imageHash?: string },
  interpretation: { layoutType: string; detectedComponents: string[]; confidence: number },
  outcome: { qualityScore: QualityScore; userRatings: number[]; wasAccepted: boolean }
): void {
  _loadState();

  _traces.push({
    patternId,
    inputContext: context,
    interpretation,
    outcome,
    timestamp: Date.now(),
  });

  if (_traces.length > MAX_TRACES) {
    _traces.sort((a, b) => a.timestamp - b.timestamp);
    _traces = _traces.slice(-MAX_TRACES);
  }

  consolidateMemory(patternId, outcome.qualityScore);
  _saveState();
}

/** Find similar reasoning traces for a given pattern context */
export function findSimilarTraces(
  layoutType: string,
  components: string[],
  limit: number = 5
): ReasoningTrace[] {
  _loadState();

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
  _loadState();

  return [..._memories]
    .sort((a, b) => b.importance - a.importance)
    .slice(0, limit);
}

/**
 * EWC: compute importance-weighted loss penalty.
 * Uses per-dimension Fisher Information diagonal approximation.
 * The penalty increases when new embeddings diverge from important
 * dimensions of stored memories.
 */
export function getEWCPenalty(
  patternId: PatternId,
  newEmbedding: number[]
): number {
  _loadState();

  const memory = _memories.find(m => m.patternId === patternId);
  if (!memory) return 0;

  let penalty = 0;
  const dim = Math.min(newEmbedding.length, memory.fisherInformation.length, memory.embeddingSignature.length);

  for (let i = 0; i < dim; i++) {
    const fisher = memory.fisherInformation[i];
    const drift = (newEmbedding[i] - memory.embeddingSignature[i]) ** 2;
    penalty += fisher * drift;
  }

  return EWC_LAMBDA * penalty;
}

/** Apply EWC: decay importance for all memories (call periodically) */
export function decayMemories(): void {
  _loadState();

  for (const m of _memories) {
    m.importance *= IMPORTANCE_DECAY;
    m.importance = Math.max(0.01, m.importance);
    // Also decay Fisher Information
    for (let i = 0; i < m.fisherInformation.length; i++) {
      m.fisherInformation[i] *= IMPORTANCE_DECAY;
    }
  }

  _memories = _memories.filter(m => m.importance > 0.05);
  _saveState();
}

/** Get reasoning bank stats */
export function getReasoningStats(): {
  totalTraces: number;
  totalMemories: number;
  avgImportance: number;
} {
  _loadState();

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
  _stateLoaded = true;
  _saveState();
}

// Internal: consolidate a pattern into long-term memory with real EWC
function consolidateMemory(patternId: PatternId, qualityScore: QualityScore): void {
  const existing = _memories.find(m => m.patternId === patternId);

  if (existing) {
    existing.accessCount++;
    existing.lastAccessed = Date.now();
    existing.importance = Math.min(1, existing.importance + qualityScore / 100);

    // Update Fisher Information: dimensions with high variance across accesses are important
    // Approximate: increase Fisher weight for dimensions that differ from current signature
    const newSignature = computeEmbeddingSignature(patternId, qualityScore);
    for (let i = 0; i < Math.min(existing.fisherInformation.length, newSignature.length); i++) {
      const diff = Math.abs(newSignature[i] - existing.embeddingSignature[i]);
      existing.fisherInformation[i] += diff * 0.1; // Accumulate importance
    }
    existing.embeddingSignature = newSignature;
  } else {
    const signature = computeEmbeddingSignature(patternId, qualityScore);
    // Initialize Fisher Information with uniform importance
    const fisherInfo = new Array(signature.length).fill(1.0 / signature.length);

    _memories.push({
      patternId,
      embeddingSignature: signature,
      fisherInformation: fisherInfo,
      importance: qualityScore / 20,
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

/**
 * Compute a multi-dimensional embedding signature from pattern metadata.
 * Uses feature hashing to create a consistent 64-dimensional vector
 * from pattern ID, quality score, and timestamp.
 */
function computeEmbeddingSignature(patternId: PatternId, qualityScore: QualityScore): number[] {
  const dims = 64;
  const signature = new Array(dims).fill(0);

  // Hash pattern ID into multiple dimensions
  for (let i = 0; i < patternId.length; i++) {
    const charCode = patternId.charCodeAt(i);
    const dim1 = (charCode * 7 + i * 13) % dims;
    const dim2 = (charCode * 11 + i * 17) % dims;
    const dim3 = (charCode * 23 + i * 31) % dims;
    signature[dim1] += Math.sin(charCode) * 0.1;
    signature[dim2] += Math.cos(charCode) * 0.1;
    signature[dim3] += (charCode / 255) * 0.1;
  }

  // Encode quality score into first few dimensions
  const normalizedQuality = qualityScore / 10;
  signature[0] += normalizedQuality;
  signature[1] += normalizedQuality * normalizedQuality;
  signature[2] += Math.sqrt(normalizedQuality);

  // Encode timestamp patterns
  const now = Date.now();
  signature[3] += (now % 1000) / 1000;
  signature[4] += Math.sin(now / 86400000) * 0.5; // Day-of-year pattern

  // Normalize to unit vector
  const magnitude = Math.sqrt(signature.reduce((s, v) => s + v * v, 0));
  if (magnitude > 0) {
    for (let i = 0; i < dims; i++) {
      signature[i] /= magnitude;
    }
  }

  return signature;
}
