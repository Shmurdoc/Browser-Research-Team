// ============================================================
// Design Pattern Multiverse — Runtime Configuration
// ============================================================
//
// Centralized, validated config. Fails fast on bad values.
// Graceful degradation: missing API key = fallback mode.
// All values read from environment variables with sensible defaults.
// ============================================================

import { z } from 'zod';

// Load .env if present (dotenv is a dependency)
try {
  await import('dotenv').then(m => m.config({ override: false }));
} catch {
  // dotenv not available or .env missing — process.env only
}

const configSchema = z.object({
  openaiApiKey: z.string().min(1).optional(),
  supabaseUrl: z.string().url().optional(),
  supabaseKey: z.string().min(1).optional(),
  mcpServerKey: z.string().min(1).optional(),
  visionModel: z.enum(['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo']).default('gpt-4o-mini'),
  codeGenModel: z.enum(['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo']).default('gpt-4o-mini'),
  embeddingProvider: z.enum(['local', 'openai']).default('local'),
  visionMaxTokens: z.coerce.number().int().min(256).max(8192).default(2048),
  codeGenMaxTokens: z.coerce.number().int().min(256).max(16384).default(4096),
  codeGenTemperature: z.coerce.number().min(0).max(2).default(0.2),
  apiTimeoutMs: z.coerce.number().int().min(5000).max(120000).default(30000),
  playwrightHeadless: z.string().transform(v => v !== 'false').default('true'),
  playwrightTimeoutMs: z.coerce.number().int().min(5000).max(60000).default(15000),
  rateLimitPerMinute: z.coerce.number().int().min(10).max(1000).default(100),
});

const raw = {
  openaiApiKey: process.env.OPENAI_API_KEY,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_KEY,
  mcpServerKey: process.env.DPM_MCP_KEY,
  visionModel: process.env.VISION_MODEL,
  codeGenModel: process.env.CODE_GEN_MODEL,
  embeddingProvider: process.env.EMBEDDING_PROVIDER,
  visionMaxTokens: process.env.VISION_MAX_TOKENS,
  codeGenMaxTokens: process.env.CODE_GEN_MAX_TOKENS,
  codeGenTemperature: process.env.CODE_GEN_TEMPERATURE,
  apiTimeoutMs: process.env.API_TIMEOUT_MS,
  playwrightHeadless: process.env.PLAYWRIGHT_HEADLESS,
  playwrightTimeoutMs: process.env.PLAYWRIGHT_TIMEOUT_MS,
  rateLimitPerMinute: process.env.DPM_RATE_LIMIT_PER_MINUTE,
};

const parsed = configSchema.safeParse(raw);

if (!parsed.success) {
  const issues = parsed.error.issues.map(i => `  ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid configuration:\n${issues}`);
}

export const config = parsed.data;

/** True if OpenAI API key is configured and LLM features are available */
export const hasOpenAIKey = !!config.openaiApiKey;

/** True if Supabase is configured as storage backend */
export const hasSupabase = !!(config.supabaseUrl && config.supabaseKey);

/** True if MCP server auth is enabled */
export const hasMcpAuth = !!config.mcpServerKey;

/** Validate that LLM features can be used, throw if not */
export function requireOpenAI(): string {
  if (!config.openaiApiKey) {
    throw new Error(
      'OPENAI_API_KEY is not set. Set it to enable vision analysis and code generation. ' +
      'Without it, the system falls back to heuristic templates.'
    );
  }
  return config.openaiApiKey;
}
