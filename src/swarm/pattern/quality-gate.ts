// ============================================================
// Quality Gate Agent — Pattern Quality Scoring with Consensus
// ============================================================
//
// Evaluates pattern quality on 0-10 scale based on:
// - Completeness (does it have all required fields?)
// - Consistency (do layout/components/tags agree?)
// - Source reliability
// - Consensus voting from multiple assessment agents
// ============================================================

import { type DesignPattern, type QualityScore, type ComponentType } from '../../types.js';
import { createLogger_Scoped } from '../../logging/index.js';
import { predictQuality } from '../../memory/sona.js';
import { reachConsensus, updateTrust } from '../../consensus/weighted-vote.js';

const logger = createLogger_Scoped('quality-gate');

export interface QualityAssessment {
  score: QualityScore;
  breakdown: {
    completeness: number;
    consistency: number;
    relevance: number;
    sourceTrust: number;
  };
  issues: string[];
  suggestions: string[];
  consensusReached: boolean;
}

const SOURCE_TRUST: Record<string, number> = {
  'pinterest': 6,
  'dribbble': 7,
  'behance': 7,
  'figma-community': 6,
  'web': 5,
  'manual': 8,
  'api': 7,
};

const REQUIRED_FIELDS = [
  'id', 'source', 'url', 'title', 'layout', 'colors', 'components',
];

/** Assess pattern quality with consensus voting */
export async function assessQuality(pattern: DesignPattern): Promise<QualityAssessment> {
  logger.debug({ patternId: pattern.id, source: pattern.source }, 'Assessing pattern quality');

  const issues: string[] = [];
  const suggestions: string[] = [];

  // 1. Completeness score
  let completenessScore = 10;
  for (const field of REQUIRED_FIELDS) {
    // Check if the field exists and is not empty/falsy
    const fieldValue = (pattern as unknown as Record<string, unknown>)[field];
    if (!fieldValue || (typeof fieldValue === 'string' && fieldValue.trim() === '')) {
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
    suggestions.push('No UI components detected');
  }

  // Bonus for having image data
  if (pattern.imageUrl && pattern.imageUrl.length > 0) {
    completenessScore += 0.5;
  }

  completenessScore = Math.max(0, Math.min(10, completenessScore));
  logger.debug({ completenessScore }, 'Completeness assessment done');

  // 2. Consistency score
  let consistencyScore = 10;

  const layoutComponentMap: Record<string, ComponentType[]> = {
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
    // Filter components that are actually in the pattern's component list
    const hasExpected = expectedComponents.filter(c => {
      // c is already a ComponentType, pattern.components is ComponentType[]
      return pattern.components.includes(c);
    });
    const matchRatio = hasExpected.length / expectedComponents.length;
    if (matchRatio < 0.3) {
      consistencyScore -= 2;
      issues.push(`Components don't match expected layout type "${pattern.layout.type}"`);
      suggestions.push(`Expected components for ${pattern.layout.type}: ${expectedComponents.join(', ')}`);
    } else if (matchRatio < 0.6) {
      consistencyScore -= 1;
    }
  }

  const colorKeys = ['primary', 'secondary', 'accent', 'neutral', 'background', 'text'] as const;
  const patternColors = pattern.colors as unknown as Record<string, string>;
  const missingColors = colorKeys.filter(k => !patternColors[k] || patternColors[k].trim() === '');
  if (missingColors.length > 0) {
    consistencyScore -= 0.5 * missingColors.length;
    suggestions.push(`Missing color definition: ${missingColors.join(', ')}`);
  }

  consistencyScore = Math.max(0, Math.min(10, consistencyScore));
  logger.debug({ consistencyScore }, 'Consistency assessment done');

  // 3. Relevance score from SONA
  const sonaPrediction = predictQuality(pattern);
  const relevanceScore = sonaPrediction;
  logger.debug({ relevanceScore }, 'Relevance assessment done');

  // 4. Source trust score
  const sourceTrust = SOURCE_TRUST[pattern.source] ?? 5;

  // 5. Consensus voting — agents vote on quality assessment
  const votes = [
    { agentId: 'completeness-agent', value: completenessScore >= 6, confidence: completenessScore / 10, evidence: `Completeness: ${completenessScore}/10` },
    { agentId: 'consistency-agent', value: consistencyScore >= 6, confidence: consistencyScore / 10, evidence: `Consistency: ${consistencyScore}/10` },
    { agentId: 'relevance-agent', value: relevanceScore >= 5, confidence: relevanceScore / 10, evidence: `Relevance: ${relevanceScore}/10` },
    { agentId: 'source-trust-agent', value: sourceTrust >= 5, confidence: sourceTrust / 10, evidence: `Source trust: ${sourceTrust}/10` },
  ];

  const consensus = await reachConsensus(votes, { minVotes: 3 });

  // Update trust based on consensus outcome
  for (const vote of votes) {
    const agreedWithConsensus =
      (consensus.decision === 'accepted' && vote.value) ||
      (consensus.decision === 'rejected' && !vote.value);
    updateTrust(vote.agentId, agreedWithConsensus);
  }

  const consensusReached = consensus.decision === 'accepted';
  logger.debug(
    { decision: consensus.decision, agreementRatio: consensus.agreementRatio },
    'Consensus voting completed'
  );

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
      consensusReached,
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
    consensusReached,
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
