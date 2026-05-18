#!/usr/bin/env node
// ============================================================
// Design Pattern Multiverse — MCP HTTP Server (Streamable HTTP)
// ============================================================
//
// Remote MCP server using Streamable HTTP transport (MCP spec 2025-11-25).
// Enables multi-client access, team deployments, and cloud hosting.
//
// Usage:
//   DPM_HTTP_PORT=3100 node dist/mcp-server/http.js
//
// Clients connect via:
//   { "type": "remote", "url": "http://localhost:3100/mcp" }
// ============================================================

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import { createServer } from 'node:http';
import { nanoid } from 'nanoid';

import {
  searchPatterns,
  getPattern,
  getStats,
  loadAllPatterns,
  initSONA,
  getSONAStats,
} from '../src/index.js';
import { config, hasMcpAuth } from '../src/config.js';
import { buildTools } from './tools.js';
import { buildResources } from './resources.js';
import { buildPrompts } from './prompts.js';

// Initialize learning
initSONA({ adaptationRate: 0.15 });

const app = express();
app.use(express.json());

// Auth middleware
function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!hasMcpAuth) return next();
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.slice(7);
  if (token !== config.mcpServerKey) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

// Session management
const sessions = new Map<string, StreamableHTTPServerTransport>();

// Build MCP components
const tools = buildTools();
const resources = buildResources();
const prompts = buildPrompts();

// Create MCP server
const server = new Server(
  { name: 'design-pattern-multiverse', version: '1.0.0' },
  { capabilities: { tools: {}, resources: {}, prompts: {} } }
);

// Register tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = tools.find(t => t.name === request.params.name);
  if (!tool) {
    return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }] };
  }
  return tool.handler(request.params.arguments ?? {});
});

// Register resource handlers
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: resources.map(r => ({ uri: r.uri, name: r.name, description: r.description, mimeType: r.mimeType })),
}));

server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
  resourceTemplates: [
    {
      uriTemplate: 'dpm://patterns/{id}',
      name: 'Get Pattern by ID',
      description: 'Retrieve a specific design pattern by its ID',
      mimeType: 'application/json',
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;

  // dpm://catalog - all patterns
  if (uri === 'dpm://catalog') {
    const patterns = await loadAllPatterns();
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({ count: patterns.length, patterns: patterns.slice(0, 50) }, null, 2),
      }],
    };
  }

  // dpm://stats - library statistics
  if (uri === 'dpm://stats') {
    const stats = await getStats();
    const sonaStats = getSONAStats();
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({ library: stats, learning: sonaStats }, null, 2),
      }],
    };
  }

  // dpm://patterns/{id} - specific pattern
  const patternMatch = uri.match(/^dpm:\/\/patterns\/(.+)$/);
  if (patternMatch) {
    const pattern = await getPattern(patternMatch[1]);
    if (!pattern) {
      throw new Error(`Pattern not found: ${patternMatch[1]}`);
    }
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(pattern, null, 2),
      }],
    };
  }

  throw new Error(`Unknown resource: ${uri}`);
});

// Register prompt handlers
server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: prompts.map(p => ({ name: p.name, description: p.description, arguments: p.arguments })),
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const prompt = prompts.find(p => p.name === request.params.name);
  if (!prompt) {
    throw new Error(`Unknown prompt: ${request.params.name}`);
  }
  const args = request.params.arguments ?? {};
  const messages = prompt.handler(args);
  return { messages };
});

// MCP endpoint
app.post('/mcp', authMiddleware, async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && sessions.has(sessionId)) {
    transport = sessions.get(sessionId)!;
  } else if (!sessionId && req.body?.method === 'initialize') {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => nanoid(),
      onsessioninitialized: (sid) => {
        sessions.set(sid, transport);
      },
    });
    sessions.set(transport.sessionId!, transport);
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };
  } else {
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Bad Request: No valid session' },
      id: null,
    });
    return;
  }

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// GET endpoint for SSE streams
app.get('/mcp', authMiddleware, async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !sessions.has(sessionId)) {
    res.status(400).json({ error: 'No valid session' });
    return;
  }
  const transport = sessions.get(sessionId)!;
  await transport.handleRequest(req, res);
});

// DELETE endpoint for session cleanup
app.delete('/mcp', authMiddleware, async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (sessionId && sessions.has(sessionId)) {
    const transport = sessions.get(sessionId)!;
    await transport.close();
    sessions.delete(sessionId);
  }
  res.status(200).json({});
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', tools: tools.length, resources: resources.length, prompts: prompts.length });
});

// Start server
const PORT = parseInt(process.env.DPM_HTTP_PORT || '3100', 10);
const httpServer = createServer(app);

httpServer.listen(PORT, () => {
  console.error(`[dpm-http] MCP server running on http://localhost:${PORT}/mcp`);
  console.error(`[dpm-http] Health check: http://localhost:${PORT}/health`);
  console.error(`[dpm-http] Tools: ${tools.map(t => t.name).join(', ')}`);
  console.error(`[dpm-http] Resources: ${resources.map(r => r.uri).join(', ')}`);
  console.error(`[dpm-http] Prompts: ${prompts.map(p => p.name).join(', ')}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.error('[dpm-http] Shutting down...');
  httpServer.close();
  process.exit(0);
});

export { server };
