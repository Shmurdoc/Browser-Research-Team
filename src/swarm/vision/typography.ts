// ============================================================
// Typography Detection
// ============================================================

import { type TypographyInfo, type PatternSubmission } from '../../types.js';

// Style keywords map to font families
const FONT_STYLE_KEYWORDS: Record<string, string[]> = {
  'modern': ['modern', 'contemporary', 'sleek'],
  'minimal': ['minimal', 'clean', 'simple', 'whitespace'],
  'serif': ['serif', 'editorial', 'magazine', 'article'],
  'monospace': ['monospace', 'mono', 'code', 'technical'],
  'playful': ['playful', 'fun', 'friendly', 'rounded'],
  'corporate': ['corporate', 'business', 'enterprise', 'professional'],
  'elegant': ['elegant', 'luxury', 'premium', 'sophisticated'],
};

// Font families detected by style keywords
const FONT_SUGGESTIONS: Record<string, { heading: string; body: string }> = {
  'modern': { heading: 'Inter', body: 'Inter' },
  'minimal': { heading: 'Helvetica Neue', body: 'Helvetica Neue' },
  'serif': { heading: 'Playfair Display', body: 'Source Serif Pro' },
  'monospace': { heading: 'JetBrains Mono', body: 'JetBrains Mono' },
  'playful': { heading: 'Poppins', body: 'Poppins' },
  'corporate': { heading: 'IBM Plex Sans', body: 'IBM Plex Sans' },
  'elegant': { heading: 'Cormorant Garamond', body: 'Proxima Nova' },
};

const FONT_STYLES: Record<string, string> = {
  'heading': 'Inter',
  'display': 'Playfair Display',
  'body': 'Inter',
  'mono': 'JetBrains Mono',
};

export async function detectTypography(
  submission: PatternSubmission
): Promise<{ typography: TypographyInfo; confidence: number }> {
  const text = [
    submission.title ?? '',
    submission.description ?? '',
    ...(submission.tags ?? []),
  ].join(' ').toLowerCase();

  // Detect style from tags
  let detectedStyle = 'modern';
  for (const [style, keywords] of Object.entries(FONT_STYLE_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw))) {
      detectedStyle = style;
      break;
    }
  }

  const fonts = FONT_SUGGESTIONS[detectedStyle] ?? FONT_SUGGESTIONS.modern;

  // Determine if this looks like a dark design
  const isDark = text.includes('dark');
  const bgMode = isDark ? '#111827' : '#F9FAFB';

  const typography: TypographyInfo = {
    heading: {
      family: fonts.heading,
      weight: 700,
      size: isDark ? '32px' : '28px',
    },
    body: {
      family: fonts.body,
      weight: 400,
      size: '16px',
    },
    other: [],
  };

  // Add detected style classes
  if (text.includes('mono') || text.includes('code')) {
    typography.other.push({
      selector: 'code',
      family: 'JetBrains Mono',
      weight: 400,
      size: '14px',
    });
  }

  if (text.includes('small') || text.includes('caption')) {
    typography.other.push({
      selector: 'caption',
      family: fonts.body,
      weight: 400,
      size: '12px',
    });
  }

  const confidence = detectedStyle === 'modern' ? 0.4 : 0.7;

  return { typography, confidence };
}
