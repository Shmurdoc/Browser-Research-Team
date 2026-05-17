#!/usr/bin/env node
// ============================================================
// Design Pattern Multiverse — Web Server
// ============================================================
//
// Lightweight Express server serving a single-page web UI
// and REST API for pattern browsing, search, and code generation.
//
// Usage:
//   npm run web              (production)
//   npm run dev:web          (development)
//   dpm-web                  (via bin)
//
// Opens at http://localhost:3000
// ============================================================

import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  searchPatterns,
  getPattern,
  putPattern,
  deletePattern,
  addFeedback,
  getStats,
  loadAllPatterns,
  scoutAll,
  scoutSource,
  interpretSubmission,
  generateCode,
  initSONA,
  learnFromFeedback,
  getSONAStats,
  indexPattern,
  searchVectors,
  rebuildIndex,
  type PatternQuery,
  type DesignPattern,
  type CodeGenRequest,
} from '../index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = parseInt(process.env.DPM_WEB_PORT ?? '3000', 10);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(join(__dirname, 'public')));

// ============================================================
// Bootstrap
// ============================================================

initSONA({ adaptationRate: 0.15 });

// Rebuild vector index on startup
(async () => {
  try {
    const patterns = await loadAllPatterns();
    if (patterns.length > 0) {
      await rebuildIndex(patterns);
      console.log(`[dpm-web] Vector index rebuilt with ${patterns.length} patterns`);
    }
  } catch (e: any) {
    console.error(`[dpm-web] Index rebuild skipped: ${e.message}`);
  }
})();

// ============================================================
// REST API
// ============================================================

// Search patterns
app.get('/api/patterns', async (req: Request, res: Response) => {
  try {
    const query: PatternQuery = {
      text: req.query.q as string,
      source: req.query.source as any,
      layoutType: req.query.layout as any,
      framework: req.query.framework as any,
      minQuality: req.query.minQuality ? parseFloat(req.query.minQuality as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
    };

    const results = await searchPatterns(query);
    res.json({ patterns: results.map(r => r.pattern), total: results.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Get all patterns
app.get('/api/patterns/all', async (req: Request, res: Response) => {
  try {
    const patterns = await loadAllPatterns();
    res.json({ patterns, total: patterns.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Get single pattern
app.get('/api/patterns/:id', async (req: Request, res: Response) => {
  try {
    const pattern = await getPattern(req.params.id);
    if (!pattern) return res.status(404).json({ error: 'Pattern not found' });
    res.json(pattern);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Create/update pattern
app.post('/api/patterns', async (req: Request, res: Response) => {
  try {
    const pattern = req.body as DesignPattern;
    await putPattern(pattern);
    await indexPattern(pattern);
    res.json({ success: true, id: pattern.id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Delete pattern
app.delete('/api/patterns/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await deletePattern(req.params.id);
    res.json({ success: deleted });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Rate pattern
app.post('/api/patterns/:id/rate', async (req: Request, res: Response) => {
  try {
    const { rating } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be 1-5' });
    }
    const success = await addFeedback(req.params.id, { rating, tags: [], comment: '' });
    if (!success) return res.status(404).json({ error: 'Pattern not found' });

    const pattern = await getPattern(req.params.id);
    await learnFromFeedback(req.params.id, rating, pattern?.tags ?? []);

    res.json({ success: true, qualityScore: pattern?.qualityScore });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Generate code
app.post('/api/patterns/:id/code', async (req: Request, res: Response) => {
  try {
    const { framework = 'react', style = 'tailwind', options = {} } = req.body;
    const request: CodeGenRequest = {
      patternId: req.params.id,
      framework,
      style,
      options,
    };
    const result = await generateCode(request);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Scout for patterns
app.post('/api/scout', async (req: Request, res: Response) => {
  try {
    const { query, source } = req.body;
    if (!query) return res.status(400).json({ error: 'Query required' });

    const result = source
      ? await scoutSource(source, query)
      : await scoutAll(query);

    // Normalize to array of results
    const results = Array.isArray(result) ? result : [result];

    // Auto-submit discovered patterns
    for (const scoutResult of results) {
      for (const submission of scoutResult.submissions) {
        try {
          const visionResult = await interpretSubmission(submission);
          const qualityScore = 5; // Default score for new submissions

          const pattern: DesignPattern = {
            id: `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            source: submission.source,
            url: submission.url,
            title: submission.title || 'Untitled',
            description: submission.description || '',
            imageUrl: submission.imageUrl,
            layout: visionResult.layout,
            colors: visionResult.colors,
            typography: visionResult.typography,
            components: visionResult.components,
            frameworkHints: ['react'],
            tags: submission.tags || [],
            qualityScore: qualityScore,
            embedding: [],
            feedback: [],
            metadata: {},
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };

          await putPattern(pattern);
          await indexPattern(pattern);
        } catch {
          // Skip failed submissions
        }
      }
    }

    const totalFound = results.reduce((sum, r) => sum + r.submissions.length, 0);
    const allErrors = results.flatMap(r => r.errors);

    res.json({
      sources: results.map(r => r.source),
      found: totalFound,
      errors: allErrors,
      tookMs: results.reduce((sum, r) => sum + r.tookMs, 0),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Search vectors
app.get('/api/search/vectors', async (req: Request, res: Response) => {
  try {
    const q = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || 10;
    if (!q) return res.status(400).json({ error: 'Query required' });

    const vectorResults = await searchVectors(q, limit);
    const patterns = await Promise.all(
      vectorResults.map(async r => {
        const p = await getPattern(r.id);
        return p ? { pattern: p, score: r.score } : null;
      })
    );

    res.json({ results: patterns.filter(Boolean) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Stats
app.get('/api/stats', async (req: Request, res: Response) => {
  try {
    const stats = await getStats();
    const sonaStats = getSONAStats();
    res.json({ library: stats, sona: sonaStats });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// Start
// ============================================================

const server = app.listen(PORT, () => {
  console.log(`[dpm-web] Design Pattern Multiverse running at http://localhost:${PORT}`);
  console.log(`[dpm-web] API: http://localhost:${PORT}/api/patterns`);
  console.log(`[dpm-web] UI:  http://localhost:${PORT}`);
});

export { app, server };
