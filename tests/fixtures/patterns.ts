// ============================================================
// Test Fixtures — Mock Data Generators
// ============================================================

import { nanoid } from 'nanoid';
import {
  type DesignPattern,
  type PatternSubmission,
  type LayoutInfo,
  type ColorPalette,
  type TypographyInfo,
} from '../../src/types.js';

/**
 * Generate a mock design pattern
 */
export function createMockPattern(overrides?: Partial<DesignPattern>): DesignPattern {
  const id = overrides?.id ?? nanoid();
  return {
    id,
    source: 'pinterest',
    url: `https://example.com/pattern/${id}`,
    title: 'Test Pattern',
    description: 'A test design pattern',
    imageHash: 'test-hash',
    layout: createMockLayout(),
    colors: createMockColorPalette(),
    typography: createMockTypography(),
    components: ['button', 'card', 'navbar'],
    frameworkHints: ['react', 'vue'],
    tags: ['test', 'design'],
    qualityScore: 7,
    embedding: Array(384).fill(0.5),
    feedback: [],
    metadata: { source: 'mock' },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

/**
 * Generate a mock pattern submission
 */
export function createMockSubmission(overrides?: Partial<PatternSubmission>): PatternSubmission {
  return {
    source: 'pinterest',
    url: 'https://example.com/design/1',
    title: 'Test Design',
    description: 'A test design submission',
    tags: ['test', 'design'],
    ...overrides,
  };
}

/**
 * Generate a mock layout info
 */
export function createMockLayout(overrides?: Partial<LayoutInfo>): LayoutInfo {
  return {
    type: 'dashboard',
    zones: ['header', 'sidebar', 'content'],
    confidence: 0.9,
    boundingBoxes: [
      { label: 'header', x: 0, y: 0, width: 100, height: 10 },
      { label: 'sidebar', x: 0, y: 10, width: 20, height: 90 },
      { label: 'content', x: 20, y: 10, width: 80, height: 90 },
    ],
    ...overrides,
  };
}

/**
 * Generate a mock color palette
 */
export function createMockColorPalette(overrides?: Partial<ColorPalette>): ColorPalette {
  return {
    primary: '#3b82f6',
    secondary: '#8b5cf6',
    accent: '#ec4899',
    neutral: '#6b7280',
    background: '#ffffff',
    text: '#1f2937',
    additional: ['#f3f4f6', '#e5e7eb'],
    ...overrides,
  };
}

/**
 * Generate a mock typography info
 */
export function createMockTypography(overrides?: Partial<TypographyInfo>): TypographyInfo {
  return {
    heading: {
      family: 'Inter, sans-serif',
      weight: 700,
      size: '32px',
    },
    body: {
      family: 'Inter, sans-serif',
      weight: 400,
      size: '16px',
    },
    other: [
      { selector: 'small', family: 'Inter, sans-serif', weight: 400, size: '12px' },
    ],
    ...overrides,
  };
}

/**
 * Generate multiple mock patterns
 */
export function createMockPatterns(count: number): DesignPattern[] {
  return Array.from({ length: count }, (_, i) =>
    createMockPattern({
      id: `pattern-${i}`,
      title: `Pattern ${i}`,
      source: ['pinterest', 'dribbble', 'behance'][i % 3] as any,
      layout: { ...createMockLayout(), type: ['dashboard', 'landing-page', 'form'][i % 3] as any },
      qualityScore: Math.floor(Math.random() * 10),
    })
  );
}
