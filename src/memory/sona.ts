// ============================================================
// SONA — Self-Optimizing Neural Architecture
// ============================================================
//
// Learns from user feedback to improve pattern matching.
// Stores successful (high-rated) patterns and adjusts
// relevance scoring based on historical feedback patterns.
// ============================================================

import { type DesignPattern, type PatternId } from '../types.js';
import { addFeedback, getPattern } from '../storage/local.js';

/** A learned association between tags and quality */
interface LearnedPattern {
  tagCombination: string[];
  avgRating: number;
  count: number;
  lastSeen: number;
}

/** SONA internal state */
interface SONAState {
  learnedPatterns: LearnedPattern[];
  sourceQuality: Record<string, { avgRating: number; count: number }>;
  componentAffinities: Record<string, Record<string, number>>; // co-occurrence matrix
  adaptationRate: number; // 0-1, how fast to adapt
}

let _state: SONAState = {
  learnedPatterns: [],
  sourceQuality: {},
  componentAffinities: {},
  adaptationRate: 0.15,
};

// ============================================================
// Public API
// ============================================================

/** Initialize SONA with seed data */
export function initSONA(options?: { adaptationRate?: number }): void {
  _state = {
    learnedPatterns: [],
    sourceQuality: {},
    componentAffinities: {},
    adaptationRate: options?.adaptationRate ?? 0.15,
  };
}

/** Learn from user feedback */
export async function learnFromFeedback(
  patternId: PatternId,
  rating: number,
  tags: string[]
): Promise<void> {
  const pattern = await getPattern(patternId);
  if (!pattern) return;

  // Update learned patterns for each tag combination
  const sortedTags = [...tags].sort();
  const existing = _state.learnedPatterns.find(
    lp => arraysEqual(lp.tagCombination, sortedTags)
  );

  if (existing) {
    existing.count++;
    existing.avgRating += (rating - existing.avgRating) * _state.adaptationRate;
    existing.lastSeen = Date.now();
  } else {
    _state.learnedPatterns.push({
      tagCombination: sortedTags,
      avgRating: rating,
      count: 1,
      lastSeen: Date.now(),
    });
  }

  // Update source quality
  if (!_state.sourceQuality[pattern.source]) {
    _state.sourceQuality[pattern.source] = { avgRating: rating, count: 1 };
  } else {
    const sq = _state.sourceQuality[pattern.source];
    sq.count++;
    sq.avgRating += (rating - sq.avgRating) * _state.adaptationRate;
  }

  // Update component affinities
  for (let i = 0; i < pattern.components.length; i++) {
    for (let j = i + 1; j < pattern.components.length; j++) {
      const a = pattern.components[i];
      const b = pattern.components[j];
      if (!_state.componentAffinities[a]) _state.componentAffinities[a] = {};
      _state.componentAffinities[a][b] = (_state.componentAffinities[a][b] ?? 0) + 1;
      if (!_state.componentAffinities[b]) _state.componentAffinities[b] = {};
      _state.componentAffinities[b][a] = (_state.componentAffinities[b][a] ?? 0) + 1;
    }
  }

  // Prune old learned patterns (keep top 100 by count)
  if (_state.learnedPatterns.length > 100) {
    _state.learnedPatterns.sort((a, b) => b.count - a.count);
    _state.learnedPatterns = _state.learnedPatterns.slice(0, 100);
  }
}

/** Predict quality of a pattern based on learned associations */
export function predictQuality(pattern: DesignPattern): number {
  let score = 5; // baseline

  // Adjust by source quality
  const sq = _state.sourceQuality[pattern.source];
  if (sq && sq.count > 1) {
    score += (sq.avgRating - 3) * 0.5;
  }

  // Adjust by learned tag patterns
  for (const lp of _state.learnedPatterns) {
    const matchesAll = lp.tagCombination.every(t => pattern.tags.includes(t));
    if (matchesAll) {
      score += (lp.avgRating - 3) * 0.3;
    }
  }

  // Adjust by component co-occurrence confidence
  for (let i = 0; i < pattern.components.length; i++) {
    for (let j = i + 1; j < pattern.components.length; j++) {
      const aff = _state.componentAffinities[pattern.components[i]]?.[pattern.components[j]];
      if (aff && aff > 3) {
        score += 0.2; // high co-occurrence = more confident
      }
    }
  }

  return Math.max(0, Math.min(10, score));
}

/** Get SONA state for diagnostics */
export function getSONAStats(): {
  learnedPatterns: number;
  sourcesTracked: number;
  componentAffinities: number;
} {
  return {
    learnedPatterns: _state.learnedPatterns.length,
    sourcesTracked: Object.keys(_state.sourceQuality).length,
    componentAffinities: Object.keys(_state.componentAffinities).length,
  };
}

/** Adjust adaptation rate */
export function setAdaptationRate(rate: number): void {
  _state.adaptationRate = Math.max(0.01, Math.min(1, rate));
}

/** Reset SONA state */
export function resetSONA(): void {
  _state = {
    learnedPatterns: [],
    sourceQuality: {},
    componentAffinities: {},
    adaptationRate: 0.15,
  };
}

// Helpers
function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
