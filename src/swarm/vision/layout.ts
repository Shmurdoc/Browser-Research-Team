// ============================================================
// Layout Detection (DETR-inspired)
// ============================================================

import {
  type LayoutInfo,
  type LayoutType,
  type PatternSubmission,
} from '../../types.js';

// Layout classifier from tags and title
const LAYOUT_KEYWORDS: Record<LayoutType, string[]> = {
  'dashboard': ['dashboard', 'analytics', 'admin', 'metrics', 'panel', 'stats'],
  'landing-page': ['landing', 'homepage', 'hero', 'splash', 'marketing'],
  'hero-section': ['hero', 'banner', 'jumbotron', 'splash', 'headline'],
  'navbar': ['navbar', 'navigation', 'nav', 'header', 'menu', 'topbar'],
  'sidebar': ['sidebar', 'side panel', 'drawer', 'sidenav'],
  'card-grid': ['card', 'grid', 'gallery', 'masonry', 'cards'],
  'modal': ['modal', 'dialog', 'overlay', 'popup', 'lightbox'],
  'form': ['form', 'input', 'signup', 'login', 'register', 'contact'],
  'table': ['table', 'data table', 'grid', 'spreadsheet', 'list view'],
  'list': ['list', 'feed', 'timeline', 'stream', 'items'],
  'settings': ['settings', 'preferences', 'configuration', 'options'],
  'profile': ['profile', 'account', 'user', 'avatar'],
  'pricing': ['pricing', 'plans', 'subscription', 'tiers', 'compare'],
  'footer': ['footer', 'bottom', 'site map'],
  'header': ['header', 'top bar', 'masthead'],
  'blog-post': ['blog', 'article', 'post', 'content'],
  'ecommerce': ['ecommerce', 'shop', 'store', 'product', 'cart', 'checkout'],
  'authentication': ['auth', 'login', 'signup', 'register', 'password', 'mfa'],
  'onboarding': ['onboarding', 'welcome', 'getting started', 'tutorial', 'tour'],
  'unknown': [],
};

const ZONE_KEYWORDS: Record<string, string[]> = {
  'header': ['header', 'top', 'navbar', 'banner'],
  'sidebar': ['sidebar', 'left', 'aside', 'nav'],
  'main': ['main', 'content', 'center', 'primary'],
  'footer': ['footer', 'bottom', 'site map'],
  'hero': ['hero', 'jumbotron', 'splash'],
};

export async function analyzeLayout(
  submission: PatternSubmission
): Promise<{ type: LayoutType; zones: string[]; confidence: number; boundingBoxes?: any[] }> {
  const textForAnalysis = [
    submission.title ?? '',
    submission.description ?? '',
    ...(submission.tags ?? []),
  ].join(' ').toLowerCase();

  // Score each layout type
  const scored = (Object.entries(LAYOUT_KEYWORDS) as [LayoutType, string[]][]).map(
    ([type, keywords]) => {
      const score = keywords.filter(kw => textForAnalysis.includes(kw)).length;
      return { type, score };
    }
  );

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const type = best.score > 0 ? best.type : 'unknown';
  const confidence = Math.min(1, (best.score / 3));

  // Detect zones
  const zones: string[] = [];
  for (const [zone, keywords] of Object.entries(ZONE_KEYWORDS)) {
    if (keywords.some(kw => textForAnalysis.includes(kw))) {
      zones.push(zone);
    }
  }

  // Default zones if none detected
  if (zones.length === 0) {
    zones.push('main');
  }

  return { type, zones, confidence };
}
