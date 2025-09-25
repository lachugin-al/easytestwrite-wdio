import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
import mochaPlugin from 'eslint-plugin-mocha';
import promisePlugin from 'eslint-plugin-promise';

export default [
  // Ignore patterns (similar to .eslintignore)
  {
    ignores: [
      'node_modules/**',
      '.pnpm-store/**',
      'dist/**',
      'build/**',
      'coverage/**',
      'allure-results/**',
      'allure-report/**',
    ],
  },

  // Main ESLint configuration
  {
    files: ['**/*.{ts,js}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
      globals: {
        // WebdriverIO globals
        $: 'readonly',
        $$: 'readonly',
        browser: 'readonly',
        driver: 'readonly',
        expect: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      import: importPlugin,
      promise: promisePlugin,
      mocha: mochaPlugin,
    },
    settings: {
      'import/resolver': {
        typescript: true,
        node: { extensions: ['.ts', '.js', '.json'] },
      },
    },
    rules: {
      // Basic hygiene
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',

      // Import order & grouping
      'import/order': [
        'warn',
        {
          'newlines-between': 'always',
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
            'object',
            'type',
          ],
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],

      // Promises & Mocha
      'promise/no-nesting': 'warn',
      'mocha/no-exclusive-tests': 'error', // fail on .only in tests
    },
  },

  // Config files (allow CommonJS-style requires)
  {
    files: ['**/*.conf.ts', '**/*.config.ts', 'wdio*.ts'],
    rules: {
      '@typescript-eslint/no-var-requires': 'off',
    },
  },

  // Test files: allow console logs for debugging
  {
    files: ['tests/**/*.{ts,js}'],
    rules: { 'no-console': 'off' },
  },
];
