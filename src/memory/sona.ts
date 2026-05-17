// ============================================================
// SONA — Self-Optimizing Neural Architecture
// ============================================================
//
// Learns from user feedback to improve pattern matching.
// Stores successful (high-rated) patterns and adjusts
// relevance scoring based on historical feedback patterns.
// Persists state to disk so learning survives restarts.
// ============================================================

import { type DesignPattern, type PatternId } from '../types.js';
import { addFeedback, getPattern } from '../storage/local.js';
import { getPatternStorageDir } from '../storage/supabase.js';
import { createLogger_Scoped } from '../logging/index.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const logger = createLogger_Scoped('sona');

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
  componentAffinities: Record<string, Record<string, number>>;
  adaptationRate: number;
}

let _state: SONAState = {
  learnedPatterns: [],
  sourceQuality: {},
  componentAffinities: {},
  adaptationRate: 0.15,
};

let _stateLoaded = false;

/** Path to the persisted SONA state file */
function _getStatePath(): string {
  const storageDir = getPatternStorageDir();
  return join(storageDir, 'sona-state.json');
}

/** Load persisted state from disk (called once on init) */
function _loadState(): void {
  if (_stateLoaded) return;
  _stateLoaded = true;

  try {
    const path = _getStatePath();
    if (!existsSync(path)) return;

    const raw = readFileSync(path, 'utf-8');
    const persisted = JSON.parse(raw) as Partial<SONAState>;

    if (persisted.learnedPatterns) _state.learnedPatterns = persisted.learnedPatterns;
    if (persisted.sourceQuality) _state.sourceQuality = persisted.sourceQuality;
    if (persisted.componentAffinities) _state.componentAffinities = persisted.componentAffinities;
    if (typeof persisted.adaptationRate === 'number') _state.adaptationRate = persisted.adaptationRate;

    logger.info(
      { patterns: _state.learnedPatterns.length, sources: Object.keys(_state.sourceQuality).length },
      'SONA state loaded from disk'
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ error: message }, 'Failed to load SONA state, starting fresh');
  }
}

/** Persist current state to disk */
function _saveState(): void {
  try {
    const path = _getStatePath();
    const storageDir = getPatternStorageDir();

    if (!existsSync(storageDir)) {
      mkdirSync(storageDir, { recursive: true });
    }

    const data = JSON.stringify(_state, null, 2);
    writeFileSync(path, data, 'utf-8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ error: message }, 'Failed to save SONA state');
  }
}

// ============================================================
// Public API
// ============================================================

/** Initialize SONA — loads persisted state if available */
export function initSONA(options?: { adaptationRate?: number }): void {
  _state = {
    learnedPatterns: [],
    sourceQuality: {},
    componentAffinities: {},
    adaptationRate: options?.adaptationRate ?? 0.15,
  };
  _stateLoaded = false;
  _loadState();
}

/** Learn from user feedback and persist state */
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

  // Persist to disk
  _saveState();
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
        score += 0.2;
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
  _saveState();
}

/** Reset SONA state and clear persisted file */
export function resetSONA(): void {
  _state = {
    learnedPatterns: [],
    sourceQuality: {},
    componentAffinities: {},
    adaptationRate: 0.15,
  };
  _stateLoaded = true;

  try {
    const path = _getStatePath();
    if (existsSync(path)) {
      writeFileSync(path, JSON.stringify(_state, null, 2), 'utf-8');
    }
  } catch {
    // Ignore write errors on reset
  }
}

// Helpers
function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
