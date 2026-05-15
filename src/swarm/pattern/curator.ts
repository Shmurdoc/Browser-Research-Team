// ============================================================
// Curator Agent — Deduplication, Taxonomy, Similarity
// ============================================================

import {
  type DesignPattern,
  type PatternId,
  type ComponentType,
  type LayoutType,
  type PatternSource,
} from '../../types.js';
import { generateEmbedding } from '../../memory/agentdb.js';

export interface TaxonAssignment {
  primaryCategory: string;
  subCategories: string[];
  tags: string[];
  confidence: number;
}

const LAYOUT_CATEGORIES: Record<LayoutType, string> = {
  'dashboard': 'Data Display',
  'landing-page': 'Marketing',
  'hero-section': 'Marketing',
  'navbar': 'Navigation',
  'sidebar': 'Navigation',
  'card-grid': 'Content Display',
  'modal': 'Overlay',
  'form': 'Input & Forms',
  'table': 'Data Display',
  'list': 'Content Display',
  'settings': 'Configuration',
  'profile': 'User Management',
  'pricing': 'Marketing',
  'footer': 'Navigation',
  'header': 'Navigation',
  'blog-post': 'Content',
  'ecommerce': 'Commerce',
  'authentication': 'Security',
  'onboarding': 'User Experience',
  'unknown': 'Uncategorised',
};

/** Assign taxonomy to a pattern */
export function assignTaxonomy(pattern: DesignPattern): TaxonAssignment {
  const category = LAYOUT_CATEGORIES[pattern.layout.type] ?? 'Uncategorised';
  const subCategories: string[] = [];

  // Derive subcategories from components
  const componentCategories: Record<string, string> = {
    'navbar': 'Navigation Components',
    'sidebar': 'Navigation Components',
    'button': 'Action Components',
    'form': 'Form Components',
    'input': 'Form Components',
    'card': 'Display Components',
    'table': 'Data Components',
    'modal': 'Overlay Components',
    'chart': 'Data Visualization',
    'datatable': 'Data Components',
  };

  for (const comp of pattern.components) {
    const subCat = componentCategories[comp];
    if (subCat && !subCategories.includes(subCat)) {
      subCategories.push(subCat);
    }
  }

  // Add framework subcategory
  if (pattern.frameworkHints.length > 0) {
    subCategories.push('Framework Specific');
  }

  return {
    primaryCategory: category,
    subCategories,
    tags: pattern.tags,
    confidence: pattern.qualityScore / 10,
  };
}

/** Compute similarity between two patterns (0-1) */
export function computeSimilarity(
  a: DesignPattern,
  b: DesignPattern
): number {
  // Layout type match
  const layoutScore = a.layout.type === b.layout.type ? 0.3 : 0;

  // Component overlap (Jaccard)
  const aComps = new Set(a.components);
  const bComps = new Set(b.components);
  const intersection = new Set([...aComps].filter(c => bComps.has(c)));
  const union = new Set([...aComps, ...bComps]);
  const componentScore = union.size > 0 ? (intersection.size / union.size) * 0.3 : 0;

  // Color similarity (simple euclidean on primary)
  const colorScore = a.colors.primary === b.colors.primary ? 0.2 : 0;

  // Tag overlap (Jaccard)
  const aTags = new Set(a.tags);
  const bTags = new Set(b.tags);
  const tagIntersection = new Set([...aTags].filter(t => bTags.has(t)));
  const tagUnion = new Set([...aTags, ...bTags]);
  const tagScore = tagUnion.size > 0 ? (tagIntersection.size / tagUnion.size) * 0.2 : 0;

  return Math.min(1, layoutScore + componentScore + colorScore + tagScore);
}

/** Check if two patterns are duplicates (similarity > 0.8) */
export function isDuplicate(a: DesignPattern, b: DesignPattern): boolean {
  return computeSimilarity(a, b) > 0.8;
}

/** Merge two similar patterns into one */
export function mergePatterns(
  primary: DesignPattern,
  secondary: DesignPattern
): DesignPattern {
  return {
    ...primary,
    tags: [...new Set([...primary.tags, ...secondary.tags])],
    components: [...new Set([...primary.components, ...secondary.components])],
    frameworkHints: [...new Set([...primary.frameworkHints, ...secondary.frameworkHints])],
    qualityScore: Math.max(primary.qualityScore, secondary.qualityScore),
    feedback: [...primary.feedback, ...secondary.feedback],
    updatedAt: Date.now(),
  };
}
