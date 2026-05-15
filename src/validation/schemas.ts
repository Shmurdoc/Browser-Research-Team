// ============================================================
// Input Validation Schemas with Zod
// ============================================================

import { z } from 'zod';
import { type PatternQuery, type PatternSubmission, type CodeGenRequest } from '../types.js';

/**
 * Pattern Query validation schema
 */
export const PatternQuerySchema = z.object({
  text: z.string().optional().refine(
    (val) => !val || val.length >= 2,
    { message: 'Search text must be at least 2 characters' }
  ),
  source: z.union([
    z.enum(['pinterest', 'dribbble', 'behance', 'figma-community', 'web', 'manual', 'api']),
    z.array(z.enum(['pinterest', 'dribbble', 'behance', 'figma-community', 'web', 'manual', 'api'])),
  ]).optional(),
  layoutType: z.enum([
    'dashboard', 'landing-page', 'hero-section', 'navbar', 'sidebar', 'card-grid', 'modal', 'form',
    'table', 'list', 'settings', 'profile', 'pricing', 'footer', 'header', 'blog-post',
    'ecommerce', 'authentication', 'onboarding', 'unknown',
  ]).optional(),
  components: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  framework: z.enum(['react', 'vue', 'svelte', 'angular', 'vanilla', 'unknown']).optional(),
  minQuality: z.number().min(0).max(10).optional(),
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
});

export type ValidPatternQuery = z.infer<typeof PatternQuerySchema>;

/**
 * Pattern Submission validation schema
 */
export const SubmitPatternSchema = z.object({
  source: z.enum(['pinterest', 'dribbble', 'behance', 'figma-community', 'web', 'manual', 'api']),
  url: z.string().url('Must be a valid URL'),
  title: z.string().optional().refine(
    (val) => !val || val.length <= 200,
    { message: 'Title must be at most 200 characters' }
  ),
  imageUrl: z.string().url('Must be a valid URL').optional(),
  description: z.string().optional().refine(
    (val) => !val || val.length <= 1000,
    { message: 'Description must be at most 1000 characters' }
  ),
  tags: z.array(z.string()).optional(),
});

export type ValidPatternSubmission = z.infer<typeof SubmitPatternSchema>;

/**
 * Code Generation Request validation schema
 */
export const CodeGenRequestSchema = z.object({
  patternId: z.string().min(1),
  framework: z.enum(['react', 'vue', 'svelte', 'angular', 'vanilla', 'unknown']),
  style: z.enum(['tailwind', 'css-modules', 'styled-components', 'vanilla-css']),
  options: z.object({
    typescript: z.boolean().optional(),
    includeTests: z.boolean().optional(),
    includeStories: z.boolean().optional(),
  }).optional(),
});

export type ValidCodeGenRequest = z.infer<typeof CodeGenRequestSchema>;

/**
 * Rating/Feedback validation schema
 */
export const FeedbackSchema = z.object({
  patternId: z.string().min(1),
  rating: z.number().min(1).max(5),
  tags: z.array(z.string()).optional(),
  comment: z.string().max(500).optional(),
  userId: z.string().optional(),
});

export type ValidFeedback = z.infer<typeof FeedbackSchema>;
