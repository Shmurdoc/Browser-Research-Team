// ============================================================
// MCP Prompts — Pre-defined Interaction Templates
// ============================================================
//
// Prompt templates that standardize common design analysis tasks
// and reduce prompt drift across sessions.
// ============================================================

import type { PromptArgument, PromptMessage } from '@modelcontextprotocol/sdk/types.js';

export interface PromptDef {
  name: string;
  description: string;
  arguments: PromptArgument[];
  handler: (args: Record<string, string | undefined>) => PromptMessage[];
}

export function buildPrompts(): PromptDef[] {
  return [
    {
      name: 'analyze-design',
      description: 'Analyze a design submission and extract structured pattern information including layout, colors, typography, and components.',
      arguments: [
        { name: 'url', description: 'URL of the design to analyze', required: true },
        { name: 'title', description: 'Title for the design', required: false },
      ],
      handler: (args) => [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Analyze the design at ${args.url}${args.title ? ` titled "${args.title}"` : ''}.

Please:
1. Identify the layout type (dashboard, landing-page, hero-section, navbar, form, pricing, etc.)
2. List all UI components visible (navbar, sidebar, card, button, input, table, modal, etc.)
3. Extract the color palette (primary, secondary, accent, neutral, background, text)
4. Identify the typography (heading font, body font, sizes)
5. Suggest relevant tags for categorization
6. Rate the design quality on a scale of 1-10 with reasoning

Return your analysis as structured JSON.`,
          },
        },
      ],
    },

    {
      name: 'generate-component',
      description: 'Generate production-ready frontend code from a design pattern in the library.',
      arguments: [
        { name: 'pattern_id', description: 'ID of the pattern to generate code from', required: true },
        { name: 'framework', description: 'Target framework: react or vue (default: react)', required: false },
        { name: 'style', description: 'CSS approach: tailwind, css-modules, styled-components (default: tailwind)', required: false },
      ],
      handler: (args) => [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Generate production-ready ${args.framework || 'React'} components from design pattern ${args.pattern_id}.

Use ${args.style || 'Tailwind CSS'} for styling.
Include TypeScript types.
Follow framework best practices.
Generate one component per detected UI element in the pattern.

Call the generate_code tool with:
- pattern_id: ${args.pattern_id}
- framework: ${args.framework || 'react'}
- style: ${args.style || 'tailwind'}
- typescript: true`,
          },
        },
      ],
    },

    {
      name: 'search-and-compare',
      description: 'Search for design patterns and compare multiple options side by side.',
      arguments: [
        { name: 'query', description: 'What type of design pattern to search for', required: true },
        { name: 'criteria', description: 'Comparison criteria (e.g. "color scheme, layout complexity, component count")', required: false },
      ],
      handler: (args) => [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Search for design patterns matching "${args.query}" and compare the top results.

${args.criteria ? `Compare them based on: ${args.criteria}` : 'Compare them based on: layout type, color palette, component complexity, and quality score.'}

Call the search_patterns tool with the query "${args.query}" and limit 10.
Then present a comparison table of the results highlighting key differences.`,
          },
        },
      ],
    },

    {
      name: 'discover-and-save',
      description: 'Discover new design patterns from the internet and save the best ones to the library.',
      arguments: [
        { name: 'query', description: 'What design pattern to discover', required: true },
        { name: 'sources', description: 'Sources to search: pinterest, dribbble, behance, figma-community (default: all)', required: false },
      ],
      handler: (args) => [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Discover design patterns for "${args.query}" from ${args.sources || 'all sources'} and save the best ones.

Step 1: Call discover_patterns with query "${args.query}" and sources "${args.sources || 'all'}"
Step 2: Review the results and identify the top 3-5 patterns
Step 3: For each selected pattern, call submit_pattern to save it to the library
Step 4: Report what was saved with quality scores`,
          },
        },
      ],
    },

    {
      name: 'audit-pattern-library',
      description: 'Audit the entire pattern library for quality, consistency, and duplicates.',
      arguments: [],
      handler: () => [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Audit the design pattern library for quality and consistency.

Step 1: Call catalog_stats to get an overview
Step 2: Search for patterns with low quality scores (min_quality: 0) and identify patterns below 5/10
Step 3: Look for potential duplicates by searching for similar patterns
Step 4: Report:
  - Total patterns and average quality
  - Patterns that need improvement (score < 5)
  - Potential duplicates
  - Suggestions for library improvement`,
          },
        },
      ],
    },
  ];
}
