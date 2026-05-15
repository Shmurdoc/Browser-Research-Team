// ============================================================
// Supabase Storage Backend (optional)
// ============================================================
//
// When SUPABASE_URL and SUPABASE_KEY env vars are set,
// patterns are synced to Supabase.
// ============================================================

import { type DesignPattern, type PatternId, type PatternQuery, type LibraryStats } from '../types.js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_KEY ?? '';

/** Check if Supabase is configured */
export function hasSupabase(): boolean {
  return !!(SUPABASE_URL && SUPABASE_KEY);
}

/** Get the pattern storage directory */
export function getPatternStorageDir(): string {
  return process.env.DPM_STORAGE_DIR ?? './patterns';
}

/** Sync a pattern to Supabase */
export async function syncToSupabase(pattern: DesignPattern): Promise<boolean> {
  if (!hasSupabase()) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/patterns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify(pattern),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Query patterns from Supabase */
export async function queryFromSupabase(query: PatternQuery): Promise<DesignPattern[]> {
  if (!hasSupabase()) return [];

  const params = new URLSearchParams();
  if (query.limit) params.set('limit', String(query.limit));
  if (query.offset) params.set('offset', String(query.offset));
  if (query.source) params.set('source', String(query.source));
  if (query.layoutType) params.set('layout_type', query.layoutType);

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/patterns?${params}`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    });
    if (!res.ok) return [];
    return await res.json() as DesignPattern[];
  } catch {
    return [];
  }
}
