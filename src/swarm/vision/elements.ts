// ============================================================
// Element Classification (CLIP-inspired)
// ============================================================

import { type ComponentType, type PatternSubmission } from '../../types.js';

const COMPONENT_KEYWORDS: Record<ComponentType, string[]> = {
  'navbar': ['navbar', 'navigation', 'nav', 'header', 'menu'],
  'sidebar': ['sidebar', 'sidenav', 'drawer', 'side panel'],
  'footer': ['footer', 'bottom'],
  'card': ['card', 'tile', 'panel'],
  'button': ['button', 'btn', 'cta', 'action'],
  'input': ['input', 'text field', 'search bar', 'typeahead'],
  'form': ['form', 'signup', 'login', 'register'],
  'table': ['table', 'data table', 'grid view', 'spreadsheet'],
  'modal': ['modal', 'dialog', 'popup', 'overlay'],
  'dropdown': ['dropdown', 'select', 'menu', 'picker'],
  'accordion': ['accordion', 'collapse', 'expandable'],
  'tabs': ['tabs', 'tabbed', 'tab bar', 'navigation'],
  'carousel': ['carousel', 'slider', 'slideshow'],
  'avatar': ['avatar', 'profile pic', 'user photo'],
  'badge': ['badge', 'tag', 'label', 'pill'],
  'breadcrumb': ['breadcrumb', 'path', 'trail'],
  'pagination': ['pagination', 'page numbers', 'pager'],
  'progress': ['progress', 'progress bar', 'loading'],
  'spinner': ['spinner', 'loading', 'loader'],
  'tooltip': ['tooltip', 'hover card', 'popover'],
  'chart': ['chart', 'graph', 'visualization', 'plot'],
  'datatable': ['datatable', 'data grid', 'sortable table'],
  'search-bar': ['search', 'search bar', 'search input'],
  'hero-section': ['hero', 'jumbotron', 'banner', 'splash'],
  'feature-grid': ['feature', 'grid', 'showcase', 'highlights'],
  'testimonial': ['testimonial', 'review', 'quote', 'social proof'],
  'pricing-card': ['pricing', 'plan', 'tier', 'subscription'],
  'cta-section': ['cta', 'call to action', 'signup', 'get started'],
  'logo-cloud': ['logo', 'brand', 'company', 'partner'],
  'faq-section': ['faq', 'questions', 'accordion'],
};

export async function classifyElements(
  submission: PatternSubmission
): Promise<{ components: ComponentType[]; confidence: number }> {
  const textForAnalysis = [
    submission.title ?? '',
    submission.description ?? '',
    ...(submission.tags ?? []),
  ].join(' ').toLowerCase();

  const found: ComponentType[] = [];

  for (const [component, keywords] of Object.entries(COMPONENT_KEYWORDS)) {
    if (keywords.some(kw => textForAnalysis.includes(kw))) {
      found.push(component as ComponentType);
    }
  }

  // Always include some basics based on layout patterns
  const layoutHints = ['navbar', 'footer', 'button', 'card'];
  for (const hint of layoutHints) {
    if (!found.includes(hint as ComponentType) && found.length < 3) {
      // Check if common enough
      if (submission.tags?.some(t => t.toLowerCase() === 'dashboard' || t.toLowerCase() === 'landing')) {
        continue;
      }
    }
  }

  const confidence = found.length > 0 ? Math.min(1, found.length / 5) : 0.3;

  return { components: found, confidence };
}
