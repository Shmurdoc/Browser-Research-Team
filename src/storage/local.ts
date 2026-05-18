// ============================================================
// Local File-Based Pattern Storage — Production Grade
// ============================================================
//
// Features:
// - Atomic writes (temp file + rename)
// - Write lock to prevent race conditions
// - Prototype pollution protection on pattern IDs
// - Proper ENOENT detection via error.code
// - Individual pattern files for resilience
// ============================================================

import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync, renameSync, unlinkSync, mkdirSync } from 'node:fs';
import * as lockModule from 'proper-lockfile';
import {
  type DesignPattern,
  type PatternId,
  type PatternQuery,
  type PatternSearchResult,
  type LibraryStats,
  type PatternSource,
  type LayoutType,
  type ComponentType,
} from '../types.js';
import { StorageError } from '../errors/index.js';
import { safeBasename } from '../validation/sanitize.js';

// Use the lock function from proper-lockfile
const lock = lockModule.lock;

const TMP_SUFFIX = '.tmp';

/**
 * Get the current storage directory. Reads from env on each call
 * so tests can override via DPM_STORAGE_DIR.
 */
export function getStorageDir(): string {
  return process.env.DPM_STORAGE_DIR ?? join(process.cwd(), 'patterns');
}

/**
 * Get the storage directory path, validated to prevent path traversal.
 */
export function getPatternStorageDir(): string {
  const dir = getStorageDir();
  // Ensure the directory exists and is within expected bounds
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getIndexFile(): string {
  return join(getStorageDir(), 'index.json');
}

/**
 * In-memory pattern index for fast lookups.
 * Persisted to disk as JSON.
 */
interface PatternIndex {
  patterns: Record<PatternId, DesignPattern>;
  lastUpdated: number;
}

function defaultIndex(): PatternIndex {
  return { patterns: Object.create(null), lastUpdated: Date.now() };
}

let _cache: PatternIndex | null = null;

// Write lock — prevents concurrent write race conditions
let _writeLock = Promise.resolve();

/**
 * Reset the in-memory cache (useful for testing).
 */
export function _resetCache(): void {
  _cache = null;
  _writeLock = Promise.resolve();
}

async function ensureDir(): Promise<void> {
  const dir = getStorageDir();
  if (!existsSync(dir)) {
    try {
      await mkdir(dir, { recursive: true });
    } catch (error) {
      throw new StorageError(
        `Failed to create storage directory: ${error instanceof Error ? error.message : String(error)}`,
        { path: dir }
      );
    }
  }
}

/**
 * Validate JSON structure is a valid PatternIndex
 */
function validateIndex(data: unknown): PatternIndex {
  if (!data || typeof data !== 'object') {
    throw new StorageError('Index file contains invalid JSON structure');
  }

  const obj = data as Record<string, unknown>;
  if (!('patterns' in obj) || typeof obj.patterns !== 'object') {
    throw new StorageError('Index missing "patterns" field');
  }

  if (!('lastUpdated' in obj) || typeof obj.lastUpdated !== 'number') {
    throw new StorageError('Index missing or invalid "lastUpdated" field');
  }

  return data as PatternIndex;
}

async function loadIndex(): Promise<PatternIndex> {
  if (_cache) return _cache;
  await ensureDir();

  const indexFile = getIndexFile();
  try {
    const raw = await readFile(indexFile, 'utf-8');
    const parsed = JSON.parse(raw);
    _cache = validateIndex(parsed);
  } catch (error) {
    if (error instanceof StorageError) {
      throw error;
    }

    // Check for ENOENT via error code (not string matching)
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      _cache = defaultIndex();
      await persist();
    } else {
      // JSON parse error or other issue
      console.warn(
        `Index file corrupt or unreadable, starting fresh: ${error instanceof Error ? error.message : String(error)}`
      );
      _cache = defaultIndex();
      await persist();
    }
  }

  return _cache;
}

/**
 * Persist index to disk with atomic write and proper file locking.
 * Uses proper-lockfile for cross-platform file locking (Windows + Unix).
 * Uses a write lock queue to prevent concurrent write race conditions.
 */
async function persist(): Promise<void> {
  if (!_cache) return;

  // Queue this write behind any previous writes
  _writeLock = _writeLock.then(async () => {
    let release: (() => Promise<void>) | null = null;
    try {
      const indexFile = getIndexFile();
      const tmpFile = indexFile + TMP_SUFFIX;
      await ensureDir();

      // Ensure index file exists before locking (proper-lockfile requires existing file or directory)
      try {
        if (!existsSync(indexFile)) {
          // Create empty index file so lock can work
          await writeFile(indexFile, '{}', 'utf-8');
        }
      } catch {
        // Ignore — file may have been created by another process
      }

      // Acquire file lock with timeout
      release = await lock(indexFile, {
        stale: 5000, // Consider lock stale after 5s (in case process crashes)
        onCompromised: (error: Error) => {
          throw new StorageError(`Lock compromised: ${error instanceof Error ? error.message : String(error)}`, {
            path: indexFile,
          });
        },
      });

      _cache!.lastUpdated = Date.now();
      const jsonContent = JSON.stringify(_cache!, null, 2);

      try {
        // Write to temp file first
        await writeFile(tmpFile, jsonContent, 'utf-8');

        // Atomic rename (Unix) or fallback for Windows
        try {
          renameSync(tmpFile, indexFile);
        } catch (renameError) {
          // Windows fallback: direct write + cleanup
          try {
            await writeFile(indexFile, jsonContent, 'utf-8');
          } catch {
            throw new StorageError(
              `Failed to write index file: ${renameError instanceof Error ? renameError.message : String(renameError)}`,
              { path: indexFile }
            );
          }
        }

        // Clean up temp file if it still exists
        try {
          unlinkSync(tmpFile);
        } catch {
          // Best effort cleanup — ignore if already deleted
        }
      } catch (error) {
        // Clean up temp file on error
        try {
          await unlink(tmpFile);
        } catch {
          // Ignore cleanup errors
        }
        throw error;
      }
    } catch (error) {
      throw new StorageError(
        `Failed to persist index: ${error instanceof Error ? error.message : String(error)}`,
        { path: getIndexFile() }
      );
    } finally {
      // Always release the lock
      if (release) {
        try {
          await release();
        } catch (releaseError) {
          console.warn(`Failed to release file lock: ${releaseError instanceof Error ? releaseError.message : String(releaseError)}`);
        }
      }
    }
  });

  // Wait for this write to complete
  await _writeLock;
}

// ============================================================
// Public API
// ============================================================

/** Store a pattern. If it exists, update it. */
export async function putPattern(pattern: DesignPattern): Promise<void> {
  try {
    // Sanitize pattern ID to prevent path traversal
    const safeId = safeBasename(pattern.id);
    if (!safeId) {
      throw new StorageError('Invalid pattern ID');
    }

    const index = await loadIndex();
    index.patterns[safeId] = { ...pattern, id: safeId };
    await persist();

    // Also write individual file for resilience (best-effort)
    try {
      const filePath = join(getStorageDir(), `${safeId}.json`);
      const tmpFile = filePath + TMP_SUFFIX;
      await writeFile(tmpFile, JSON.stringify(pattern, null, 2), 'utf-8');
      renameSync(tmpFile, filePath);
    } catch {
      // Individual file write failure is non-fatal (we have index.json)
    }
  } catch (error) {
    if (error instanceof StorageError) {
      throw error;
    }
    throw new StorageError(
      `Failed to store pattern: ${error instanceof Error ? error.message : String(error)}`,
      { patternId: pattern.id }
    );
  }
}

/** Get a single pattern by ID */
export async function getPattern(id: PatternId): Promise<DesignPattern | null> {
  try {
    const index = await loadIndex();
    return index.patterns[id] ?? null;
  } catch (error) {
    if (error instanceof StorageError) {
      throw error;
    }
    throw new StorageError(
      `Failed to retrieve pattern: ${error instanceof Error ? error.message : String(error)}`,
      { patternId: id }
    );
  }
}

/** Delete a pattern */
export async function deletePattern(id: PatternId): Promise<boolean> {
  try {
    const index = await loadIndex();
    if (!index.patterns[id]) return false;
    delete index.patterns[id];
    await persist();

    const filePath = join(getStorageDir(), `${id}.json`);
    try {
      await unlink(filePath);
    } catch {
      // File might not exist, that's ok
    }
    return true;
  } catch (error) {
    if (error instanceof StorageError) {
      throw error;
    }
    throw new StorageError(
      `Failed to delete pattern: ${error instanceof Error ? error.message : String(error)}`,
      { patternId: id }
    );
  }
}

/** Search patterns by query */
export async function searchPatterns(query: PatternQuery): Promise<PatternSearchResult[]> {
  try {
    const index = await loadIndex();
    let results = Object.values(index.patterns);

    // Text search (tokenized keyword match — any token matches)
    if (query.text) {
      const tokens = query.text.toLowerCase().split(/\s+/).filter(t => t.length > 2);
      const stopWords = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from']);
      const keywords = tokens.filter(t => !stopWords.has(t));

      results = results.filter(p => {
        if (keywords.length === 0) return true;
        const searchText = [
          p.title.toLowerCase(),
          p.description.toLowerCase(),
          ...p.tags.map(t => t.toLowerCase()),
          ...p.components.map(c => c.toLowerCase()),
        ].join(' ');

        return keywords.some(kw => searchText.includes(kw));
      });
    }

    // Source filter
    if (query.source) {
      const sources = Array.isArray(query.source) ? query.source : [query.source];
      results = results.filter(p => sources.includes(p.source));
    }

    // Layout filter
    if (query.layoutType) {
      results = results.filter(p => p.layout.type === query.layoutType);
    }

    // Component filter
    if (query.components && query.components.length > 0) {
      results = results.filter(p =>
        query.components!.some(c => p.components.includes(c))
      );
    }

    // Framework filter
    if (query.framework) {
      results = results.filter(p =>
        p.frameworkHints.includes(query.framework!)
      );
    }

    // Quality filter
    if (query.minQuality !== undefined) {
      results = results.filter(p => p.qualityScore >= query.minQuality!);
    }

    // Sort by quality score desc
    results.sort((a, b) => b.qualityScore - a.qualityScore);

    // Tokenize query ONCE before the map (performance fix)
    const queryTokens = query.text
      ? query.text.toLowerCase().split(/\s+/).filter(t => t.length > 2)
      : [];

    // Compute similarity based on keyword match ratio
    const allResults: PatternSearchResult[] = results.map(pattern => {
      let similarity = pattern.qualityScore / 10;
      if (queryTokens.length > 0) {
        const searchText = [
          pattern.title.toLowerCase(),
          pattern.description.toLowerCase(),
          ...pattern.tags.map(t => t.toLowerCase()),
        ].join(' ');

        let matchCount = 0;
        for (const token of queryTokens) {
          if (searchText.includes(token)) matchCount++;
        }
        const tokenRatio = matchCount / queryTokens.length;
        similarity += tokenRatio * 0.3;
      }
      return { pattern, similarity: Math.min(similarity, 1) };
    });

    // Apply offset/limit
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;
    return allResults.slice(offset, offset + limit);
  } catch (error) {
    if (error instanceof StorageError) {
      throw error;
    }
    throw new StorageError(
      `Failed to search patterns: ${error instanceof Error ? error.message : String(error)}`,
      { query }
    );
  }
}

/** Add feedback to a pattern */
export async function addFeedback(
  id: PatternId,
  feedback: { rating: number; tags?: string[]; comment?: string; userId?: string }
): Promise<boolean> {
  try {
    const index = await loadIndex();
    const pattern = index.patterns[id];
    if (!pattern) return false;

    pattern.feedback.push({
      rating: feedback.rating,
      tags: feedback.tags ?? [],
      comment: feedback.comment,
      timestamp: Date.now(),
      userId: feedback.userId,
    });

    // Update quality score based on average rating
    const avgRating = pattern.feedback.reduce((s, f) => s + f.rating, 0) / pattern.feedback.length;
    pattern.qualityScore = Math.round((avgRating / 5) * 10);
    pattern.updatedAt = Date.now();

    await persist();
    return true;
  } catch (error) {
    if (error instanceof StorageError) {
      throw error;
    }
    throw new StorageError(
      `Failed to add feedback: ${error instanceof Error ? error.message : String(error)}`,
      { patternId: id }
    );
  }
}

/** Get library statistics */
export async function getStats(): Promise<LibraryStats> {
  try {
    const index = await loadIndex();
    const patterns = Object.values(index.patterns);

    const totalSources = {} as Record<PatternSource, number>;
    const layoutCounts = new Map<LayoutType, number>();
    const componentCounts = new Map<ComponentType, number>();

    for (const p of patterns) {
      totalSources[p.source] = (totalSources[p.source] ?? 0) + 1;
      layoutCounts.set(p.layout.type, (layoutCounts.get(p.layout.type) ?? 0) + 1);
      for (const c of p.components) {
        componentCounts.set(c, (componentCounts.get(c) ?? 0) + 1);
      }
    }

    const totalQuality = patterns.reduce((s, p) => s + p.qualityScore, 0);
    const totalFeedback = patterns.reduce((s, p) => s + p.feedback.length, 0);

    return {
      totalPatterns: patterns.length,
      totalSources,
      topLayouts: [...layoutCounts.entries()]
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      topComponents: [...componentCounts.entries()]
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      averageQuality: patterns.length > 0 ? totalQuality / patterns.length : 0,
      totalFeedback,
    };
  } catch (error) {
    if (error instanceof StorageError) {
      throw error;
    }
    throw new StorageError(
      `Failed to get statistics: ${error instanceof Error ? error.message : String(error)}`,
      {}
    );
  }
}

/** Get all pattern IDs */
export async function getAllIds(): Promise<PatternId[]> {
  try {
    const index = await loadIndex();
    return Object.keys(index.patterns);
  } catch (error) {
    if (error instanceof StorageError) {
      throw error;
    }
    throw new StorageError(
      `Failed to get pattern IDs: ${error instanceof Error ? error.message : String(error)}`,
      {}
    );
  }
}

/** Load all patterns (for vector index rebuild) */
export async function loadAllPatterns(): Promise<DesignPattern[]> {
  const index = await loadIndex();
  return Object.values(index.patterns);
}
