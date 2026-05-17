// ============================================================
// Supabase Storage Backend
// ============================================================
//
// Full CRUD interface matching local storage.
// When SUPABASE_URL and SUPABASE_KEY are set, this becomes
// the primary storage backend with local as fallback.
// ============================================================

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
import { createLogger_Scoped } from '../logging/index.js';

const logger = createLogger_Scoped('storage:supabase');

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_KEY ?? '';

/** Check if Supabase is configured */
export function hasSupabase(): boolean {
  return !!(SUPABASE_URL && SUPABASE_KEY);
}

/** Get the pattern storage directory (local fallback path) */
export function getPatternStorageDir(): string {
  return process.env.DPM_STORAGE_DIR ?? './patterns';
}

/** In-memory cache for Supabase patterns */
let _cache: Map<PatternId, DesignPattern> | null = null;

/** Reset the cache (for testing) */
export function _resetCache(): void {
  _cache = null;
}

/** Get or initialize the cache */
async function getCache(): Promise<Map<PatternId, DesignPattern>> {
  if (_cache) return _cache;

  _cache = new Map();
  try {
    const patterns = await fetchAllFromSupabase();
    for (const p of patterns) {
      _cache!.set(p.id, p);
    }
    logger.info({ count: _cache.size }, 'Supabase cache loaded');
  } catch (error) {
    logger.warn({ error: error instanceof Error ? error.message : String(error) }, 'Failed to load Supabase cache');
  }

  return _cache;
}

/** Fetch all patterns from Supabase */
async function fetchAllFromSupabase(): Promise<DesignPattern[]> {
  if (!hasSupabase()) return [];

  const res = await fetch(`${SUPABASE_URL}/rest/v1/patterns?select=*&limit=1000`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) return [];
  return await res.json() as DesignPattern[];
}

/** Upsert a pattern in Supabase */
export async function putPattern(pattern: DesignPattern): Promise<boolean> {
  if (!hasSupabase()) return false;

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/patterns`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(pattern),
    });

    if (res.ok) {
      _cache?.set(pattern.id, pattern);
      return true;
    }

    // If insert fails, try update
    const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/patterns?id=eq.${pattern.id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(pattern),
    });

    if (updateRes.ok) {
      _cache?.set(pattern.id, pattern);
      return true;
    }

    logger.warn({ status: updateRes.status }, 'Supabase put failed');
    return false;
  } catch (error) {
    logger.warn({ error: error instanceof Error ? error.message : String(error) }, 'Supabase put error');
    return false;
  }
}

/** Get a pattern by ID */
export async function getPattern(id: PatternId): Promise<DesignPattern | null> {
  if (!hasSupabase()) return null;

  const cache = await getCache();
  if (cache.has(id)) return cache.get(id) ?? null;

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/patterns?id=eq.${id}&select=*`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    });

    if (!res.ok) return null;
    const patterns = await res.json() as DesignPattern[];
    if (patterns.length === 0) return null;

    const pattern = patterns[0];
    cache.set(id, pattern);
    return pattern;
  } catch {
    return null;
  }
}

/** Delete a pattern by ID */
export async function deletePattern(id: PatternId): Promise<boolean> {
  if (!hasSupabase()) return false;

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/patterns?id=eq.${id}`, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    });

    if (res.ok) {
      _cache?.delete(id);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Search patterns with filters */
export async function searchPatterns(query: PatternQuery): Promise<PatternSearchResult[]> {
  if (!hasSupabase()) return [];

  const cache = await getCache();
  let patterns = Array.from(cache.values());

  // Text search
  if (query.text) {
    const tokens = query.text.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    const stopWords = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from']);
    const keywords = tokens.filter(t => !stopWords.has(t));

    if (keywords.length > 0) {
      patterns = patterns.filter(p => {
        const searchText = [
          p.title.toLowerCase(),
          p.description.toLowerCase(),
          ...p.tags.map(t => t.toLowerCase()),
          ...p.components.map(c => c.toLowerCase()),
        ].join(' ');
        return keywords.some(kw => searchText.includes(kw));
      });
    }
  }

  // Source filter
  if (query.source) {
    const sources = Array.isArray(query.source) ? query.source : [query.source];
    patterns = patterns.filter(p => sources.includes(p.source));
  }

  // Layout filter
  if (query.layoutType) {
    patterns = patterns.filter(p => p.layout.type === query.layoutType);
  }

  // Component filter
  if (query.components && query.components.length > 0) {
    patterns = patterns.filter(p =>
      query.components!.some(c => p.components.includes(c))
    );
  }

  // Framework filter
  if (query.framework) {
    patterns = patterns.filter(p => p.frameworkHints.includes(query.framework!));
  }

  // Quality filter
  if (query.minQuality !== undefined) {
    patterns = patterns.filter(p => p.qualityScore >= query.minQuality!);
  }

  // Sort by quality score desc
  patterns.sort((a, b) => b.qualityScore - a.qualityScore);

  // Compute similarity
  const offset = query.offset ?? 0;
  const limit = query.limit ?? 20;
  const sliced = patterns.slice(offset, offset + limit);

  return sliced.map(p => ({
    pattern: p,
    similarity: Math.min(1, p.qualityScore / 10),
  }));
}

/** Add feedback/rating to a pattern */
export async function addFeedback(
  id: PatternId,
  rating: number,
  comment?: string
): Promise<boolean> {
  if (!hasSupabase()) return false;

  const pattern = await getPattern(id);
  if (!pattern) return false;

  const feedbackEntry = {
    rating,
    tags: [],
    comment: comment ?? '',
    timestamp: Date.now(),
  };

  pattern.feedback = [...(pattern.feedback ?? []), feedbackEntry];

  // Recalculate quality score
  const ratings = pattern.feedback.map(f => f.rating);
  pattern.qualityScore = ratings.reduce((a, b) => a + b, 0) / ratings.length;

  return putPattern(pattern);
}

/** Get library statistics */
export async function getStats(): Promise<LibraryStats> {
  if (!hasSupabase()) {
    return {
      totalPatterns: 0,
      totalSources: {} as Record<PatternSource, number>,
      topLayouts: [],
      topComponents: [],
      averageQuality: 0,
      totalFeedback: 0,
    };
  }

  const cache = await getCache();
  const patterns = Array.from(cache.values());

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
}

/** Get all pattern IDs */
export async function getAllIds(): Promise<PatternId[]> {
  const cache = await getCache();
  return Array.from(cache.keys());
}

/** Load all patterns (for vector index rebuild) */
export async function loadAllPatterns(): Promise<DesignPattern[]> {
  const cache = await getCache();
  return Array.from(cache.values());
}
