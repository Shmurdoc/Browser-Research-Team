// ============================================================
// Vitest Configuration
// ============================================================

import { defineConfig } from 'vitest/config';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',
        'src/types.ts',
        '**/*.d.ts',
        '**/index.ts',
      ],
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60,
      all: true,
    },

    include: ['tests/**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist'],
    globals: true,
    reporters: ['default'],
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});