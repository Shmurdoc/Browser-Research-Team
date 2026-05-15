// ============================================================
// MCP Server Startup Validation
// Tests that the MCP server module loads without runtime errors
// ============================================================

import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, mkdirSync } from 'node:fs';

const STORAGE_DIR = '.test-mcp-startup';

beforeAll(() => {
   process.env.NODE_ENV = 'test';
   if (!existsSync(STORAGE_DIR)) {
     mkdirSync(STORAGE_DIR, { recursive: true });
   }
   process.env.DPM_STORAGE_DIR = STORAGE_DIR;
 });

describe('MCP Server Startup Validation', () => {
  describe('Module Loading', () => {
    it('should have valid compiled MCP server module', async () => {
      const path = await import('node:path');
      const fs = await import('node:fs');
      const mcpPath = path.resolve('./dist/mcp-server/index.js');
      expect(fs.existsSync(mcpPath)).toBe(true);
      const stats = fs.statSync(mcpPath);
      expect(stats.size).toBeGreaterThan(100);
    });

    it('should have exported server instance', async () => {
      const { server } = await import('../dist/mcp-server/index.js');
      expect(server).toBeDefined();
      expect(server.connect).toBeDefined();
    });
  });

  describe('Code Generation Module', () => {
    it('should generate components for a stored pattern', async () => {
      const { generateCode } = await import('../dist/src/swarm/pattern/code-gen.js');
      const { putPattern } = await import('../dist/src/storage/local.js');

      const patternId = `cg-test-${Date.now()}`;
      const pattern = {
        id: patternId,
        source: 'manual' as any,
        url: 'https://example.com',
        title: 'Component Test',
        description: 'Test component generation',
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