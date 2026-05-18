#!/usr/bin/env node
// ============================================================
// Design Pattern Multiverse — MCP Server
// ============================================================
//
// Model Context Protocol server for OpenCode integration.
// Exposes design pattern research, search, and code generation
// as MCP tools that any MCP-compatible client can use.
//
// Usage:
//   npm run dev:mcp          (development)
//   dpm-mcp                  (production via bin)
//
// OpenCode config (claude.json or settings):
//   "mcpServers": {
//     "design-pattern-multiverse": {
//       "command": "node",
//       "args": ["path/to/dist/mcp-server/index.js"]
//     }
//   }
// ============================================================

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { nanoid } from 'nanoid';

import {
  searchPatterns,
  getPattern,
  putPattern,
  addFeedback,
  getStats,
  scoutAll,
  scoutSource,
  interpretSubmission,
  generateCode,
  assessQuality,
  initSONA,
  learnFromFeedback,
  getSONAStats,
  indexPattern,
  searchVectors,
  rebuildIndex,
  assignTaxonomy,
  initRouter,
  initReasoningBank,
  type PatternQuery,
  type DesignPattern,
  type CodeGenRequest,
  type LibraryStats,
  type PatternSubmission,
  type ColorPalette,
  type TypographyInfo,
  type LayoutInfo,
  type ComponentType,
} from '../src/index.js';
import { config, hasMcpAuth } from '../src/config.js';
import { coerceSource, coerceLayout, coerceFramework, coerceSourceList } from './type-guards.js';

// ============================================================
// Auth — API key validation
// ============================================================

function validateAuth(): boolean {
  if (!hasMcpAuth) return true; // no auth configured = allow all
  const providedKey = process.env.DPM_MCP_KEY_PROVIDED;
  return providedKey === config.mcpServerKey;
}

// ============================================================
// Rate Limiting — Sliding window
// ============================================================

interface RateWindow {
  requests: number[];
}

const _rateWindow: RateWindow = { requests: [] };

function checkRateLimit(): boolean {
  const now = Date.now();
  const windowMs = 60_000; // 1 minute
  const maxRequests = config.rateLimitPerMinute;

  // Remove expired entries
  _rateWindow.requests = _rateWindow.requests.filter(t => now - t < windowMs);

  if (_rateWindow.requests.length >= maxRequests) {
    return false;
  }

  _rateWindow.requests.push(now);
  return true;
}

// ============================================================
// Bootstrap
// ============================================================

// Initialize SONA learning on startup
initSONA({ adaptationRate: 0.15 });

// Initialize Q-Learning router
initRouter();

// Initialize ReasoningBank
initReasoningBank();

// Rebuild vector index from storage on startup
(async () => {
  try {
    const { loadAllPatterns } = await import('../src/storage/local.js');
    const patterns = await loadAllPatterns();
    if (patterns.length > 0) {
      await rebuildIndex(patterns);
      console.error(`[dpm] Rebuilt vector index with ${patterns.length} patterns`);
    }
  } catch (e: any) {
    console.error(`[dpm] Index rebuild: ${e.message}`);
  }
})();

// ============================================================
// Server Setup
// ============================================================

const server = new Server(
  {
    name: 'design-pattern-multiverse',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

// ============================================================
// Tool Handlers
// ============================================================

interface ToolHandler {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler: (args: Record<string, unknown>) => Promise<CallToolResult>;
}

const tools: ToolHandler[] = [
  // ----------------------------------------------------------
  // search_patterns
  // ----------------------------------------------------------
  {
    name: 'search_patterns',
    description: `Search the design pattern library for UI/UX patterns matching your query.
Returns patterns with layout information, color palettes, typography, and component classifications.
Results include similarity scores and quality ratings.

Examples:
  - "dark mode dashboard with sidebar"
  - "hero section gradient"
  - "SaaS landing page pricing"
  - "login form authentication"`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language search query (e.g. "dark mode dashboard", "pricing page with cards")',
        },
        source: {
          type: 'string',
          description: 'Filter by source: pinterest, dribbble, behance, figma-community',
          enum: ['pinterest', 'dribbble', 'behance', 'figma-community', 'all'],
        },
        layout_type: {
          type: 'string',
          description: 'Filter by layout type: dashboard, landing-page, hero-section, navbar, form, pricing, etc',
        },
        framework: {
          type: 'string',
          description: 'Filter by framework: react, vue, svelte, angular',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default: 10, max: 50)',
          default: 10,
        },
        min_quality: {
          type: 'number',
          description: 'Minimum quality score 0-10 (default: 0)',
          default: 0,
        },
      },
      required: ['query'],
    },
    handler: async (args) => {
      const query = z.string().min(1).parse(args.query);
      const limit = Math.min(z.number().optional().parse(args.limit) ?? 10, 50);
      const source = z.string().optional().parse(args.source);
      const layoutType = z.string().optional().parse(args.layout_type);
      const framework = z.string().optional().parse(args.framework);
      const minQuality = z.number().optional().parse(args.min_quality) ?? 0;

      const pq: PatternQuery = {
        text: query,
        limit,
        minQuality,
        source: coerceSource(source),
        layoutType: coerceLayout(layoutType),
        framework: coerceFramework(framework),
      };

      try {
        // Search local storage
        const results = await searchPatterns(pq);

        // Also search vector memory
        const vectorResults = await searchVectors(query, limit);
        const vectorIds = new Set(vectorResults.map(v => v.id));

        // Merge: prefer local results, supplement with vector
        const merged = new Map<string, typeof results[0]>();
        for (const r of results) {
          merged.set(r.pattern.id, r);
        }

        // Add vector results not already found
        for (const vr of vectorResults) {
          if (!merged.has(vr.id)) {
            const pattern = await getPattern(vr.id);
            if (pattern) {
              merged.set(vr.id, { pattern, similarity: vr.score });
            }
          }
        }

        const finalResults = Array.from(merged.values())
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, limit);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: finalResults.length,
              query,
              results: finalResults.map(r => ({
                id: r.pattern.id,
                title: r.pattern.title,
                description: r.pattern.description,
                source: r.pattern.source,
                url: r.pattern.url,
                layout: r.pattern.layout,
                colors: r.pattern.colors,
                components: r.pattern.components,
                tags: r.pattern.tags,
                qualityScore: r.pattern.qualityScore,
                similarity: Number(r.similarity.toFixed(3)),
                frameworkHints: r.pattern.frameworkHints,
              })),
            }, null, 2),
          }],
        };
      } catch (e: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Search error: ${e.message}` }],
        };
      }
    },
  },

  // ----------------------------------------------------------
  // discover_patterns — Research the internet
  // ----------------------------------------------------------
  {
    name: 'discover_patterns',
    description: `Research the internet for design patterns matching your query.
Searches Pinterest, Dribbble, Behance, and Figma Community simultaneously.
Returns raw submissions that can be saved to the library via submit_pattern.

Examples:
  - "modern dashboard design"
  - "SaaS landing page"
  - "dark mode UI components"`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'What design pattern to search for (e.g. "dashboard analytics", "pricing page")',
        },
        sources: {
          type: 'string',
          description: 'Comma-separated sources to search (default: all). Options: pinterest, dribbble, behance, figma-community',
          default: 'all',
        },
        limit_per_source: {
          type: 'number',
          description: 'Max results per source (default: 5)',
          default: 5,
        },
      },
      required: ['query'],
    },
    handler: async (args) => {
      const query = z.string().min(1).parse(args.query);
      const sourcesArg = z.string().optional().parse(args.sources) ?? 'all';

      try {
        const sourceList = coerceSourceList(sourcesArg);

        const results = await Promise.all(
          sourceList.map(source => scoutSource(source, query))
        );

        const allSubmissions = results.flatMap(r => r.submissions);
        const allErrors = results.flatMap(r => r.errors);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              query,
              sources_searched: sourceList,
              total_found: allSubmissions.length,
              warnings: allErrors.filter((e, i, a) => a.indexOf(e) === i), // dedup
              submissions: allSubmissions.map(s => ({
                source: s.source,
                title: s.title,
                url: s.url,
                description: s.description,
                tags: s.tags,
              })),
            }, null, 2),
          }],
        };
      } catch (e: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Discovery error: ${e.message}` }],
        };
      }
    },
  },

  // ----------------------------------------------------------
  // submit_pattern — Submit a new pattern to the library
  // ----------------------------------------------------------
  {
    name: 'submit_pattern',
    description: `Save a discovered design pattern into the local library.
Runs the vision pipeline (layout detection, color extraction, component classification)
and quality assessment before storing. Returns the created pattern.

Use this after discover_patterns to save interesting patterns permanently.`,
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'Source of the pattern',
          enum: ['pinterest', 'dribbble', 'behance', 'figma-community', 'web', 'manual'],
        },
        url: {
          type: 'string',
          description: 'Original URL of the design',
        },
        title: {
          type: 'string',
          description: 'Pattern title',
        },
        description: {
          type: 'string',
          description: 'Description of the design pattern',
        },
        tags: {
          type: 'string',
          description: 'Comma-separated tags (e.g. "modern, dashboard, analytics")',
        },
        image_url: {
          type: 'string',
          description: 'URL to the design image (optional)',
        },
      },
      required: ['source', 'url', 'title'],
    },
    handler: async (args) => {
      const source = coerceSource(z.string().parse(args.source)) ?? 'manual';
      const url = z.string().url().parse(args.url);
      const title = z.string().min(1).parse(args.title);
      const description = z.string().optional().parse(args.description) ?? '';
      const tagsStr = z.string().optional().parse(args.tags) ?? '';
      const imageUrl = z.string().optional().parse(args.image_url) ?? '';

      const submission: PatternSubmission = {
        source,
        url,
        title,
        description,
        imageUrl,
        tags: tagsStr.split(',').map(t => t.trim()).filter(Boolean),
      };

      try {
        // Run vision interpretation
        const vision = await interpretSubmission(submission);

        // Build pattern
        const pattern: DesignPattern = {
          id: `pat_${nanoid(12)}`,
          source: submission.source,
          url: submission.url,
          title: submission.title ?? 'Untitled',
          description: submission.description ?? '',
          imageUrl: submission.imageUrl,
          layout: vision.layout,
          colors: vision.colors,
          typography: vision.typography,
          components: vision.components,
          frameworkHints: ['react'],
          tags: submission.tags ?? [],
          qualityScore: 5,
          embedding: [],
          feedback: [],
          metadata: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        // Assign taxonomy
        const taxonomy = assignTaxonomy(pattern);
        pattern.tags = [...new Set([...pattern.tags, ...taxonomy.tags])];

        // Run quality gate
        const quality = await assessQuality(pattern);
        pattern.qualityScore = quality.score;

        if (quality.issues.length > 0) {
          pattern.metadata.qualityIssues = quality.issues;
        }
        pattern.metadata.suggestions = quality.suggestions;

        // Store pattern
        await putPattern(pattern);

        // Index in vector memory
        await indexPattern(pattern);

        // Record reasoning trace
        const { recordTrace } = await import('../src/memory/reasoning-bank.js');
        recordTrace(
          pattern.id,
          { source: pattern.source, url: pattern.url },
          { layoutType: pattern.layout.type, detectedComponents: pattern.components, confidence: vision.confidence },
          { qualityScore: quality.score, userRatings: [], wasAccepted: quality.score >= 5 }
        );

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              pattern: {
                id: pattern.id,
                title: pattern.title,
                source: pattern.source,
                url: pattern.url,
                qualityScore: pattern.qualityScore,
                layout: pattern.layout,
                colors: pattern.colors,
                components: pattern.components,
                tags: pattern.tags,
                taxonomy: taxonomy.primaryCategory,
              },
              quality: {
                score: quality.score,
                breakdown: quality.breakdown,
                suggestions: quality.suggestions.slice(0, 3),
              },
            }, null, 2),
          }],
        };
      } catch (e: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Submit error: ${e.message}` }],
        };
      }
    },
  },

  // ----------------------------------------------------------
  // get_pattern — Get a pattern by ID
  // ----------------------------------------------------------
  {
    name: 'get_pattern',
    description: `Get detailed information about a specific pattern by its ID.
Returns full pattern data including layout, colors, typography, components, and feedback history.`,
    inputSchema: {
      type: 'object',
      properties: {
        pattern_id: {
          type: 'string',
          description: 'The pattern ID (e.g. pat_abc123)',
        },
      },
      required: ['pattern_id'],
    },
    handler: async (args) => {
      const id = z.string().min(1).parse(args.pattern_id);
      try {
        const pattern = await getPattern(id);
        if (!pattern) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Pattern not found: ${id}` }],
          };
        }
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(pattern, null, 2),
          }],
        };
      } catch (e: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error: ${e.message}` }],
        };
      }
    },
  },

  // ----------------------------------------------------------
  // rate_pattern — Rate a pattern (triggers learning)
  // ----------------------------------------------------------
  {
    name: 'rate_pattern',
    description: `Rate a pattern and add feedback. This triggers the SONA self-learning engine
to improve future pattern matching and quality prediction.

A higher rating teaches the system that similar patterns should be ranked higher.`,
    inputSchema: {
      type: 'object',
      properties: {
        pattern_id: {
          type: 'string',
          description: 'The pattern ID to rate',
        },
        rating: {
          type: 'number',
          description: 'Rating 1-5 stars',
          minimum: 1,
          maximum: 5,
        },
        tags: {
          type: 'string',
          description: 'Optional comma-separated tags describing why (e.g. "modern, clean, useful")',
        },
        comment: {
          type: 'string',
          description: 'Optional comment about the pattern',
        },
      },
      required: ['pattern_id', 'rating'],
    },
    handler: async (args) => {
      const id = z.string().min(1).parse(args.pattern_id);
      const rating = z.number().min(1).max(5).parse(args.rating);
      const tagsStr = z.string().optional().parse(args.tags) ?? '';
      const comment = z.string().optional().parse(args.comment) ?? '';

      try {
        const tags = tagsStr.split(',').map(t => t.trim()).filter(Boolean);
        const success = await addFeedback(id, { rating, tags, comment });

        if (!success) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Pattern not found: ${id}` }],
          };
        }

        // Trigger SONA learning
        const pattern = await getPattern(id);
        await learnFromFeedback(id, rating, pattern?.tags ?? []);

        // Record outcome for Q-learning router
        const { recordOutcome } = await import('../src/swarm/router.js');
        recordOutcome('rate', [pattern?.source ?? 'manual'], 'medium', ['quality-gate'], 'star', rating / 5);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Rated pattern "${pattern?.title}" with ${rating} stars`,
              pattern_id: id,
              new_quality_score: pattern?.qualityScore,
              sona_stats: getSONAStats(),
            }, null, 2),
          }],
        };
      } catch (e: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error: ${e.message}` }],
        };
      }
    },
  },

  // ----------------------------------------------------------
  // generate_code — Generate component code from a pattern
  // ----------------------------------------------------------
  {
    name: 'generate_code',
    description: `Generate frontend component code from a design pattern.
Produces production-ready React + Tailwind (default) or Vue components
that implement the detected UI patterns.`,
    inputSchema: {
      type: 'object',
      properties: {
        pattern_id: {
          type: 'string',
          description: 'The pattern ID to generate code for',
        },
        framework: {
          type: 'string',
          description: 'Target framework (default: react)',
          enum: ['react', 'vue'],
          default: 'react',
        },
        style: {
          type: 'string',
          description: 'CSS approach (default: tailwind)',
          enum: ['tailwind', 'css-modules', 'styled-components', 'vanilla-css'],
          default: 'tailwind',
        },
        typescript: {
          type: 'boolean',
          description: 'Use TypeScript (default: true)',
          default: true,
        },
        include_tests: {
          type: 'boolean',
          description: 'Include test files (default: false)',
          default: false,
        },
      },
      required: ['pattern_id'],
    },
    handler: async (args) => {
      const patternId = z.string().min(1).parse(args.pattern_id);
      const framework = z.enum(['react', 'vue']).optional().parse(args.framework) ?? 'react';
      const style = z.enum(['tailwind', 'css-modules', 'styled-components', 'vanilla-css'])
        .optional().parse(args.style) ?? 'tailwind';
      const typescript = z.boolean().optional().parse(args.typescript) ?? true;
      const includeTests = z.boolean().optional().parse(args.include_tests) ?? false;

      try {
        const pattern = await getPattern(patternId);
        if (!pattern) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Pattern not found: ${patternId}` }],
          };
        }

        const request: CodeGenRequest = {
          patternId,
          framework,
          style,
          options: { typescript, includeTests },
        };

        const result = await generateCode(request);

        const fileList = result.files.map(f => ({
          path: f.path,
          language: f.language,
          preview: f.content.slice(0, 200) + '...',
        }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                pattern_id: patternId,
                pattern_title: pattern.title,
                framework,
                style,
                files_generated: result.files.length,
                file_list: fileList,
                files: result.files.map(f => ({
                  path: f.path,
                  content: f.content,
                })),
                preview_html: result.preview,
              }, null, 2),
            },
          ],
        };
      } catch (e: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Code generation error: ${e.message}` }],
        };
      }
    },
  },

  // ----------------------------------------------------------
  // catalog_stats — Library statistics
  // ----------------------------------------------------------
  {
    name: 'catalog_stats',
    description: `Get statistics about the design pattern library.
Returns total patterns, sources breakdown, top layouts, top components,
average quality score, and SONA learning stats.`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
    handler: async () => {
      try {
        const stats = await getStats();
        const sonaStats = getSONAStats();

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              library: stats,
              learning: sonaStats,
              vector_index_size: (await import('../src/memory/agentdb.js')).indexSize(),
            }, null, 2),
          }],
        };
      } catch (e: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error: ${e.message}` }],
        };
      }
    },
  },

  // ----------------------------------------------------------
  // suggest_patterns — AI-powered suggestions
  // ----------------------------------------------------------
  {
    name: 'suggest_patterns',
    description: `Get AI-powered design pattern suggestions based on your project context.
Describes what kind of pattern would work well and suggests related patterns from the library.`,
    inputSchema: {
      type: 'object',
      properties: {
        context: {
          type: 'string',
          description: 'Describe your project or what you\'re building (e.g. "building a fintech dashboard", "creating a SaaS landing page")',
        },
        limit: {
          type: 'number',
          description: 'Number of suggestions (default: 5)',
          default: 5,
        },
      },
      required: ['context'],
    },
    handler: async (args) => {
      const context = z.string().min(1).parse(args.context);
      const limit = z.number().optional().parse(args.limit) ?? 5;

      try {
        // Search library with context as query
        const results = await searchPatterns({ text: context, limit });
        const vectorResults = await searchVectors(context, limit);

        // Merge results
        const allIds = new Set<string>();
        const suggestions: Array<{ pattern: DesignPattern; reason: string }> = [];

        for (const r of results) {
          if (!allIds.has(r.pattern.id)) {
            allIds.add(r.pattern.id);
            suggestions.push({
              pattern: r.pattern,
              reason: `Similarity score: ${(r.similarity * 100).toFixed(0)}% — layout "${r.pattern.layout.type}" matches your context`,
            });
          }
        }

        for (const vr of vectorResults) {
          if (!allIds.has(vr.id)) {
            const pattern = await getPattern(vr.id);
            if (pattern) {
              allIds.add(vr.id);
              suggestions.push({
                pattern,
                reason: `Vector similarity: ${(vr.score * 100).toFixed(0)}% — semantic match with your context`,
              });
            }
          }
        }

        // Generate AI-style recommendation text
        const layoutTypes = [...new Set(suggestions.map(s => s.pattern.layout.type))];
        const sources = [...new Set(suggestions.map(s => s.pattern.source))];
        const avgQuality = suggestions.reduce((s, sug) => s + sug.pattern.qualityScore, 0) / suggestions.length;

        const recommendation = `Based on your context "${context}", here are ${suggestions.length} design pattern suggestions:
  - Layout types found: ${layoutTypes.join(', ')}
  - Sources: ${sources.join(', ')}
  - Average quality: ${avgQuality.toFixed(1)}/10`;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              context,
              recommendation,
              suggestions: suggestions.slice(0, limit).map(s => ({
                id: s.pattern.id,
                title: s.pattern.title,
                reason: s.reason,
                layout: s.pattern.layout.type,
                components: s.pattern.components,
                colors: s.pattern.colors,
                qualityScore: s.pattern.qualityScore,
                source: s.pattern.source,
                tags: s.pattern.tags,
              })),
            }, null, 2),
          }],
        };
      } catch (e: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Suggestion error: ${e.message}` }],
        };
      }
    },
  },
];

// ============================================================
// Register handlers
// ============================================================

// Resource handlers
try {
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      { uri: 'dpm://catalog', name: 'Pattern Catalog', description: 'Complete catalog of all design patterns', mimeType: 'application/json' },
      { uri: 'dpm://stats', name: 'Library Statistics', description: 'Statistics about the design pattern library', mimeType: 'application/json' },
    ],
  }));
} catch (e: any) {
  console.error('[dpm] Failed to register list resources handler:', e.message);
}

try {
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: [
      { uriTemplate: 'dpm://patterns/{id}', name: 'Get Pattern by ID', description: 'Retrieve a specific design pattern', mimeType: 'application/json' },
    ],
  }));
} catch (e: any) {
  console.error('[dpm] Failed to register resource templates handler:', e.message);
}

try {
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    const { loadAllPatterns } = await import('../src/storage/local.js');

    if (uri === 'dpm://catalog') {
      const patterns = await loadAllPatterns();
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify({ count: patterns.length, patterns: patterns.slice(0, 50) }, null, 2) }] };
    }
    if (uri === 'dpm://stats') {
      const stats = await getStats();
      const sonaStats = getSONAStats();
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify({ library: stats, learning: sonaStats }, null, 2) }] };
    }
    const patternMatch = uri.match(/^dpm:\/\/patterns\/(.+)$/);
    if (patternMatch) {
      const pattern = await getPattern(patternMatch[1]);
      if (!pattern) throw new Error(`Pattern not found: ${patternMatch[1]}`);
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(pattern, null, 2) }] };
    }
    throw new Error(`Unknown resource: ${uri}`);
  });
} catch (e: any) {
  console.error('[dpm] Failed to register read resource handler:', e.message);
}

// Prompt handlers
try {
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [
      { name: 'analyze-design', description: 'Analyze a design submission and extract structured pattern information', arguments: [{ name: 'url', description: 'URL of the design', required: true }, { name: 'title', description: 'Title for the design', required: false }] },
      { name: 'generate-component', description: 'Generate production-ready frontend code from a design pattern', arguments: [{ name: 'pattern_id', description: 'Pattern ID', required: true }, { name: 'framework', description: 'react or vue', required: false }] },
      { name: 'search-and-compare', description: 'Search for design patterns and compare options', arguments: [{ name: 'query', description: 'Search query', required: true }] },
      { name: 'discover-and-save', description: 'Discover new patterns from the internet and save them', arguments: [{ name: 'query', description: 'What to discover', required: true }] },
      { name: 'audit-pattern-library', description: 'Audit the library for quality and duplicates', arguments: [] },
    ],
  }));
} catch (e: any) {
  console.error('[dpm] Failed to register list prompts handler:', e.message);
}

try {
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const name = request.params.name;
    const args = request.params.arguments ?? {};

    const promptTemplates: Record<string, (a: Record<string, string | undefined>) => string> = {
      'analyze-design': (a) => `Analyze the design at ${a.url}${a.title ? ` titled "${a.title}"` : ''}. Identify layout type, UI components, color palette, typography, and rate quality 1-10.`,
      'generate-component': (a) => `Generate production-ready ${a.framework || 'React'} components from design pattern ${a.pattern_id}. Use Tailwind CSS and TypeScript.`,
      'search-and-compare': (a) => `Search for design patterns matching "${a.query}" and compare the top results side by side.`,
      'discover-and-save': (a) => `Discover design patterns for "${a.query}" from all sources. Save the top 3-5 to the library.`,
      'audit-pattern-library': () => `Audit the design pattern library for quality, consistency, and duplicates. Report findings.`,
    };

    const template = promptTemplates[name];
    if (!template) throw new Error(`Unknown prompt: ${name}`);

    return {
      messages: [{ role: 'user', content: { type: 'text', text: template(args as Record<string, string | undefined>) } }],
    };
  });
} catch (e: any) {
  console.error('[dpm] Failed to register get prompt handler:', e.message);
}

try {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));
} catch (e: any) {
  console.error('[dpm] Failed to register list tools handler:', e.message);
}

try {
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    // Auth check
    if (!validateAuth()) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Authentication failed. Set DPM_MCP_KEY to match the server key.' }],
      };
    }

    // Rate limit check
    if (!checkRateLimit()) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Rate limit exceeded. Max ${config.rateLimitPerMinute} requests per minute.` }],
      };
    }

    const tool = tools.find(t => t.name === request.params.name);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }],
      };
    }
    return tool.handler(request.params.arguments ?? {});
  });
} catch (e: any) {
  console.error('[dpm] Failed to register call tool handler:', e.message);
}

// ============================================================
// Start (only when run directly, not during tests)
// ============================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[dpm] Design Pattern Multiverse MCP server running on stdio');
  console.error('[dpm] Tools available:', tools.map(t => t.name).join(', '));
  console.error('[dpm] SONA learning:', getSONAStats().learnedPatterns > 0 ? 'active' : 'initialized');
}

function start() {
  return main().catch((e: any) => {
    console.error('[dpm] Fatal error:', e);
    process.exit(1);
  });
}

// Export server for programmatic use and testing
export { server };

// Auto-start only when not in test environment
if ((process.env.NODE_ENV || 'development') !== 'test') {
  start();
}
