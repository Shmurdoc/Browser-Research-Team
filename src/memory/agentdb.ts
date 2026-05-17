// ============================================================
// AgentDB — Vector Memory with Real Semantic Embeddings
// ============================================================
//
// Lightweight vector memory for sub-millisecond pattern retrieval.
// Uses cosine similarity search with real semantic embeddings
// from all-MiniLM-L6-v2 via @xenova/transformers (local, free).
// Falls back to hash-based embeddings if model fails to load.
// ============================================================

import {
  type DesignPattern,
  type PatternId,
  type PatternSearchResult,
} from '../types.js';
import { getPattern } from '../storage/local.js';
import { createLogger_Scoped } from '../logging/index.js';

const logger = createLogger_Scoped('agentdb');

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
let _embeddingPipeline: any = null;
let _pipelineReady = false;
let _pipelineError: string | null = null;

/** Initialize the embedding model (lazy, called on first use) */
async function getEmbeddingPipeline() {
  if (_pipelineReady) return _embeddingPipeline;
  if (_pipelineError) return null;

  // Skip model loading in test environment
  if (process.env.NODE_ENV === 'test') {
    _pipelineError = 'Model loading skipped in test environment';
    return null;
  }

  try {
    const { pipeline } = await import('@xenova/transformers');
    _embeddingPipeline = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
      { quantized: true }
    );
    _pipelineReady = true;
    logger.info('Embedding model loaded: all-MiniLM-L6-v2');
    return _embeddingPipeline;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    _pipelineError = message;
    logger.warn({ error: message }, 'Failed to load embedding model, using hash fallback');
    return null;
  }
}

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

/** Generate embedding using real model or hash fallback */
export async function generateEmbedding(pattern: DesignPattern): Promise<number[]> {
  const pipeline = await getEmbeddingPipeline();

  if (pipeline) {
    try {
      // Create text representation of the pattern
      const text = [
        pattern.title,
        pattern.description,
        pattern.layout.type,
        ...pattern.components,
        ...pattern.tags,
      ].filter(Boolean).join(' ');

      const output = await pipeline(text, { pooling: 'mean', normalize: true });
      const embedding = Array.from(output.data) as number[];
      return embedding;
    } catch (error) {
      logger.warn({ error: error instanceof Error ? error.message : String(error) }, 'Embedding inference failed, using hash fallback');
    }
  }

  // Hash-based fallback
  return generateHashEmbedding(pattern);
}

/** Hash-based embedding fallback (deterministic, no model needed) */
function generateHashEmbedding(pattern: DesignPattern): number[] {
  const features: number[] = [];

  const layoutHash = hashString(pattern.layout.type);
  features.push((layoutHash % 100) / 100);

  for (const key of ['primary', 'secondary', 'accent', 'neutral'] as const) {
    const colorVal = parseInt((pattern.colors as any)[key].replace('#', ''), 16);
    features.push(((colorVal >> 16) & 0xFF) / 255);
    features.push(((colorVal >> 8) & 0xFF) / 255);
    features.push((colorVal & 0xFF) / 255);
  }

  const allComponents = ['navbar', 'sidebar', 'footer', 'card', 'button', 'input',
    'form', 'table', 'modal', 'dropdown', 'accordion', 'tabs', 'carousel',
    'hero-section', 'feature-grid', 'pricing-card', 'cta-section', 'faq-section'];
  for (const comp of allComponents) {
    features.push(pattern.components.includes(comp as any) ? 1 : 0);
  }

  for (const fw of ['react', 'vue', 'svelte', 'angular'] as const) {
    features.push(pattern.frameworkHints.includes(fw) ? 1 : 0);
  }

  while (features.length < 64) {
    features.push(hashString(pattern.id + features.length) % 100 / 100);
  }

  return features.slice(0, 128);
}

/** Simple string hash */
function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const chr = s.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash);
}

// ============================================================
// Public API
// ============================================================

/** Index a pattern into vector memory */
export async function indexPattern(pattern: DesignPattern): Promise<void> {
  const embedding = await generateEmbedding(pattern);
  const normalized = normalize(embedding);

  _vectors = _vectors.filter(v => v.id !== pattern.id);

  _vectors.push({
    id: pattern.id,
    embedding: normalized,
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

/** Search vector memory by text query */
export async function searchVectors(
  queryText: string,
  limit: number = 20
): Promise<Array<{ id: PatternId; score: number }>> {
  if (_vectors.length === 0) return [];

  let queryEmbedding: number[];

  const pipeline = await getEmbeddingPipeline();
  if (pipeline) {
    try {
      const output = await pipeline(queryText, { pooling: 'mean', normalize: true });
      queryEmbedding = Array.from(output.data) as number[];
    } catch {
      queryEmbedding = textToEmbeddingFallback(queryText);
    }
  } else {
    queryEmbedding = textToEmbeddingFallback(queryText);
  }

  const normalizedQuery = normalize(queryEmbedding);

  const scored = _vectors.map(v => ({
    id: v.id,
    score: cosineSimilarity(Array.from(normalizedQuery), Array.from(v.embedding)),
  }));

  scored.sort((a, b) => {
    const aPattern = _vectors.find(v => v.id === a.id);
    const bPattern = _vectors.find(v => v.id === b.id);
    const aFinal = a.score * 0.7 + (aPattern ? aPattern.metadata.qualityScore / 10 * 0.3 : 0);
    const bFinal = b.score * 0.7 + (bPattern ? bPattern.metadata.qualityScore / 10 * 0.3 : 0);
    return bFinal - aFinal;
  });

  return scored.slice(0, limit);
}

/** Fallback: convert text to embedding via hash */
function textToEmbeddingFallback(text: string): number[] {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const dims = 128;
  const embedding = new Array(dims).fill(0);

  for (let i = 0; i < words.length; i++) {
    const hash = hashString(words[i]);
    const idx = hash % dims;
    embedding[idx] += 1.0;
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

/** Check if real embedding model is loaded */
export function isEmbeddingModelLoaded(): boolean {
  return _pipelineReady;
}

/** Get embedding model status */
export function getEmbeddingStatus(): { loaded: boolean; error: string | null } {
  return { loaded: _pipelineReady, error: _pipelineError };
}
