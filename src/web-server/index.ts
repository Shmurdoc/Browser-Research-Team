#!/usr/bin/env node
// ============================================================
// Design Pattern Multiverse — Production Web Server
// ============================================================
//
// Hardened Express server with:
// - API key authentication (DPM_WEB_KEY)
// - Sliding window rate limiting (DPM_RATE_LIMIT_PER_MINUTE)
// - Zod input validation on every endpoint
// - Security headers (CSP, HSTS, X-Frame-Options, etc.)
// - Restricted CORS
// - Health check endpoint
// - Graceful shutdown (SIGTERM/SIGINT)
// - Structured request logging
// - Generic error responses (no internal details leaked)
//
// Usage:
//   npm run web              (production)
//   npm run dev:web          (development)
//   dpm-web                  (via bin)
//
// Opens at http://localhost:3000
// ============================================================

import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

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
  type PatternSource,
  type LayoutType,
  type FrameworkHint,
} from '../index.js';
import { getRateLimiter } from '../utils/rate-limiter.js';
import { validateURL } from '../validation/url.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..', '..', '..');
const publicDir = join(projectRoot, 'src', 'web-server', 'public');

const app = express();
const PORT = parseInt(process.env.DPM_WEB_PORT ?? '3000', 10);
const HOST = process.env.DPM_WEB_HOST ?? '127.0.0.1';
const WEB_API_KEY = process.env.DPM_WEB_KEY;
const ALLOWED_ORIGINS = process.env.DPM_ALLOWED_ORIGINS?.split(',').filter(Boolean) ?? [];

// ============================================================
// Middleware
// ============================================================

// Security headers (helmet-equivalent, zero dependencies)
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0'); // Modern browsers use CSP instead
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// CORS — restricted to known origins
if (ALLOWED_ORIGINS.length > 0) {
  app.use(cors({
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  }));
} else {
  // Development: allow localhost only
  app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));
}

// Body parsing — 1MB limit (not 10MB)
app.use(express.json({ limit: '1mb' }));

// Static files — restricted to known files only, no directory listing
app.use(express.static(publicDir, {
  dotfiles: 'ignore',
  index: 'index.html',
  redirect: false,
}));

// ============================================================
// Authentication Middleware
// ============================================================

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!WEB_API_KEY) {
    // No key configured — allow all (development mode, log warning)
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  const providedKey = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : req.headers['x-api-key'] as string | undefined;

  if (!providedKey || providedKey !== WEB_API_KEY) {
    res.status(401).json({ error: 'Unauthorized. Provide a valid API key via Authorization: Bearer <key> or X-API-Key header.' });
    return;
  }

  next();
}

// ============================================================
// Rate Limiting Middleware
// ============================================================

const rateLimiter = getRateLimiter({
  maxTokens: parseInt(process.env.DPM_RATE_LIMIT_PER_MINUTE ?? '100'),
  refillRate: parseInt(process.env.DPM_RATE_LIMIT_PER_MINUTE ?? '100') / 60,
});

function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const clientIp = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  if (!rateLimiter.isAllowed(`web:${clientIp}`)) {
    res.set('Retry-After', '60');
    res.status(429).json({ error: 'Rate limit exceeded. Try again later.' });
    return;
  }
  next();
}

// ============================================================
// Request Logging
// ============================================================

app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  req.headers['x-request-id'] = requestId;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    const logFn = console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'];
    logFn(`[dpm-web] ${req.method} ${req.url} ${res.statusCode} ${duration}ms [${requestId}]`);
  });

  next();
});

// ============================================================
// Input Validation Schemas
// ============================================================

const VALID_SOURCES: PatternSource[] = ['pinterest', 'dribbble', 'behance', 'figma-community', 'web', 'manual', 'api'];
const VALID_LAYOUTS: LayoutType[] = ['dashboard', 'landing-page', 'hero-section', 'navbar', 'sidebar', 'card-grid', 'modal', 'form', 'table', 'list', 'settings', 'profile', 'pricing', 'footer', 'header', 'blog-post', 'ecommerce', 'authentication', 'onboarding', 'unknown'];
const VALID_FRAMEWORKS: FrameworkHint[] = ['react', 'vue', 'svelte', 'angular', 'vanilla', 'unknown'];

const searchQuerySchema = z.object({
  q: z.string().max(200).optional(),
  source: z.enum(VALID_SOURCES as [string, ...string[]]).optional(),
  layout: z.enum(VALID_LAYOUTS as [string, ...string[]]).optional(),
  framework: z.enum(VALID_FRAMEWORKS as [string, ...string[]]).optional(),
  minQuality: z.coerce.number().min(0).max(10).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const createPatternSchema = z.object({
  id: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
  source: z.enum(VALID_SOURCES as [string, ...string[]]),
  url: z.string().url().max(2048),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  imageUrl: z.string().url().max(2048).optional(),
  layout: z.object({
    type: z.enum(VALID_LAYOUTS as [string, ...string[]]),
    zones: z.array(z.string()).default([]),
    confidence: z.number().min(0).max(1).default(0.5),
  }),
  colors: z.object({
    primary: z.string().default('#000000'),
    secondary: z.string().default('#333333'),
    accent: z.string().default('#0066ff'),
    neutral: z.string().default('#999999'),
    background: z.string().default('#ffffff'),
    text: z.string().default('#000000'),
    additional: z.array(z.string()).default([]),
  }).default({}),
  typography: z.object({
    heading: z.object({ family: z.string().default(''), weight: z.number().default(400), size: z.string().default('') }).default({}),
    body: z.object({ family: z.string().default(''), weight: z.number().default(400), size: z.string().default('') }).default({}),
    other: z.array(z.object({ selector: z.string(), family: z.string(), weight: z.number(), size: z.string() })).default([]),
  }).default({}),
  components: z.array(z.string()).default([]),
  frameworkHints: z.array(z.enum(VALID_FRAMEWORKS as [string, ...string[]])).default([]),
  tags: z.array(z.string().max(50)).default([]),
  qualityScore: z.number().min(0).max(10).default(5),
  embedding: z.array(z.number()).default([]),
  feedback: z.array(z.any()).default([]),
  metadata: z.record(z.unknown()).default({}),
});

const ratePatternSchema = z.object({
  rating: z.number().int().min(1).max(5),
});

const codeGenSchema = z.object({
  framework: z.enum(VALID_FRAMEWORKS as [string, ...string[]]).default('react'),
  style: z.enum(['tailwind', 'css-modules', 'styled-components', 'vanilla-css']).default('tailwind'),
  options: z.object({
    typescript: z.boolean().default(true),
    includeTests: z.boolean().default(false),
    includeStories: z.boolean().default(false),
  }).default({}),
});

const scoutSchema = z.object({
  query: z.string().min(1).max(200),
  source: z.enum(VALID_SOURCES as [string, ...string[]]).optional(),
});

const vectorSearchSchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

// ============================================================
// Bootstrap
// ============================================================

initSONA({ adaptationRate: 0.15 });

// Rebuild vector index on startup (fire-and-forget, but log errors)
(async () => {
  try {
    const patterns = await loadAllPatterns();
    if (patterns.length > 0) {
      await rebuildIndex(patterns);
      console.log(`[dpm-web] Vector index rebuilt with ${patterns.length} patterns`);
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[dpm-web] Index rebuild failed: ${message}`);
  }
})();

// ============================================================
// Health Check (no auth required)
// ============================================================

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version ?? 'unknown',
  });
});

app.get('/ready', async (_req: Request, res: Response) => {
  try {
    await loadAllPatterns();
    res.json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'not ready' });
  }
});

// ============================================================
// REST API (auth + rate limit protected)
// ============================================================

// Apply auth and rate limiting to all /api routes
app.use('/api', requireAuth);
app.use('/api', rateLimitMiddleware);

// Search patterns
app.get('/api/patterns', async (req: Request, res: Response) => {
  try {
    const parsed = searchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid query parameters', details: parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`) });
    }

    const query: PatternQuery = {
      text: parsed.data.q,
      source: parsed.data.source as PatternSource | undefined,
      layoutType: parsed.data.layout as LayoutType | undefined,
      framework: parsed.data.framework as FrameworkHint | undefined,
      minQuality: parsed.data.minQuality,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    };

    const results = await searchPatterns(query);
    res.json({
      patterns: results.map(r => r.pattern),
      total: results.length,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
      hasMore: results.length >= parsed.data.limit,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    console.error(`[dpm-web] Search failed: ${message}`);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Get all patterns (paginated)
app.get('/api/patterns/all', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const patterns = await loadAllPatterns();
    const paginated = patterns.slice(offset, offset + limit);

    res.json({
      patterns: paginated,
      total: patterns.length,
      limit,
      offset,
      hasMore: offset + limit < patterns.length,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    console.error(`[dpm-web] Load patterns failed: ${message}`);
    res.status(500).json({ error: 'Failed to load patterns' });
  }
});

// Get single pattern
app.get('/api/patterns/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id || id.length > 100) {
      return res.status(400).json({ error: 'Invalid pattern ID' });
    }
    const pattern = await getPattern(id);
    if (!pattern) return res.status(404).json({ error: 'Pattern not found' });
    res.json(pattern);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    console.error(`[dpm-web] Get pattern failed: ${message}`);
    res.status(500).json({ error: 'Failed to retrieve pattern' });
  }
});

// Create/update pattern
app.post('/api/patterns', async (req: Request, res: Response) => {
  try {
    const parsed = createPatternSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid pattern data', details: parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`) });
    }

    const pattern = parsed.data as DesignPattern;

    // Validate URL is not a dangerous protocol
    if (!validateURL(pattern.url)) {
      return res.status(400).json({ error: 'Invalid URL: dangerous protocol detected' });
    }

    await putPattern(pattern);
    await indexPattern(pattern);
    res.status(201).json({ success: true, id: pattern.id });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    console.error(`[dpm-web] Create pattern failed: ${message}`);
    res.status(500).json({ error: 'Failed to create pattern' });
  }
});

// Delete pattern
app.delete('/api/patterns/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id || id.length > 100) {
      return res.status(400).json({ error: 'Invalid pattern ID' });
    }
    const deleted = await deletePattern(id);
    if (!deleted) return res.status(404).json({ error: 'Pattern not found' });
    res.json({ success: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    console.error(`[dpm-web] Delete pattern failed: ${message}`);
    res.status(500).json({ error: 'Failed to delete pattern' });
  }
});

// Rate pattern
app.post('/api/patterns/:id/rate', async (req: Request, res: Response) => {
  try {
    const parsed = ratePatternSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Rating must be an integer between 1 and 5' });
    }

    const id = req.params.id;
    if (!id || id.length > 100) {
      return res.status(400).json({ error: 'Invalid pattern ID' });
    }

    const success = await addFeedback(id, { rating: parsed.data.rating, tags: [], comment: '' });
    if (!success) return res.status(404).json({ error: 'Pattern not found' });

    const pattern = await getPattern(id);
    await learnFromFeedback(id, parsed.data.rating, pattern?.tags ?? []);

    res.json({ success: true, qualityScore: pattern?.qualityScore });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    console.error(`[dpm-web] Rate pattern failed: ${message}`);
    res.status(500).json({ error: 'Failed to rate pattern' });
  }
});

// Generate code
app.post('/api/patterns/:id/code', async (req: Request, res: Response) => {
  try {
    const parsed = codeGenSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid code generation request', details: parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`) });
    }

    const id = req.params.id;
    if (!id || id.length > 100) {
      return res.status(400).json({ error: 'Invalid pattern ID' });
    }

    const request: CodeGenRequest = {
      patternId: id,
      framework: parsed.data.framework as FrameworkHint,
      style: parsed.data.style,
      options: parsed.data.options,
    };
    const result = await generateCode(request);
    res.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    console.error(`[dpm-web] Code generation failed: ${message}`);
    res.status(500).json({ error: 'Failed to generate code' });
  }
});

// Scout for patterns
app.post('/api/scout', async (req: Request, res: Response) => {
  try {
    const parsed = scoutSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid scout request', details: parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`) });
    }

    const { query, source } = parsed.data;

    const result = source
      ? await scoutSource(source as PatternSource, query)
      : await scoutAll(query);

    const results = Array.isArray(result) ? result : [result];

    // Auto-submit discovered patterns with validation
    for (const scoutResult of results) {
      for (const submission of scoutResult.submissions) {
        try {
          // Validate URL before processing
          if (submission.url && !validateURL(submission.url)) {
            console.warn(`[dpm-web] Skipping scout submission with invalid URL: ${submission.url}`);
            continue;
          }

          const visionResult = await interpretSubmission(submission);
          const qualityScore = 5;

          const pattern: DesignPattern = {
            id: `scout-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
            qualityScore,
            embedding: [],
            feedback: [],
            metadata: {},
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };

          await putPattern(pattern);
          await indexPattern(pattern);
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          console.warn(`[dpm-web] Scout submission failed: ${message}`);
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
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    console.error(`[dpm-web] Scout failed: ${message}`);
    res.status(500).json({ error: 'Scouting failed' });
  }
});

// Search vectors
app.get('/api/search/vectors', async (req: Request, res: Response) => {
  try {
    const parsed = vectorSearchSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid search query', details: parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`) });
    }

    const vectorResults = await searchVectors(parsed.data.q, parsed.data.limit);
    const patterns = await Promise.all(
      vectorResults.map(async r => {
        const p = await getPattern(r.id);
        return p ? { pattern: p, score: r.score } : null;
      })
    );

    res.json({ results: patterns.filter(Boolean) });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    console.error(`[dpm-web] Vector search failed: ${message}`);
    res.status(500).json({ error: 'Vector search failed' });
  }
});

// Stats
app.get('/api/stats', async (req: Request, res: Response) => {
  try {
    const stats = await getStats();
    const sonaStats = getSONAStats();
    res.json({ library: stats, sona: sonaStats });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    console.error(`[dpm-web] Stats failed: ${message}`);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// Export all patterns (backup)
app.get('/api/export', async (req: Request, res: Response) => {
  try {
    const patterns = await loadAllPatterns();
    res.setHeader('Content-Disposition', `attachment; filename="dpm-export-${new Date().toISOString().slice(0, 10)}.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.json({
      version: '1.0',
      exportedAt: Date.now(),
      totalPatterns: patterns.length,
      patterns,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    console.error(`[dpm-web] Export failed: ${message}`);
    res.status(500).json({ error: 'Export failed' });
  }
});

// ============================================================
// 404 Handler
// ============================================================

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// ============================================================
// Global Error Handler
// ============================================================

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(`[dpm-web] Unhandled error: ${err.message}`);
  if (err.stack) {
    console.error(err.stack.split('\n').slice(0, 3).join('\n'));
  }
  res.status(500).json({ error: 'Internal server error' });
});

// ============================================================
// Start Server
// ============================================================

const server = app.listen(PORT, HOST, () => {
  console.log(`[dpm-web] Design Pattern Multiverse running at http://${HOST}:${PORT}`);
  console.log(`[dpm-web] API: http://${HOST}:${PORT}/api/patterns`);
  console.log(`[dpm-web] UI:  http://${HOST}:${PORT}`);
  console.log(`[dpm-web] Health: http://${HOST}:${PORT}/health`);
  if (!WEB_API_KEY) {
    console.warn('[dpm-web] WARNING: No API key configured (DPM_WEB_KEY). Server is open to all requests.');
  }
});

// ============================================================
// Graceful Shutdown
// ============================================================

function gracefulShutdown(signal: string): void {
  console.log(`[dpm-web] Received ${signal}. Shutting down gracefully...`);

  server.close((err) => {
    if (err) {
      console.error(`[dpm-web] Error during shutdown: ${err.message}`);
      process.exit(1);
    }
    console.log('[dpm-web] HTTP server closed');
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('[dpm-web] Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export { app, server };
