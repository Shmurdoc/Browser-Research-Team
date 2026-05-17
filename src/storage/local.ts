// ============================================================
// Local File-Based Pattern Storage
// ============================================================

import { readFile, writeFile, copyFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { existsSync, renameSync, unlinkSync, copyFileSync, mkdirSync } from 'node:fs';
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

const TMP_SUFFIX = '.tmp';

/**
 * Get the current storage directory. Reads from env on each call
 * so tests can override via DPM_STORAGE_DIR.
 */
export function getStorageDir(): string {
  return process.env.DPM_STORAGE_DIR ?? join(process.cwd(), 'patterns');
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
  return { patterns: {}, lastUpdated: Date.now() };
}

let _cache: PatternIndex | null = null;

/**
 * Reset the in-memory cache (useful for testing).
 */
export function _resetCache(): void {
  _cache = null;
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
    throw new StorageError('Index file contains invalid JSON structure', { data });
  }

  const obj = data as Record<string, unknown>;
  if (!('patterns' in obj) || typeof obj.patterns !== 'object') {
    throw new StorageError('Index missing "patterns" field', { data });
  }

  if (!('lastUpdated' in obj) || typeof obj.lastUpdated !== 'number') {
    throw new StorageError('Index missing or invalid "lastUpdated" field', { data });
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

     // If file doesn't exist or is corrupt, start fresh
     if (error instanceof Error && error.message.includes('ENOENT')) {
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
 * Persist index to disk with atomic write (write to temp, then rename)
 */
async function persist(): Promise<void> {
   if (!_cache) return;

   try {
     const indexFile = getIndexFile();
     const tmpFile = indexFile + TMP_SUFFIX;
     _cache.lastUpdated = Date.now();
     await ensureDir();

     const jsonContent = JSON.stringify(_cache, null, 2);

     try {
       await writeFile(tmpFile, jsonContent, 'utf-8');
       // Try rename first (fast, atomic on Unix)
       try {
         renameSync(tmpFile, indexFile);
       } catch (renameErr) {
         // Fallback for Windows: if rename fails, direct write
         try {
           await writeFile(indexFile, jsonContent, 'utf-8');
           try { unlinkSync(tmpFile); } catch { /* ignore */ }
         } catch (writeErr) {
           // Re-throw original rename error if fallback also fails
           throw renameErr;
         }
       }
     } catch (error) {
       // Clean up temp file
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
   }
 }

// ============================================================
// Public API
// ============================================================

/** Store a pattern. If it exists, update it. */
export async function putPattern(pattern: DesignPattern): Promise<void> {
  try {
    const index = await loadIndex();
    index.patterns[pattern.id] = pattern;
    await persist();

// Also write individual file for resilience (best-effort)
      try {
        const filePath = join(getStorageDir(), `${pattern.id}.json`);
        const tmpFile = filePath + TMP_SUFFIX;
        await writeFile(tmpFile, JSON.stringify(pattern, null, 2), 'utf-8');
        renameSync(tmpFile, filePath);
      } catch (error) {
        // Individual file write failure is non-fatal (we have index.json)
        console.warn(`Failed to write pattern file: ${error instanceof Error ? error.message : String(error)}`);
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

    // Compute similarity based on keyword match ratio
    const allResults: PatternSearchResult[] = results.map(pattern => {
      let similarity = pattern.qualityScore / 10;
      if (query.text) {
        const tokens = query.text.toLowerCase().split(/\s+/).filter(t => t.length > 2);
        const searchText = [
          pattern.title.toLowerCase(),
          pattern.description.toLowerCase(),
          ...pattern.tags.map(t => t.toLowerCase()),
        ].join(' ');

        let matchCount = 0;
        for (const token of tokens) {
          if (searchText.includes(token)) matchCount++;
        }
        const tokenRatio = tokens.length > 0 ? matchCount / tokens.length : 0;
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
