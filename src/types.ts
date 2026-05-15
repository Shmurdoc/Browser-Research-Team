// ============================================================
// Design Pattern Multiverse — Core Types
// ============================================================

/** Unique pattern identifier */
export type PatternId = string;

/** Source of a design pattern */
export type PatternSource =
  | 'pinterest'
  | 'dribbble'
  | 'behance'
  | 'figma-community'
  | 'web'
  | 'manual'
  | 'api';

/** Layout type classification */
export type LayoutType =
  | 'dashboard'
  | 'landing-page'
  | 'hero-section'
  | 'navbar'
  | 'sidebar'
  | 'card-grid'
  | 'modal'
  | 'form'
  | 'table'
  | 'list'
  | 'settings'
  | 'profile'
  | 'pricing'
  | 'footer'
  | 'header'
  | 'blog-post'
  | 'ecommerce'
  | 'authentication'
  | 'onboarding'
  | 'unknown';

/** Layout zone within a design */
export type LayoutZone = string;

/** Extracted layout information */
export interface LayoutInfo {
  type: LayoutType;
  zones: LayoutZone[];
  confidence: number; // 0-1
  boundingBoxes?: Array<{
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}

/** Color palette extracted from a design */
export interface ColorPalette {
  primary: string;  // hex
  secondary: string;
  accent: string;
  neutral: string;
  background: string;
  text: string;
  additional: string[];
}

/** Typography information */
export interface TypographyInfo {
  heading: {
    family: string;
    weight: number;
    size: string;
  };
  body: {
    family: string;
    weight: number;
    size: string;
  };
  other: Array<{
    selector: string;
    family: string;
    weight: number;
    size: string;
  }>;
}

/** Classified UI components in the design */
export type ComponentType =
  | 'navbar'
  | 'sidebar'
  | 'footer'
  | 'card'
  | 'button'
  | 'input'
  | 'form'
  | 'table'
  | 'modal'
  | 'dropdown'
  | 'accordion'
  | 'tabs'
  | 'carousel'
  | 'avatar'
  | 'badge'
  | 'breadcrumb'
  | 'pagination'
  | 'progress'
  | 'spinner'
  | 'tooltip'
  | 'chart'
  | 'datatable'
  | 'search-bar'
  | 'hero-section'
  | 'feature-grid'
  | 'testimonial'
  | 'pricing-card'
  | 'cta-section'
  | 'logo-cloud'
  | 'faq-section';

/** Framework hint */
export type FrameworkHint = 'react' | 'vue' | 'svelte' | 'angular' | 'vanilla' | 'unknown';

/** Quality rating 0-10 */
export type QualityScore = number;

/** User feedback entry */
export interface UserFeedback {
  rating: number;        // 1-5 stars
  tags: string[];
  comment?: string;
  timestamp: number;
  userId?: string;
}

/** Core pattern data structure */
export interface DesignPattern {
  id: PatternId;
  source: PatternSource;
  url: string;
  title: string;
  description: string;
  imageHash?: string;
  imageUrl?: string;
  layout: LayoutInfo;
  colors: ColorPalette;
  typography: TypographyInfo;
  components: ComponentType[];
  frameworkHints: FrameworkHint[];
  tags: string[];
  qualityScore: QualityScore;
  embedding: number[];
  feedback: UserFeedback[];
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

/** Pattern search query */
export interface PatternQuery {
  text?: string;
  source?: PatternSource | PatternSource[];
  layoutType?: LayoutType;
  components?: ComponentType[];
  colors?: Partial<ColorPalette>;
  tags?: string[];
  framework?: FrameworkHint;
  minQuality?: QualityScore;
  limit?: number;
  offset?: number;
}

/** Pattern search result */
export interface PatternSearchResult {
  pattern: DesignPattern;
  similarity: number; // 0-1
}

/** Swarm agent type */
export type AgentType =
  | 'scout-pinterest'
  | 'scout-dribbble'
  | 'scout-behance'
  | 'scout-figma'
  | 'vision-layout'
  | 'vision-interpret'
  | 'vision-color'
  | 'vision-typography'
  | 'curator'
  | 'code-gen'
  | 'quality-gate';

/** Swarm topology */
export type SwarmTopology = 'mesh' | 'ring' | 'star' | 'hierarchy';

/** Agent consensus vote */
export interface ConsensusVote {
  agentId: string;
  value: boolean;
  confidence: number;
  evidence?: string;
}

/** Pattern submission from external source */
export interface PatternSubmission {
  source: PatternSource;
  url: string;
  title?: string;
  imageUrl?: string;
  description?: string;
  tags?: string[];
}

/** Code generation request */
export interface CodeGenRequest {
  patternId: PatternId;
  framework: FrameworkHint;
  style: 'tailwind' | 'css-modules' | 'styled-components' | 'vanilla-css';
  options?: {
    typescript?: boolean;
    includeTests?: boolean;
    includeStories?: boolean;
  };
}

/** Code generation result */
export interface CodeGenResult {
  patternId: PatternId;
  framework: FrameworkHint;
  files: Array<{
    path: string;
    content: string;
    language: string;
  }>;
  preview?: string;
}

/** MCP tool definitions for OpenCode */
export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/** Library statistics */
export interface LibraryStats {
  totalPatterns: number;
  totalSources: Record<PatternSource, number>;
  topLayouts: Array<{ type: LayoutType; count: number }>;
  topComponents: Array<{ type: ComponentType; count: number }>;
  averageQuality: number;
  totalFeedback: number;
}
