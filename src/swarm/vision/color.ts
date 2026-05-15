// ============================================================
// Color Palette Extraction
// ============================================================
//
// Extracts color palette from design submissions.
// Uses tag-based heuristics to generate representative palettes.
// In production, uses a CNN trained on UI screenshots.
// ============================================================

import { type ColorPalette, type PatternSubmission } from '../../types.js';

// Common design color schemes tagged by theme
const THEME_PALETTES: Record<string, ColorPalette> = {
  'modern': {
    primary: '#3B82F6', secondary: '#10B981', accent: '#F59E0B',
    neutral: '#6B7280', background: '#FFFFFF', text: '#111827',
    additional: ['#8B5CF6', '#EC4899'],
  },
  'dark': {
    primary: '#60A5FA', secondary: '#34D399', accent: '#FBBF24',
    neutral: '#9CA3AF', background: '#111827', text: '#F9FAFB',
    additional: ['#A78BFA', '#F472B6'],
  },
  'minimal': {
    primary: '#000000', secondary: '#6B7280', accent: '#3B82F6',
    neutral: '#D1D5DB', background: '#FFFFFF', text: '#111827',
    additional: ['#9CA3AF'],
  },
  'gradient': {
    primary: '#7C3AED', secondary: '#EC4899', accent: '#F59E0B',
    neutral: '#6B7280', background: '#FFFFFF', text: '#1F2937',
    additional: ['#3B82F6', '#10B981'],
  },
  'nature': {
    primary: '#059669', secondary: '#D97706', accent: '#FCD34D',
    neutral: '#78716C', background: '#FEFCE8', text: '#292524',
    additional: ['#0EA5E9', '#84CC16'],
  },
  'corporate': {
    primary: '#1E3A5F', secondary: '#2563EB', accent: '#F59E0B',
    neutral: '#64748B', background: '#F8FAFC', text: '#0F172A',
    additional: ['#475569', '#CBD5E1'],
  },
  'playful': {
    primary: '#EC4899', secondary: '#8B5CF6', accent: '#F59E0B',
    neutral: '#A1A1AA', background: '#FFF7ED', text: '#292524',
    additional: ['#06B6D4', '#84CC16'],
  },
  'luxury': {
    primary: '#D97706', secondary: '#1C1917', accent: '#FDE68A',
    neutral: '#78716C', background: '#FAF5FF', text: '#1C1917',
    additional: ['#B45309', '#44403C'],
  },
};

function detectTheme(text: string): string {
  const themeKeywords: Record<string, string[]> = {
    'dark': ['dark', 'night', 'dark mode'],
    'minimal': ['minimal', 'clean', 'simple', 'white space'],
    'gradient': ['gradient', 'vibrant', 'colorful'],
    'nature': ['nature', 'green', 'organic', 'earthy'],
    'corporate': ['corporate', 'business', 'enterprise', 'professional'],
    'playful': ['playful', 'fun', 'colorful', 'bright'],
    'luxury': ['luxury', 'premium', 'elegant', 'gold'],
  };

  for (const [theme, keywords] of Object.entries(themeKeywords)) {
    if (keywords.some(kw => text.includes(kw))) return theme;
  }

  return 'modern';
}

export async function extractColors(
  submission: PatternSubmission
): Promise<{ palette: ColorPalette; confidence: number }> {
  const text = [
    submission.title ?? '',
    submission.description ?? '',
    ...(submission.tags ?? []),
  ].join(' ').toLowerCase();

  const theme = detectTheme(text);
  const palette = THEME_PALETTES[theme] ?? THEME_PALETTES.modern;

  // Confidence based on how strongly the theme was detected
  const themeKeywords: Record<string, string[]> = {
    'dark': ['dark', 'night', 'dark mode'],
    'minimal': ['minimal', 'clean', 'simple'],
    'gradient': ['gradient', 'vibrant'],
    'nature': ['nature', 'green', 'organic'],
    'corporate': ['corporate', 'business'],
    'playful': ['playful', 'fun', 'colorful'],
    'luxury': ['luxury', 'premium'],
    'modern': ['modern', 'contemporary'],
  };
  const matches = (themeKeywords[theme] ?? []).filter(kw => text.includes(kw)).length;
  const confidence = theme === 'modern' ? 0.5 : Math.min(1, matches / 2);

  return { palette, confidence };
}
