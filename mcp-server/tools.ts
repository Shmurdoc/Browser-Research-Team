// ============================================================
// MCP Tools — Tool Definitions and Handlers
// ============================================================
//
// Shared tool definitions used by both stdio and HTTP MCP servers.
// ============================================================

import { z } from 'zod';
import { nanoid } from 'nanoid';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

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
  learnFromFeedback,
  getSONAStats,
  indexPattern,
  searchVectors,
  assignTaxonomy,
  type PatternQuery,
  type DesignPattern,
  type CodeGenRequest,
  type PatternSubmission,
} from '../src/index.js';
import { coerceSource, coerceLayout, coerceFramework, coerceSourceList } from './type-guards.js';

export interface ToolHandler {
  name: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
  handler: (args: Record<string, unknown>) => Promise<CallToolResult>;
}

export function buildTools(): ToolHandler[] {
  return [
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
          query: { type: 'string', description: 'Natural language search query (e.g. "dark mode dashboard", "pricing page with cards")' },
          source: { type: 'string', description: 'Filter by source: pinterest, dribbble, behance, figma-community', enum: ['pinterest', 'dribbble', 'behance', 'figma-community', 'all'] },
          layout_type: { type: 'string', description: 'Filter by layout type: dashboard, landing-page, hero-section, navbar, form, pricing, etc' },
          framework: { type: 'string', description: 'Filter by framework: react, vue, svelte, angular' },
          limit: { type: 'number', description: 'Maximum results to return (default: 10, max: 50)', default: 10 },
          min_quality: { type: 'number', description: 'Minimum quality score 0-10 (default: 0)', default: 0 },
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

        const pq: PatternQuery = { text: query, limit, minQuality, source: coerceSource(source), layoutType: coerceLayout(layoutType), framework: coerceFramework(framework) };

        try {
          const results = await searchPatterns(pq);
          const vectorResults = await searchVectors(query, limit);
          const vectorIds = new Set(vectorResults.map((v: { id: string }) => v.id));

          const merged = new Map<string, typeof results[0]>();
          for (const r of results) merged.set(r.pattern.id, r);
          for (const vr of vectorResults) {
            if (!merged.has(vr.id)) {
              const pattern = await getPattern(vr.id);
              if (pattern) merged.set(vr.id, { pattern, similarity: vr.score });
            }
          }

          const finalResults = Array.from(merged.values()).sort((a, b) => b.similarity - a.similarity).slice(0, limit);

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                count: finalResults.length,
                query,
                results: finalResults.map(r => ({
                  id: r.pattern.id, title: r.pattern.title, description: r.pattern.description,
                  source: r.pattern.source, url: r.pattern.url, layout: r.pattern.layout,
                  colors: r.pattern.colors, components: r.pattern.components, tags: r.pattern.tags,
                  qualityScore: r.pattern.qualityScore, similarity: Number(r.similarity.toFixed(3)),
                  frameworkHints: r.pattern.frameworkHints,
                })),
              }, null, 2),
            }],
          };
        } catch (e: any) {
          return { isError: true, content: [{ type: 'text', text: `Search error: ${e.message}` }] };
        }
      },
    },

    {
      name: 'discover_patterns',
      description: `Research the internet for design patterns matching your query.
Searches Pinterest, Dribbble, Behance, and Figma Community simultaneously.
Returns raw submissions that can be saved to the library via submit_pattern.`,
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What design pattern to search for' },
          sources: { type: 'string', description: 'Comma-separated sources (default: all)', default: 'all' },
          limit_per_source: { type: 'number', description: 'Max results per source (default: 5)', default: 5 },
        },
        required: ['query'],
      },
      handler: async (args) => {
        const query = z.string().min(1).parse(args.query);
        const sourcesArg = z.string().optional().parse(args.sources) ?? 'all';

        try {
          const sourceList = coerceSourceList(sourcesArg);
          const results = await Promise.all(sourceList.map(source => scoutSource(source, query)));
          const allSubmissions = results.flatMap(r => r.submissions);
          const allErrors = results.flatMap(r => r.errors);

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                query, sources_searched: sourceList, total_found: allSubmissions.length,
                warnings: allErrors.filter((e, i, a) => a.indexOf(e) === i),
                submissions: allSubmissions.map(s => ({ source: s.source, title: s.title, url: s.url, description: s.description, tags: s.tags })),
              }, null, 2),
            }],
          };
        } catch (e: any) {
          return { isError: true, content: [{ type: 'text', text: `Discovery error: ${e.message}` }] };
        }
      },
    },

    {
      name: 'submit_pattern',
      description: `Save a discovered design pattern into the local library.
Runs the vision pipeline and quality assessment before storing.`,
      inputSchema: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'Source of the pattern', enum: ['pinterest', 'dribbble', 'behance', 'figma-community', 'web', 'manual'] },
          url: { type: 'string', description: 'Original URL of the design' },
          title: { type: 'string', description: 'Pattern title' },
          description: { type: 'string', description: 'Description of the design pattern' },
          tags: { type: 'string', description: 'Comma-separated tags' },
          image_url: { type: 'string', description: 'URL to the design image' },
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

        const submission: PatternSubmission = { source, url, title, description, imageUrl, tags: tagsStr.split(',').map(t => t.trim()).filter(Boolean) };

        try {
          const vision = await interpretSubmission(submission);
          const pattern: DesignPattern = {
            id: `pat_${nanoid(12)}`, source, url, title, description, imageUrl,
            layout: vision.layout, colors: vision.colors, typography: vision.typography,
            components: vision.components, frameworkHints: ['react'],
            tags: submission.tags ?? [], qualityScore: 5, embedding: [],
            feedback: [], metadata: {}, createdAt: Date.now(), updatedAt: Date.now(),
          };

          const taxonomy = assignTaxonomy(pattern);
          pattern.tags = [...new Set([...pattern.tags, ...taxonomy.tags])];

          const quality = await assessQuality(pattern);
          pattern.qualityScore = quality.score;
          if (quality.issues.length > 0) pattern.metadata.qualityIssues = quality.issues;
          pattern.metadata.suggestions = quality.suggestions;

          await putPattern(pattern);
          await indexPattern(pattern);

          const { recordTrace } = await import('../src/memory/reasoning-bank.js');
          recordTrace(pattern.id, { source: pattern.source, url: pattern.url },
            { layoutType: pattern.layout.type, detectedComponents: pattern.components, confidence: vision.confidence },
            { qualityScore: quality.score, userRatings: [], wasAccepted: quality.score >= 5 });

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true, pattern: { id: pattern.id, title: pattern.title, source: pattern.source, url: pattern.url, qualityScore: pattern.qualityScore, layout: pattern.layout, colors: pattern.colors, components: pattern.components, tags: pattern.tags, taxonomy: taxonomy.primaryCategory },
                quality: { score: quality.score, breakdown: quality.breakdown, suggestions: quality.suggestions.slice(0, 3) },
              }, null, 2),
            }],
          };
        } catch (e: any) {
          return { isError: true, content: [{ type: 'text', text: `Submit error: ${e.message}` }] };
        }
      },
    },

    {
      name: 'get_pattern',
      description: `Get detailed information about a specific pattern by its ID.`,
      inputSchema: {
        type: 'object',
        properties: { pattern_id: { type: 'string', description: 'The pattern ID' } },
        required: ['pattern_id'],
      },
      handler: async (args) => {
        const id = z.string().min(1).parse(args.pattern_id);
        try {
          const pattern = await getPattern(id);
          if (!pattern) return { isError: true, content: [{ type: 'text', text: `Pattern not found: ${id}` }] };
          return { content: [{ type: 'text', text: JSON.stringify(pattern, null, 2) }] };
        } catch (e: any) {
          return { isError: true, content: [{ type: 'text', text: `Error: ${e.message}` }] };
        }
      },
    },

    {
      name: 'rate_pattern',
      description: `Rate a pattern and add feedback. Triggers the SONA self-learning engine.`,
      inputSchema: {
        type: 'object',
        properties: {
          pattern_id: { type: 'string', description: 'The pattern ID to rate' },
          rating: { type: 'number', description: 'Rating 1-5 stars', minimum: 1, maximum: 5 },
          tags: { type: 'string', description: 'Optional comma-separated tags' },
          comment: { type: 'string', description: 'Optional comment' },
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
          if (!success) return { isError: true, content: [{ type: 'text', text: `Pattern not found: ${id}` }] };

          const pattern = await getPattern(id);
          await learnFromFeedback(id, rating, pattern?.tags ?? []);

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ success: true, message: `Rated "${pattern?.title}" with ${rating} stars`, pattern_id: id, new_quality_score: pattern?.qualityScore, sona_stats: getSONAStats() }, null, 2),
            }],
          };
        } catch (e: any) {
          return { isError: true, content: [{ type: 'text', text: `Error: ${e.message}` }] };
        }
      },
    },

    {
      name: 'generate_code',
      description: `Generate frontend component code from a design pattern.
Produces production-ready React + Tailwind (default) or Vue components.`,
      inputSchema: {
        type: 'object',
        properties: {
          pattern_id: { type: 'string', description: 'The pattern ID' },
          framework: { type: 'string', description: 'Target framework', enum: ['react', 'vue'], default: 'react' },
          style: { type: 'string', description: 'CSS approach', enum: ['tailwind', 'css-modules', 'styled-components', 'vanilla-css'], default: 'tailwind' },
          typescript: { type: 'boolean', description: 'Use TypeScript', default: true },
          include_tests: { type: 'boolean', description: 'Include test files', default: false },
        },
        required: ['pattern_id'],
      },
      handler: async (args) => {
        const patternId = z.string().min(1).parse(args.pattern_id);
        const framework = z.enum(['react', 'vue']).optional().parse(args.framework) ?? 'react';
        const style = z.enum(['tailwind', 'css-modules', 'styled-components', 'vanilla-css']).optional().parse(args.style) ?? 'tailwind';
        const typescript = z.boolean().optional().parse(args.typescript) ?? true;
        const includeTests = z.boolean().optional().parse(args.include_tests) ?? false;

        try {
          const pattern = await getPattern(patternId);
          if (!pattern) return { isError: true, content: [{ type: 'text', text: `Pattern not found: ${patternId}` }] };

          const request: CodeGenRequest = { patternId, framework, style, options: { typescript, includeTests } };
          const result = await generateCode(request);

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                pattern_id: patternId, pattern_title: pattern.title, framework, style,
                files_generated: result.files.length,
                files: result.files.map(f => ({ path: f.path, content: f.content, language: f.language })),
                preview_html: result.preview,
              }, null, 2),
            }],
          };
        } catch (e: any) {
          return { isError: true, content: [{ type: 'text', text: `Code generation error: ${e.message}` }] };
        }
      },
    },

    {
      name: 'catalog_stats',
      description: `Get statistics about the design pattern library.`,
      inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        try {
          const stats = await getStats();
          const sonaStats = getSONAStats();
          const { indexSize } = await import('../src/memory/agentdb.js');
          const { getRouterStats } = await import('../src/swarm/router.js');
          const { getReasoningStats } = await import('../src/memory/reasoning-bank.js');

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                library: stats, learning: sonaStats,
                vector_index_size: indexSize(),
                router: getRouterStats(),
                reasoning_bank: getReasoningStats(),
              }, null, 2),
            }],
          };
        } catch (e: any) {
          return { isError: true, content: [{ type: 'text', text: `Error: ${e.message}` }] };
        }
      },
    },

    {
      name: 'suggest_patterns',
      description: `Get AI-powered design pattern suggestions based on your project context.`,
      inputSchema: {
        type: 'object',
        properties: {
          context: { type: 'string', description: 'Describe your project' },
          limit: { type: 'number', description: 'Number of suggestions (default: 5)', default: 5 },
        },
        required: ['context'],
      },
      handler: async (args) => {
        const context = z.string().min(1).parse(args.context);
        const limit = z.number().optional().parse(args.limit) ?? 5;

        try {
          const results = await searchPatterns({ text: context, limit });
          const vectorResults = await searchVectors(context, limit);
          const allIds = new Set<string>();
          const suggestions: Array<{ pattern: DesignPattern; reason: string }> = [];

          for (const r of results) {
            if (!allIds.has(r.pattern.id)) {
              allIds.add(r.pattern.id);
              suggestions.push({ pattern: r.pattern, reason: `Similarity: ${(r.similarity * 100).toFixed(0)}%` });
            }
          }
          for (const vr of vectorResults) {
            if (!allIds.has(vr.id)) {
              const pattern = await getPattern(vr.id);
              if (pattern) { allIds.add(vr.id); suggestions.push({ pattern, reason: `Vector similarity: ${(vr.score * 100).toFixed(0)}%` }); }
            }
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                context, suggestions: suggestions.slice(0, limit).map(s => ({
                  id: s.pattern.id, title: s.pattern.title, reason: s.reason,
                  layout: s.pattern.layout.type, components: s.pattern.components,
                  qualityScore: s.pattern.qualityScore, source: s.pattern.source,
                })),
              }, null, 2),
            }],
          };
        } catch (e: any) {
          return { isError: true, content: [{ type: 'text', text: `Suggestion error: ${e.message}` }] };
        }
      },
    },
  ];
}
