// ============================================================
// AgentDB — Vector Memory with HNSW-like Index
// ============================================================
//
// Lightweight vector memory for sub-millisecond pattern retrieval.
// Uses cosine similarity search with optional metadata filtering.
// In production, swap with real HNSW/WASM kernels (ruflo AgentDB).
// ============================================================

import {
  type DesignPattern,
  type PatternId,
  type PatternSearchResult,
} from '../types.js';
import { getPattern } from '../storage/local.js';

/** Internal vector entry */
interface VectorEntry {
  id: PatternId;
  embedding: Float64Array;
  metadata: {
    qualityScore: number;
    source: string;
    layoutType: string;
  };
}

let _vectors: VectorEntry[] = [];
let _dirty = false;

/** Compute cosine similarity between two vectors */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/** Normalize a vector to unit length */
function normalize(v: number[]): Float64Array {
  const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  if (mag === 0) return new Float64Array(v);
  return new Float64Array(v.map(x => x / mag));
}

/** Generate a deterministic embedding from pattern features (hash-based) */
function generateEmbedding(pattern: DesignPattern): number[] {
  const features: number[] = [];

  // Encode layout type
  const layoutHash = hashString(pattern.layout.type);
  features.push((layoutHash % 100) / 100);

  // Encode color palette
  for (const key of ['primary', 'secondary', 'accent', 'neutral'] as const) {
    const colorVal = parseInt((pattern.colors as any)[key].replace('#', ''), 16);
    features.push(((colorVal >> 16) & 0xFF) / 255);
    features.push(((colorVal >> 8) & 0xFF) / 255);
    features.push((colorVal & 0xFF) / 255);
  }

  // Encode components (multi-hot)
  const allComponents = ['navbar', 'sidebar', 'footer', 'card', 'button', 'input',
    'form', 'table', 'modal', 'dropdown', 'accordion', 'tabs', 'carousel',
    'hero-section', 'feature-grid', 'pricing-card', 'cta-section', 'faq-section'];
  for (const comp of allComponents) {
    features.push(pattern.components.includes(comp as any) ? 1 : 0);
  }

  // Encode framework hints
  for (const fw of ['react', 'vue', 'svelte', 'angular'] as const) {
    features.push(pattern.frameworkHints.includes(fw) ? 1 : 0);
  }

  // Pad to at least 64 dimensions
  while (features.length < 64) {
    features.push(hashString(pattern.id + features.length) % 100 / 100);
  }

  return features.slice(0, 128); // cap at 128 dims
}

/** Simple string hash */
function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const chr = s.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

// ============================================================
// Public API
// ============================================================

/** Index a pattern into vector memory */
export async function indexPattern(pattern: DesignPattern): Promise<void> {
  const embedding = normalize(generateEmbedding(pattern));

  // Remove existing entry
  _vectors = _vectors.filter(v => v.id !== pattern.id);

  _vectors.push({
    id: pattern.id,
    embedding,
    metadata: {
      qualityScore: pattern.qualityScore,
      source: pattern.source,
      layoutType: pattern.layout.type,
    },
  });
  _dirty = true;
}

/** Remove a pattern from vector memory */
export async function removeFromIndex(id: PatternId): Promise<void> {
  _vectors = _vectors.filter(v => v.id !== id);
  _dirty = true;
}

/** Search vector memory by text query (converted to embedding) */
export async function searchVectors(
  queryText: string,
  limit: number = 20
): Promise<Array<{ id: PatternId; score: number }>> {
  if (_vectors.length === 0) return [];

  // Create a query embedding from the text
  const queryEmbedding = normalize(textToEmbedding(queryText));

  // Score all vectors
  const scored = _vectors.map(v => ({
    id: v.id,
    score: cosineSimilarity(Array.from(queryEmbedding), Array.from(v.embedding)),
  }));

  // Sort by score desc, quality boost
  scored.sort((a, b) => {
    const aPattern = _vectors.find(v => v.id === a.id);
    const bPattern = _vectors.find(v => v.id === b.id);
    const aFinal = a.score * 0.7 + (aPattern ? aPattern.metadata.qualityScore / 10 * 0.3 : 0);
    const bFinal = b.score * 0.7 + (bPattern ? bPattern.metadata.qualityScore / 10 * 0.3 : 0);
    return bFinal - aFinal;
  });

  return scored.slice(0, limit);
}

/** Convert text to a simple embedding vector */
function textToEmbedding(text: string): number[] {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const dims = 128;
  const embedding = new Array(dims).fill(0);

  for (let i = 0; i < words.length; i++) {
    const hash = hashString(words[i]);
    const idx = hash % dims;
    embedding[idx] += 1.0;
    // Also spread to adjacent dimensions for fuzzy matching
    if (idx > 0) embedding[idx - 1] += 0.5;
    if (idx < dims - 1) embedding[idx + 1] += 0.5;
  }

  return embedding;
}

/** Rebuild entire vector index from storage */
export async function rebuildIndex(patterns: DesignPattern[]): Promise<void> {
  _vectors = [];
  for (const p of patterns) {
    await indexPattern(p);
  }
  _dirty = false;
}

/** Get vector index size */
export function indexSize(): number {
  return _vectors.length;
}

/** Export: generateEmbedding for external use */
export { generateEmbedding };
