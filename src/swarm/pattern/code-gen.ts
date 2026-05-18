// ============================================================
// Code Generation Agent — LLM-Powered
// ============================================================
//
// Maps interpreted design patterns to framework component code.
// Uses GPT-4o for context-aware generation when API key is available.
// Falls back to template strings when no API key.
// ============================================================

import OpenAI from 'openai';
import {
  type DesignPattern,
  type CodeGenResult,
  type CodeGenRequest,
  type FrameworkHint,
  type ComponentType,
} from '../../types.js';
import { getPattern } from '../../storage/local.js';
import { config, hasOpenAIKey } from '../../config.js';
import { createLogger_Scoped } from '../../logging/index.js';
import { sanitizePromptInjection } from '../../validation/sanitize.js';

const logger = createLogger_Scoped('code-gen');

/** Component templates for React + Tailwind (fallback) */
const REACT_TAILWIND_TEMPLATES: Partial<Record<ComponentType, string>> = {
  'navbar': `
export function Navbar() {
  return (
    <nav className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
      <div className="flex items-center gap-8">
        <span className="text-xl font-bold text-gray-900">Logo</span>
        <div className="hidden md:flex items-center gap-6">
          <a href="#" className="text-sm font-medium text-gray-600 hover:text-gray-900">Home</a>
          <a href="#" className="text-sm font-medium text-gray-600 hover:text-gray-900">Features</a>
          <a href="#" className="text-sm font-medium text-gray-600 hover:text-gray-900">Pricing</a>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <button className="text-sm font-medium text-gray-600 hover:text-gray-900">Sign In</button>
        <button className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">Get Started</button>
      </div>
    </nav>
  );
}
`,

  'card': `
interface CardProps {
  title: string;
  description: string;
  image?: string;
}

export function Card({ title, description, image }: CardProps) {
  return (
    <div className="overflow-hidden bg-white rounded-xl shadow-sm border border-gray-200">
      {image && (
        <img src={image} alt={title} className="w-full h-48 object-cover" />
      )}
      <div className="p-6">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <p className="mt-2 text-sm text-gray-600">{description}</p>
        <button className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-700">
          Learn more →
        </button>
      </div>
    </div>
  );
}
`,

  'sidebar': `
export function Sidebar() {
  const items = [
    { icon: '📊', label: 'Dashboard', active: true },
    { icon: '📁', label: 'Projects' },
    { icon: '👥', label: 'Team' },
    { icon: '📈', label: 'Analytics' },
    { icon: '⚙️', label: 'Settings' },
  ];

  return (
    <aside className="w-64 h-screen bg-white border-r border-gray-200 p-4">
      <div className="mb-8">
        <span className="text-xl font-bold text-gray-900">AppName</span>
      </div>
      <nav className="space-y-1">
        {items.map((item) => (
          <a
            key={item.label}
            href="#"
            className={\`flex items-center gap-3 px-3 py-2 text-sm rounded-lg \${
              item.active
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }\`}
          >
            <span>{item.icon}</span>
            {item.label}
          </a>
        ))}
      </nav>
    </aside>
  );
}
`,

  'button': `
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

const variants = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm',
  secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200',
  outline: 'border border-gray-300 text-gray-700 hover:bg-gray-50',
  ghost: 'text-gray-600 hover:text-gray-900 hover:bg-gray-100',
};

const sizes = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

export function Button({ variant = 'primary', size = 'md', className, children, ...props }: ButtonProps) {
  return (
    <button
      className={\`inline-flex items-center justify-center font-medium rounded-lg transition-colors \${
        variants[variant]
      } \${
        sizes[size]
      } \${className ?? ''}\`}
      {...props}
    >
      {children}
    </button>
  );
}
`,

  'modal': `
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <span className="text-xl">✕</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
`,

  'search-bar': `
interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
}

export function SearchBar({ onSearch, placeholder = 'Search...' }: SearchBarProps) {
  return (
    <div className="relative">
      <input
        type="text"
        placeholder={placeholder}
        onChange={(e) => onSearch(e.target.value)}
        className="w-full px-4 py-2 pl-10 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    </div>
  );
}
`,

  'pricing-card': `
interface PricingCardProps {
  name: string;
  price: string;
  description: string;
  features: string[];
  highlighted?: boolean;
}

export function PricingCard({ name, price, description, features, highlighted }: PricingCardProps) {
  return (
    <div className={\`p-8 rounded-2xl \${
      highlighted
        ? 'bg-blue-600 text-white ring-4 ring-blue-200 scale-105'
        : 'bg-white text-gray-900 border border-gray-200'
    }\`}>
      <h3 className="text-lg font-semibold">{name}</h3>
      <p className={\`mt-2 text-sm \${highlighted ? 'text-blue-100' : 'text-gray-500'}\`}>{description}</p>
      <p className="mt-4">
        <span className="text-4xl font-bold">\${price}</span>
        <span className={\`text-sm \${highlighted ? 'text-blue-100' : 'text-gray-500'}\`}>/month</span>
      </p>
      <ul className="mt-6 space-y-3">
        {features.map((feature) => (
          <li key={feature} className="flex items-center gap-2 text-sm">
            <svg className={\`w-4 h-4 \${highlighted ? 'text-blue-200' : 'text-green-500'}\`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {feature}
          </li>
        ))}
      </ul>
      <button className={\`mt-8 w-full py-3 text-sm font-semibold rounded-xl \${
        highlighted
          ? 'bg-white text-blue-600 hover:bg-blue-50'
          : 'bg-gray-900 text-white hover:bg-gray-800'
      }\`}>
        Get Started
      </button>
    </div>
  );
}
`,
};

/** Vue 3 + Tailwind templates (fallback) */
const VUE_TAILWIND_TEMPLATES: Partial<Record<ComponentType, string>> = {
  'button': `
<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'primary' | 'secondary' | 'outline'
  size?: 'sm' | 'md' | 'lg'
}>(), {
  variant: 'primary',
  size: 'md',
})
</script>

<template>
  <button
    :class="[
      'inline-flex items-center justify-center font-medium rounded-lg transition-colors',
      variant === 'primary' ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm' : '',
      variant === 'secondary' ? 'bg-gray-100 text-gray-900 hover:bg-gray-200' : '',
      variant === 'outline' ? 'border border-gray-300 text-gray-700 hover:bg-gray-50' : '',
      size === 'sm' ? 'px-3 py-1.5 text-xs' : '',
      size === 'md' ? 'px-4 py-2 text-sm' : '',
      size === 'lg' ? 'px-6 py-3 text-base' : '',
    ]"
  >
    <slot />
  </button>
</template>
`,

  'card': `
<script setup lang="ts">
defineProps<{
  title: string
  description: string
  image?: string
}>()
</script>

<template>
  <div class="overflow-hidden bg-white rounded-xl shadow-sm border border-gray-200">
    <img v-if="image" :src="image" :alt="title" class="w-full h-48 object-cover" />
    <div class="p-6">
      <h3 class="text-lg font-semibold text-gray-900">{{ title }}</h3>
      <p class="mt-2 text-sm text-gray-600">{{ description }}</p>
      <button class="mt-4 text-sm font-medium text-blue-600 hover:text-blue-700">
        Learn more →
      </button>
    </div>
  </div>
</template>
`,
};

// ============================================================
// LLM Code Generation
// ============================================================

async function generateCodeLLM(
  pattern: DesignPattern,
  request: CodeGenRequest
): Promise<CodeGenResult['files']> {
  const openai = new OpenAI({
    apiKey: config.openaiApiKey,
    timeout: config.apiTimeoutMs,
  });

  const isReact = request.framework !== 'vue';
  const lang = isReact ? 'React + TypeScript + Tailwind CSS' : 'Vue 3 + TypeScript + Tailwind CSS';
  const ext = isReact ? '.tsx' : '.vue';

  const patternContext = JSON.stringify({
    title: pattern.title,
    description: pattern.description,
    layout: pattern.layout,
    colors: pattern.colors,
    typography: pattern.typography,
    components: pattern.components,
    tags: pattern.tags,
  }, null, 2);

  const componentPromises = pattern.components.map(async (component) => {
    const componentName = capitalize(component);

    const prompt = `Generate a production-ready ${componentName} component in ${lang}.

Design context:
${patternContext}

Requirements:
- Component name: ${componentName}
- Use the detected color palette: primary=${pattern.colors.primary}, accent=${pattern.colors.accent}, background=${pattern.colors.background}, text=${pattern.colors.text}
- Use the detected typography: heading font=${pattern.typography.heading.family}, body font=${pattern.typography.body.family}
- Layout type: ${pattern.layout.type}
- Follow ${lang} best practices
- Include proper TypeScript types
- Use Tailwind CSS classes (no inline styles)
- Export the component as default
- Return ONLY the component code, no markdown fences, no explanations`;

    const response = await openai.chat.completions.create({
      model: config.codeGenModel,
      max_tokens: config.codeGenMaxTokens,
      temperature: config.codeGenTemperature,
      messages: [
        {
          role: 'system',
          content: `You are an expert frontend developer. Generate clean, production-ready ${lang} components. Return only the code, nothing else.`,
        },
        { role: 'user', content: prompt },
      ],
    });

    const code = response.choices[0]?.message?.content?.trim();
    if (!code) throw new Error(`Empty response for ${componentName}`);

    // Sanitize LLM output to prevent prompt injection leakage
    const sanitized = sanitizePromptInjection(code);

    // Strip markdown code fences if present
    const cleaned = sanitized
      .replace(/^```(?:tsx|vue|typescript|javascript)?\s*\n/, '')
      .replace(/\n```$/, '')
      .trim();

    return { path: `components/${componentName}${ext}`, content: cleaned, language: isReact ? 'tsx' : 'vue' };
  });

  const files = await Promise.all(componentPromises);
  return files;
}

// ============================================================
// Public API
// ============================================================

/** Generate component code from a pattern */
export async function generateCode(
  request: CodeGenRequest
): Promise<CodeGenResult> {
  const templates = request.framework === 'vue'
    ? VUE_TAILWIND_TEMPLATES
    : REACT_TAILWIND_TEMPLATES;

  const files: CodeGenResult['files'] = [];

  const pattern = await getPattern(request.patternId);

  if (!pattern) {
    // Fallback: generate card component
    const fallbackTemplate = templates.card;
    if (fallbackTemplate) {
      const ext = request.framework === 'vue' ? '.vue' : '.tsx';
      files.push({
        path: `components/Card${ext}`,
        content: fallbackTemplate.trimStart(),
        language: request.framework === 'vue' ? 'vue' : 'tsx',
      });
    }

    return {
      patternId: request.patternId,
      framework: request.framework,
      files,
      preview: generatePreview(['card'], request),
    };
  }

  // Try LLM generation if API key available
  if (hasOpenAIKey && pattern.components.length > 0) {
    try {
      logger.info({ patternId: pattern.id, components: pattern.components.length }, 'Generating code via LLM');
      const llmFiles = await generateCodeLLM(pattern, request);

      for (const llmFile of llmFiles) {
        if (request.options?.includeTests) {
          const componentName = llmFile.path.split('/').pop()?.replace(/\.(tsx|vue)$/, '') ?? 'Component';
          files.push({
            path: `__tests__/${componentName}.test.${request.framework === 'vue' ? 'ts' : 'tsx'}`,
            content: generateTest(componentName.toLowerCase() as ComponentType, request.framework),
            language: 'typescript',
          });
        }

        files.push(llmFile);
      }

      return {
        patternId: request.patternId,
        framework: request.framework,
        files,
        preview: generatePreview(pattern.components, request),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn({ error: message }, 'LLM code generation failed, falling back to templates');
    }
  }

  // Fallback: template-based generation
  const componentsToGenerate: ComponentType[] = pattern.components
    ? pattern.components.filter((c): c is ComponentType => c in templates)
    : [];

  if (componentsToGenerate.length === 0 && templates.card) {
    componentsToGenerate.push('card');
  }

  for (const component of componentsToGenerate) {
    const template = templates[component] as string | undefined;
    if (!template) continue;

    const ext = request.framework === 'vue' ? '.vue' : '.tsx';
    const filename = `components/${capitalize(component)}${ext}`;

    if (request.options?.includeTests) {
      files.push({
        path: `__tests__/${capitalize(component)}.test.${request.framework === 'vue' ? 'ts' : 'tsx'}`,
        content: generateTest(component, request.framework),
        language: 'typescript',
      });
    }

    files.push({
      path: filename,
      content: template.trimStart(),
      language: request.framework === 'vue' ? 'vue' : 'tsx',
    });
  }

  const preview = generatePreview(componentsToGenerate, request);

  return {
    patternId: request.patternId,
    framework: request.framework,
    files,
    preview,
  };
}

function capitalize(s: string): string {
  return s.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('');
}

function generateTest(component: ComponentType, framework: FrameworkHint): string {
  const name = capitalize(component);
  if (framework === 'vue') {
    return `import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ${name} from '../components/${name}.vue'

describe('${name}', () => {
  it('renders correctly', () => {
    const wrapper = mount(${name}, {
      props: { title: 'Test', description: 'Test description' }
    })
    expect(wrapper.text()).toContain('Test')
  })
})
`;
  }

  return `import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ${name} } from '../components/${name}'

describe('${name}', () => {
  it('renders correctly', () => {
    render(<${name} title="Test" description="Test description" />)
    expect(screen.getByText('Test')).toBeDefined()
  })
})
`;
}

function generatePreview(components: ComponentType[], request: CodeGenRequest): string {
  return `
<!-- Design Pattern Multiverse — Generated Preview -->
<!-- Framework: ${request.framework} | Style: ${request.style} -->
<!-- Components: ${components.join(', ')} -->

<div style="font-family: system-ui, sans-serif; padding: 2rem; background: #f8fafc; min-height: 100vh;">
  <h1 style="font-size: 1.5rem; font-weight: 600; margin-bottom: 1rem; color: #0f172a;">
    Pattern Preview — ${request.patternId}
  </h1>
  <p style="color: #64748b; margin-bottom: 2rem;">
    Generated ${components.length} component${components.length !== 1 ? 's' : ''}:
    ${components.join(', ')}
  </p>
  <div style="display: flex; flex-direction: column; gap: 1.5rem;">
    ${components.map(c => `
    <div style="background: white; border-radius: 0.75rem; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <h3 style="font-size: 0.875rem; font-weight: 500; color: #64748b; margin-bottom: 1rem; text-transform: uppercase; letter-spacing: 0.05em;">
        ${c}
      </h3>
      <div class="component-preview component-${c}">
        <!-- ${capitalize(c)} component renders here -->
      </div>
    </div>
    `).join('\n    ')}
  </div>
</div>
`;
}
