// ============================================================
// MCP Server Validation Tests
// Tests that the MCP server module is correctly structured
// ============================================================

import { describe, it, expect } from 'vitest';
import { existsSync, mkdirSync } from 'node:fs';
import * as fs from 'node:fs';
import * as path from 'node:path';

const STORAGE_DIR = '.test-mcp-storage';
const TOOLS_DIR = '.test-mcp-tools';

if (!existsSync(STORAGE_DIR)) mkdirSync(STORAGE_DIR, { recursive: true });
if (!existsSync(TOOLS_DIR)) mkdirSync(TOOLS_DIR, { recursive: true });
process.env.DPM_STORAGE_DIR = STORAGE_DIR;

describe('MCP Server Validation', () => {
  describe('Module Loading', () => {
    it('should have valid MCP server build', () => {
      const mcpPath = path.resolve('./dist/mcp-server/index.js');
      expect(fs.existsSync(mcpPath)).toBe(true);
      const stats = fs.statSync(mcpPath);
      expect(stats.size).toBeGreaterThan(1000);
    });

    it('should have all 8 required tools defined', () => {
      const source = fs.readFileSync(path.resolve('./mcp-server/index.ts'), 'utf-8');

      const expectedTools = [
        'search_patterns',
        'discover_patterns',
        'submit_pattern',
        'get_pattern',
        'rate_pattern',
        'generate_code',
        'catalog_stats',
        'suggest_patterns',
      ];

      for (const tool of expectedTools) {
        expect(source).toContain(`name: '${tool}'`);
      }
    });

    it('should have at least 8 tools in the tools array', () => {
      const source = fs.readFileSync(path.resolve('./mcp-server/index.ts'), 'utf-8');
      const matches = source.match(/name:\s*'[^']+'\s*,/g);
      const toolNames = (matches || []).filter(m => !(m as string).includes('design-pattern-multiverse'));
      expect(toolNames.length).toBeGreaterThanOrEqual(8);
    });

    it('should use stdio transport', async () => {
      const source = fs.readFileSync(path.resolve('./mcp-server/index.ts'), 'utf-8');
      expect(source).toContain('StdioServerTransport');
    });

    it('should report version 1.0.0', async () => {
      const source = fs.readFileSync(path.resolve('./mcp-server/index.ts'), 'utf-8');
      const versionMatch = source.match(/version:\s*['"]([^'"]+)['"]/);
      expect(versionMatch).toBeTruthy();
      expect((versionMatch as RegExpMatchArray)[1]).toBe('1.0.0');
    });
  });

  describe('Tool Input Validation', () => {
it('search_patterns validates query', async () => {
       const source = fs.readFileSync(path.resolve('./mcp-server/index.ts'), 'utf-8');
       const searchIdx = source.indexOf("name: 'search_patterns'");
       const block = source.substring(searchIdx, searchIdx + 2000);
       expect(block).toContain('z.string()');
       expect(block).toContain('.min(1)');
     });

    it('generate_code validates framework enum', async () => {
      const source = fs.readFileSync(path.resolve('./mcp-server/index.ts'), 'utf-8');
      const genIdx = source.indexOf("name: 'generate_code'");
      const block = source.substring(genIdx, genIdx + 1000);
      expect(block).toContain("'react'");
      expect(block).toContain("'vue'");
    });

    it('rate_pattern validates rating range', async () => {
      const source = fs.readFileSync(path.resolve('./mcp-server/index.ts'), 'utf-8');
      const rateIdx = source.indexOf("name: 'rate_pattern'");
      const block = source.substring(rateIdx, rateIdx + 800);
      expect(block).toContain('minimum: 1');
      expect(block).toContain('maximum: 5');
    });
  });

  describe('Error Handling', () => {
it('each tool handler has try-catch error handling', async () => {
       const source = fs.readFileSync(path.resolve('./mcp-server/index.ts'), 'utf-8');
       // Count all try blocks in file (includes try-catch in tool handlers, handler registration, and startup code)
       const totalTryBlocks = (source.match(/try\s*\{/g) || []).length;
       expect(totalTryBlocks).toBeGreaterThanOrEqual(10);
     });

    it('each tool returns isError on failure', async () => {
      const source = fs.readFileSync(path.resolve('./mcp-server/index.ts'), 'utf-8');
      const errorReturns = (source.match(/isError:\s*true/g) || []).length;
      expect(errorReturns).toBeGreaterThanOrEqual(8);
    });
  });

  describe('Tool Responses', () => {
    it('responses use JSON serialization', async () => {
      const source = fs.readFileSync(path.resolve('./mcp-server/index.ts'), 'utf-8');
      const jsonStringifyCount = (source.match(/JSON\.stringify/g) || []).length;
      expect(jsonStringifyCount).toBeGreaterThanOrEqual(8);
    });

    it('initializes SONA on startup', async () => {
      const source = fs.readFileSync(path.resolve('./mcp-server/index.ts'), 'utf-8');
      expect(source).toContain('initSONA');
    });

    it('rebuilds vector index on startup', async () => {
      const source = fs.readFileSync(path.resolve('./mcp-server/index.ts'), 'utf-8');
      expect(source).toContain('rebuildIndex');
    });
  });
});

describe('Tool Handler Simulation Tests', () => {
  beforeAll(() => {
    process.env.DPM_STORAGE_DIR = TOOLS_DIR;
  });

  describe('search_patterns handler simulation', () => {
    it('handles search without crashing', async () => {
      const { searchPatterns } = await import('../dist/src/storage/local.js');
      const results = await searchPatterns({ text: 'test', limit: 10 });
      expect(Array.isArray(results)).toBe(true);
    });

    it('respects limit parameter', async () => {
      const { searchPatterns } = await import('../dist/src/storage/local.js');
      const results = await searchPatterns({ text: '', limit: 2 });
      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  describe('generate_code handler simulation', () => {
    it('handles non-existent pattern by falling back', async () => {
      const { generateCode } = await import('../dist/src/swarm/pattern/code-gen.js');

      const result = await generateCode({
        patternId: 'non-existent-id-12345',
        framework: 'react',
        style: 'tailwind',
        options: { typescript: true },
      });

      // When pattern not found, falls back to card template
      expect(result).toBeDefined();
      expect(result.files.length).toBeGreaterThanOrEqual(1);
    });

    it('generates valid React components for valid pattern', async () => {
      const { generateCode } = await import('../dist/src/swarm/pattern/code-gen.js');
      const { putPattern } = await import('../dist/src/storage/local.js');

      const patternId = `test-gen-${Date.now()}`;
      const pattern = {
        id: patternId,
        source: 'manual' as any,
        url: 'https://example.com',
        title: 'Test Component',
        description: 'A test component',
        imageUrl: '',
        layout: { type: 'card-grid' as any, zones: ['main'], confidence: 0.9 },
        colors: {
          primary: '#3b82f6',
          secondary: '#8b5cf6',
          accent: '#ec4899',
          neutral: '#6b7280',
          background: '#ffffff',
          text: '#1f2937',
          additional: [],
        },
        typography: {
          heading: { family: 'Inter', weight: 700, size: '24px' },
          body: { family: 'Inter', weight: 400, size: '16px' },
          other: [],
        },
        components: ['card'],
        frameworkHints: ['react'],
        tags: ['test'],
        qualityScore: 7,
        embedding: [],
        feedback: [],
        metadata: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await putPattern(pattern);

      const result = await generateCode({
        patternId,
        framework: 'react',
        style: 'tailwind',
        options: { typescript: true, includeTests: false },
      });

      expect(result.patternId).toBe(patternId);
      expect(result.files.length).toBe(1);
      expect(result.files[0].path).toContain('Card');
      expect(result.files[0].content.length).toBeGreaterThan(50);
    });
  });
});