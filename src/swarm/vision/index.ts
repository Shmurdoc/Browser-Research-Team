// ============================================================
// Vision Swarm — Image Understanding Agents
// ============================================================
//
// Interprets design images and extracts structured information:
// layout, components, colors, typography.
// Uses GPT-4o vision API when available, falls back to heuristics.
// ============================================================

import {
  type DesignPattern,
  type LayoutInfo,
  type ColorPalette,
  type TypographyInfo,
  type ComponentType,
  type PatternSubmission,
} from '../../types.js';
import { VisionError } from '../../errors/index.js';
import { retry, type RetryConfig } from '../../utils/retry.js';
import { createLogger_Scoped } from '../../logging/index.js';
import { analyzeLayout } from './layout.js';
import { classifyElements } from './elements.js';
import { extractColors } from './color.js';
import { detectTypography } from './typography.js';
import { analyzeImage } from './analyze.js';

const logger = createLogger_Scoped('vision');

export interface VisionResult {
  layout: LayoutInfo;
  components: ComponentType[];
  colors: ColorPalette;
  typography: TypographyInfo;
  confidence: number; // 0-1 overall
}

/** Default retry configuration for vision agents */
const VISION_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 2,
  initialDelayMs: 300,
  multiplier: 2,
  maxDelayMs: 3000,
  jitterFraction: 0.1,
};

/**
 * Run a vision agent with retry and partial failure handling
 */
async function runVisionAgent<T extends { confidence: number }>(
  name: string,
  agent: (s: PatternSubmission) => Promise<T>,
  submission: PatternSubmission,
  fallbackType: 'layout' | 'elements' | 'colors' | 'typography'
): Promise<T> {
  try {
    return await retry(
      () => agent(submission),
      VISION_RETRY_CONFIG
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ name, error: message }, `Vision agent ${name} failed, using fallback`);
    return createFallbackResult(fallbackType, submission) as T;
  }
}

/**
 * Create a fallback result with confidence=0 for a failed vision agent
 */
function createFallbackResult(
  type: 'layout' | 'elements' | 'colors' | 'typography',
  submission: PatternSubmission
): any {
  const fallbacks: Record<string, () => any> = {
    layout: () => ({
      confidence: 0,
      type: 'unknown' as const,
      zones: [],
    }),
    elements: () => ({
      components: [],
      confidence: 0,
    }),
    colors: () => ({
      palette: {
        primary: '#000000',
        secondary: '#ffffff',
        accent: '#0000ff',
        neutral: '#808080',
        background: '#ffffff',
        text: '#000000',
        additional: [],
      },
      confidence: 0,
    }),
    typography: () => ({
      typography: {
        heading: { family: 'sans-serif', weight: 700, size: '24px' },
        body: { family: 'sans-serif', weight: 400, size: '16px' },
        other: [],
      },
      confidence: 0,
    }),
  };

  return fallbacks[type]?.() ?? {};
}

/** Run full vision pipeline on a submission */
export async function interpretSubmission(
  submission: PatternSubmission
): Promise<VisionResult> {
  try {
    // Use real GPT-4o vision analysis when image URL is available
    const result = await analyzeImage(submission.imageUrl, submission);

    return {
      layout: result.layout,
      components: result.components,
      colors: result.colors,
      typography: result.typography,
      confidence: result.confidence,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new VisionError(
      `Vision pipeline failed: ${message}`,
      { submission }
    );
  }
}

export { analyzeLayout } from './layout.js';
export { classifyElements } from './elements.js';
export { extractColors } from './color.js';
export { detectTypography } from './typography.js';
export { analyzeImage } from './analyze.js';
