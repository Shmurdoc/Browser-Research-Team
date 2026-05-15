// ============================================================
// Quality Gate Agent — Pattern Quality Scoring
// ============================================================
//
// Evaluates pattern quality on 0-10 scale based on:
// - Completeness (does it have all required fields?)
// - Consistency (do layout/components/tags agree?)
// - Source reliability
// ============================================================

import { type DesignPattern, type QualityScore } from '../../types.js';
import { createLogger_Scoped } from '../../logging/index.js';
import { predictQuality } from '../../memory/sona.js';

const logger = createLogger_Scoped('quality-gate');

export interface QualityAssessment {
  score: QualityScore;
  breakdown: {
    completeness: number;   // 0-10
    consistency: number;    // 0-10
    relevance: number;      // 0-10
    sourceTrust: number;    // 0-10
  };
  issues: string[];
  suggestions: string[];
}

/** SOURCE_TRUST: how reliable each source is */
const SOURCE_TRUST: Record<string, number> = {
  'pinterest': 6,
  'dribbble': 7,
  'behance': 7,
  'figma-community': 6,
  'web': 5,
  'manual': 8,
  'api': 7,
};

/** Minimum viable fields for a complete pattern */
const REQUIRED_FIELDS = [
  'id', 'source', 'url', 'title', 'layout', 'colors', 'components',
];

/** Assess pattern quality */
export async function assessQuality(pattern: DesignPattern): Promise<QualityAssessment> {
  logger.debug({ patternId: pattern.id, source: pattern.source }, 'Assessing pattern quality');

  const issues: string[] = [];
  const suggestions: string[] = [];

  // 1. Completeness score
  let completenessScore = 10;
  for (const field of REQUIRED_FIELDS) {
    if (!(pattern as any)[field]) {
      completenessScore -= 1.5;
      issues.push(`Missing required field: ${field}`);
    }
  }

  if (!pattern.description || pattern.description.length < 5) {
    completenessScore -= 1;
    issues.push('Description is too short or missing');
  }

  if (pattern.tags.length === 0) {
    completenessScore -= 0.5;
    suggestions.push('Add tags to improve discoverability');
  }

  if (pattern.components.length === 0) {
    completenessScore -= 1;
    suggestions.push('No UI components detected — consider adding component classification');
  }

  completenessScore = Math.max(0, completenessScore);
  logger.debug({ completenessScore }, 'Completeness assessment done');

  // 2. Consistency score
  let consistencyScore = 10;

  // Check if components align with layout type
  const layoutComponentMap: Record<string, string[]> = {
    'dashboard': ['navbar', 'sidebar', 'card', 'chart', 'datatable'],
    'landing-page': ['navbar', 'hero-section', 'feature-grid', 'footer', 'cta-section'],
    'hero-section': ['button', 'navbar'],
    'navbar': [],
    'form': ['input', 'button', 'dropdown'],
    'pricing': ['pricing-card', 'button', 'navbar', 'footer'],
    'authentication': ['input', 'button', 'card'],
    'ecommerce': ['navbar', 'card', 'button', 'search-bar', 'footer'],
  };

  const expectedComponents = layoutComponentMap[pattern.layout.type] ?? [];
  if (expectedComponents.length > 0) {
    const hasExpected = expectedComponents.filter(c => pattern.components.includes(c as any));
    const matchRatio = hasExpected.length / expectedComponents.length;
    if (matchRatio < 0.3) {
      consistencyScore -= 2;
      issues.push(`Components don't match expected layout type "${pattern.layout.type}"`);
      suggestions.push(`Expected components for ${pattern.layout.type}: ${expectedComponents.join(', ')}`);
    } else if (matchRatio < 0.6) {
      consistencyScore -= 1;
    }
  }

  // Check color palette completeness
  const colorKeys = ['primary', 'secondary', 'accent', 'neutral', 'background', 'text'] as const;
  const missingColors = colorKeys.filter(k => !(pattern.colors as any)[k]);
  if (missingColors.length > 0) {
    consistencyScore -= 0.5 * missingColors.length;
    suggestions.push(`Missing color definitions: ${missingColors.join(', ')}`);
  }

  consistencyScore = Math.max(0, consistencyScore);
  logger.debug({ consistencyScore }, 'Consistency assessment done');

  // 3. Relevance score
  const sonaPrediction = predictQuality(pattern);
  const relevanceScore = sonaPrediction;
  logger.debug({ relevanceScore }, 'Relevance assessment done');

  // 4. Source trust score
  const sourceTrust = SOURCE_TRUST[pattern.source] ?? 5;

  // Overall score (weighted)
  const score = Math.round(
    completenessScore * 0.3 +
    consistencyScore * 0.25 +
    relevanceScore * 0.25 +
    sourceTrust * 0.2
  );

  const finalScore = clamp(score, 0, 10);

  logger.info(
    {
      patternId: pattern.id,
      score: finalScore,
      completeness: completenessScore,
      consistency: consistencyScore,
      relevance: relevanceScore,
      sourceTrust,
      issues: issues.length,
      suggestions: suggestions.length,
    },
    'Quality assessment complete'
  );

  return {
    score: finalScore,
    breakdown: {
      completeness: completenessScore,
      consistency: consistencyScore,
      relevance: relevanceScore,
      sourceTrust,
    },
    issues,
    suggestions,
  };
}

/** Quick binary pass/fail check */
export function passesQualityGate(pattern: DesignPattern, threshold: QualityScore = 5): boolean {
  const passes = pattern.qualityScore >= threshold;
  logger.debug(
    { patternId: pattern.id, score: pattern.qualityScore, threshold, passes },
    'Quality gate check'
  );
  return passes;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
