import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['dist', 'node_modules', 'scripts']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.recommended,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      /**
       * OpenMusic intentionally colocates a component with its hooks and its
       * design constants (`use-player.tsx`, `theme.tsx`, `media.tsx`). Fast
       * Refresh's "only export components" rule would force artificial one-hook
       * per file and hurt readability more than it helps HMR granularity.
       */
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // Tests and throwaway codemods may reach for `any`/`!` freely.
    files: ['src/**/__tests__/**', 'scripts/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
]);