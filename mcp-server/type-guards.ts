// ============================================================
// MCP Server — Type Guards
// ============================================================
//
// Safe type coercion for MCP tool inputs.
// Replaces unsafe `as any` casts with proper validation.
// ============================================================

import { type PatternSource, type LayoutType, type FrameworkHint } from '../src/types.js';

const VALID_SOURCES: PatternSource[] = ['pinterest', 'dribbble', 'behance', 'figma-community', 'web', 'manual', 'api'];
const VALID_LAYOUTS: LayoutType[] = ['dashboard', 'landing-page', 'hero-section', 'navbar', 'sidebar', 'card-grid', 'modal', 'form', 'table', 'list', 'settings', 'profile', 'pricing', 'footer', 'header', 'blog-post', 'ecommerce', 'authentication', 'onboarding', 'unknown'];
const VALID_FRAMEWORKS: FrameworkHint[] = ['react', 'vue', 'svelte', 'angular', 'vanilla', 'unknown'];

export function coerceSource(value: string | undefined): PatternSource | undefined {
  if (!value || value === 'all') return undefined;
  return VALID_SOURCES.includes(value as PatternSource) ? (value as PatternSource) : undefined;
}

export function coerceLayout(value: string | undefined): LayoutType | undefined {
  if (!value) return undefined;
  return VALID_LAYOUTS.includes(value as LayoutType) ? (value as LayoutType) : undefined;
}

export function coerceFramework(value: string | undefined): FrameworkHint | undefined {
  if (!value) return undefined;
  return VALID_FRAMEWORKS.includes(value as FrameworkHint) ? (value as FrameworkHint) : undefined;
}

export function coerceSourceList(sourcesArg: string | undefined): PatternSource[] {
  if (!sourcesArg || sourcesArg === 'all') return VALID_SOURCES;
  return sourcesArg
    .split(',')
    .map(s => s.trim())
    .filter(s => VALID_SOURCES.includes(s as PatternSource))
    .map(s => s as PatternSource);
}
