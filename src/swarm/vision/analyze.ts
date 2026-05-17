// ============================================================
// Vision Analysis — GPT-4o Image Understanding
// ============================================================
//
// Real vision pipeline: sends design images to GPT-4o vision API
// and extracts structured layout, component, color, and typography data.
// Falls back to heuristic keyword analysis when no API key or no image.
// ============================================================

import OpenAI from 'openai';
import {
  type DesignPattern,
  type LayoutInfo,
  type ColorPalette,
  type TypographyInfo,
  type ComponentType,
  type PatternSubmission,
} from '../../types.js';
import { config, hasOpenAIKey } from '../../config.js';
import { createLogger_Scoped } from '../../logging/index.js';
import { analyzeLayout } from './layout.js';
import { classifyElements } from './elements.js';
import { extractColors } from './color.js';
import { detectTypography } from './typography.js';

const logger = createLogger_Scoped('vision:analyze');

// Strict JSON schema for GPT-4o structured output
const VISION_SCHEMA = {
  type: 'object' as const,
  properties: {
    layout: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string' as const,
          description: 'Layout type: dashboard, landing-page, hero-section, navbar, sidebar, card-grid, modal, form, table, list, settings, profile, pricing, footer, header, blog-post, ecommerce, authentication, onboarding',
        },
        zones: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description: 'Detected layout zones (e.g. header, sidebar, main, footer, hero)',
        },
        confidence: {
          type: 'number' as const,
          description: 'Confidence 0-1 in layout classification',
        },
      },
      required: ['type', 'zones', 'confidence'],
    },
    components: {
      type: 'array' as const,
      items: { type: 'string' as const },
      description: 'UI components detected: navbar, sidebar, footer, card, button, input, form, table, modal, dropdown, accordion, tabs, carousel, avatar, badge, breadcrumb, pagination, progress, spinner, tooltip, chart, datatable, search-bar, hero-section, feature-grid, testimonial, pricing-card, cta-section, logo-cloud, faq-section',
    },
    colors: {
      type: 'object' as const,
      properties: {
        primary: { type: 'string' as const, description: 'Primary brand color as hex' },
        secondary: { type: 'string' as const, description: 'Secondary color as hex' },
        accent: { type: 'string' as const, description: 'Accent color as hex' },
        neutral: { type: 'string' as const, description: 'Neutral/gray color as hex' },
        background: { type: 'string' as const, description: 'Background color as hex' },
        text: { type: 'string' as const, description: 'Text color as hex' },
        additional: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description: 'Additional colors found in the design',
        },
      },
      required: ['primary', 'secondary', 'accent', 'neutral', 'background', 'text', 'additional'],
    },
    typography: {
      type: 'object' as const,
      properties: {
        heading: {
          type: 'object' as const,
          properties: {
            family: { type: 'string' as const, description: 'Heading font family name' },
            weight: { type: 'number' as const, description: 'Font weight (400-900)' },
            size: { type: 'string' as const, description: 'Font size with unit (e.g. 24px, 1.5rem)' },
          },
          required: ['family', 'weight', 'size'],
        },
        body: {
          type: 'object' as const,
          properties: {
            family: { type: 'string' as const, description: 'Body font family name' },
            weight: { type: 'number' as const, description: 'Font weight (400-900)' },
            size: { type: 'string' as const, description: 'Font size with unit (e.g. 16px, 1rem)' },
          },
          required: ['family', 'weight', 'size'],
        },
        other: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              selector: { type: 'string' as const },
              family: { type: 'string' as const },
              weight: { type: 'number' as const },
              size: { type: 'string' as const },
            },
            required: ['selector', 'family', 'weight', 'size'],
          },
        },
      },
      required: ['heading', 'body', 'other'],
    },
    confidence: {
      type: 'number' as const,
      description: 'Overall confidence 0-1 in the analysis',
    },
  },
  required: ['layout', 'components', 'colors', 'typography', 'confidence'],
};

const VALID_LAYOUT_TYPES = [
  'dashboard', 'landing-page', 'hero-section', 'navbar', 'sidebar',
  'card-grid', 'modal', 'form', 'table', 'list', 'settings', 'profile',
  'pricing', 'footer', 'header', 'blog-post', 'ecommerce', 'authentication',
  'onboarding', 'unknown',
] as const;

const VALID_COMPONENTS = [
  'navbar', 'sidebar', 'footer', 'card', 'button', 'input', 'form', 'table',
  'modal', 'dropdown', 'accordion', 'tabs', 'carousel', 'avatar', 'badge',
  'breadcrumb', 'pagination', 'progress', 'spinner', 'tooltip', 'chart',
  'datatable', 'search-bar', 'hero-section', 'feature-grid', 'testimonial',
  'pricing-card', 'cta-section', 'logo-cloud', 'faq-section',
] as const;

function sanitizeVisionResponse(raw: unknown): {
  layout: LayoutInfo;
  components: ComponentType[];
  colors: ColorPalette;
  typography: TypographyInfo;
  confidence: number;
} {
  const obj = raw as Record<string, unknown>;

  // Layout
  const rawLayout = obj.layout as Record<string, unknown> | undefined;
  const layout: LayoutInfo = {
    type: (VALID_LAYOUT_TYPES as readonly string[]).includes(rawLayout?.type as string)
      ? rawLayout!.type as LayoutInfo['type']
      : 'unknown',
    zones: Array.isArray(rawLayout?.zones) ? rawLayout.zones as string[] : ['main'],
    confidence: typeof rawLayout?.confidence === 'number'
      ? Math.max(0, Math.min(1, rawLayout.confidence))
      : 0.5,
  };

  // Components
  const rawComponents = obj.components as string[] | undefined;
  const components: ComponentType[] = Array.isArray(rawComponents)
    ? rawComponents.filter((c): c is ComponentType =>
        (VALID_COMPONENTS as readonly string[]).includes(c)
      )
    : [];

  // Colors
  const rawColors = obj.colors as Record<string, unknown> | undefined;
  const hexRegex = /^#[0-9a-fA-F]{6}$/;
  const safeHex = (v: unknown, fallback: string) =>
    typeof v === 'string' && hexRegex.test(v) ? v : fallback;

  const colors: ColorPalette = {
    primary: safeHex(rawColors?.primary, '#3B82F6'),
    secondary: safeHex(rawColors?.secondary, '#10B981'),
    accent: safeHex(rawColors?.accent, '#F59E0B'),
    neutral: safeHex(rawColors?.neutral, '#6B7280'),
    background: safeHex(rawColors?.background, '#FFFFFF'),
    text: safeHex(rawColors?.text, '#111827'),
    additional: Array.isArray(rawColors?.additional)
      ? (rawColors.additional as string[]).filter((c: string) => hexRegex.test(c))
      : [],
  };

  // Typography
  const rawTypo = obj.typography as Record<string, unknown> | undefined;
  const rawHeading = rawTypo?.heading as Record<string, unknown> | undefined;
  const rawBody = rawTypo?.body as Record<string, unknown> | undefined;

  const typography: TypographyInfo = {
    heading: {
      family: typeof rawHeading?.family === 'string' && rawHeading.family.length > 0
        ? rawHeading.family
        : 'Inter',
      weight: typeof rawHeading?.weight === 'number'
        ? Math.max(100, Math.min(900, rawHeading.weight))
        : 700,
      size: typeof rawHeading?.size === 'string' && rawHeading.size.length > 0
        ? rawHeading.size
        : '24px',
    },
    body: {
      family: typeof rawBody?.family === 'string' && rawBody.family.length > 0
        ? rawBody.family
        : 'Inter',
      weight: typeof rawBody?.weight === 'number'
        ? Math.max(100, Math.min(900, rawBody.weight))
        : 400,
      size: typeof rawBody?.size === 'string' && rawBody.size.length > 0
        ? rawBody.size
        : '16px',
    },
    other: Array.isArray(rawTypo?.other)
      ? (rawTypo.other as Array<Record<string, unknown>>).map(o => ({
          selector: typeof o.selector === 'string' ? o.selector : 'text',
          family: typeof o.family === 'string' ? o.family : 'Inter',
          weight: typeof o.weight === 'number' ? Math.max(100, Math.min(900, o.weight)) : 400,
          size: typeof o.size === 'string' ? o.size : '14px',
        }))
      : [],
  };

  // Overall confidence
  const confidence = typeof obj.confidence === 'number'
    ? Math.max(0, Math.min(1, obj.confidence))
    : 0.7;

  return { layout, components, colors, typography, confidence };
}

/**
 * Analyze a design image using GPT-4o vision API.
 * Falls back to heuristic analysis if no API key or no image URL.
 */
export async function analyzeImage(
  imageUrl: string | undefined,
  submission: PatternSubmission
): Promise<{
  layout: LayoutInfo;
  components: ComponentType[];
  colors: ColorPalette;
  typography: TypographyInfo;
  confidence: number;
}> {
  // No image URL or no API key — fall back to heuristics
  if (!imageUrl || !hasOpenAIKey) {
    logger.debug({ hasImage: !!imageUrl, hasKey: hasOpenAIKey }, 'Falling back to heuristic vision analysis');
    return runHeuristicAnalysis(submission);
  }

  try {
    const openai = new OpenAI({
      apiKey: config.openaiApiKey,
      timeout: config.apiTimeoutMs,
    });

    const contextText = [
      submission.title ? `Title: ${submission.title}` : '',
      submission.description ? `Description: ${submission.description}` : '',
      submission.tags?.length ? `Tags: ${submission.tags.join(', ')}` : '',
    ].filter(Boolean).join('\n');

    const response = await openai.chat.completions.create({
      model: config.visionModel,
      max_tokens: config.visionMaxTokens,
      messages: [
        {
          role: 'system',
          content: `You are a design analysis expert. Analyze the provided UI/UX design image and extract structured information about its layout, components, colors, and typography. Return ONLY valid JSON matching the schema. Be precise with color hex values. Identify the layout type from the allowed list. List all UI components you can see.`,
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url' as const,
              image_url: {
                url: imageUrl,
                detail: 'high' as const,
              },
            },
            {
              type: 'text' as const,
              text: contextText || 'Analyze this design image.',
            },
          ],
        },
      ],
      response_format: {
        type: 'json_schema' as const,
        json_schema: {
          name: 'design_analysis',
          schema: VISION_SCHEMA,
          strict: true,
        },
      },
    });

    const rawContent = response.choices[0]?.message?.content;
    if (!rawContent) {
      throw new Error('Empty response from vision API');
    }

    const parsed = JSON.parse(rawContent);
    const result = sanitizeVisionResponse(parsed);

    logger.info(
      {
        layoutType: result.layout.type,
        components: result.components.length,
        confidence: result.confidence,
        model: config.visionModel,
      },
      'Vision analysis completed via GPT-4o'
    );

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ error: message }, 'Vision API call failed, falling back to heuristics');
    return runHeuristicAnalysis(submission);
  }
}

/**
 * Run heuristic-based analysis (the original mock pipeline).
 * Used as fallback when no API key, no image, or API call fails.
 */
async function runHeuristicAnalysis(submission: PatternSubmission): Promise<{
  layout: LayoutInfo;
  components: ComponentType[];
  colors: ColorPalette;
  typography: TypographyInfo;
  confidence: number;
}> {
  const [layout, elements, colors, typography] = await Promise.all([
    analyzeLayout(submission),
    classifyElements(submission),
    extractColors(submission),
    detectTypography(submission),
  ]);

  const confidences = [
    layout.confidence ?? 0,
    elements.confidence ?? 0,
    colors.confidence ?? 0,
    typography.confidence ?? 0,
  ].filter(c => c > 0);

  const confidence = confidences.length > 0
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length
    : 0;

  return {
    layout,
    components: elements.components ?? [],
    colors: colors.palette,
    typography: typography.typography,
    confidence,
  };
}
