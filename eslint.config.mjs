import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import importPlugin from 'eslint-plugin-import';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended, // Basic TS rules, not type-checked
    prettierConfig,
    {
        files: ['src/**/*.ts', 'src/**/*.tsx'],
        languageOptions: {
            parserOptions: {
                ecmaVersion: 2022,
                sourceType: 'module',
                ecmaFeatures: {
                    jsx: true,
                },
            },
        },
        settings: {
            react: {
                version: 'detect',
            },
        },
        plugins: {
            react,
            'react-hooks': reactHooks,
            'jsx-a11y': jsxA11y,
            'import': importPlugin,
        },
        rules: {
            // TypeScript rules (basic, not type-checked)
            '@typescript-eslint/no-explicit-any': 'warn', // Warn only - Phase 05 already handled this
            '@typescript-eslint/no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
            }],
            '@typescript-eslint/no-non-null-assertion': 'warn',

            // Core quality rules (genuinely prevent bugs)
            'no-console': ['warn', { allow: ['warn', 'error'] }],
            'no-debugger': 'error',
            'no-alert': 'error',
            'no-var': 'error',
            'prefer-const': 'error',
            'no-duplicate-imports': 'error',
            'eqeqeq': ['error', 'always', { null: 'ignore' }], // === instead of ==
            'no-eval': 'error',
            'no-implied-eval': 'error',
            'no-return-await': 'warn',

            // Reasonable complexity limits (not draconian)
            'complexity': ['warn', 25], // Raised from 15
            'max-depth': ['warn', 5], // Raised from 4
            'max-nested-callbacks': ['warn', 4], // Raised from 3

            // Style consistency (Prettier handles most, these are logic-based)
            'comma-dangle': ['error', 'always-multiline'],
            'object-curly-spacing': ['error', 'always'],
            'array-bracket-spacing': ['error', 'never'],

            // React rules (for .tsx files)
            'react/jsx-uses-react': 'off', // Not needed in React 17+
            'react/react-in-jsx-scope': 'off', // Not needed in React 17+
            'react/prop-types': 'off', // Using TypeScript
            'react/jsx-no-target-blank': 'error',
            'react/jsx-key': 'error',
            'react/no-children-prop': 'error',
            'react/no-danger': 'warn',
            'react/no-deprecated': 'error',
            'react/self-closing-comp': 'warn',

            // React Hooks rules
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',

            // Accessibility rules
            'jsx-a11y/alt-text': 'error',
            'jsx-a11y/aria-props': 'error',
            'jsx-a11y/aria-role': 'error',
            'jsx-a11y/role-supports-aria-props': 'error',
            'jsx-a11y/click-events-have-key-events': 'warn',
            'jsx-a11y/no-static-element-interactions': 'warn',

            // Import ordering
            'import/order': ['warn', {
                'groups': [
                    'builtin',
                    'external',
                    'internal',
                    'parent',
                    'sibling',
                    'index',
                ],
                'newlines-between': 'never',
                'alphabetize': { order: 'asc', caseInsensitive: true },
            }],
            'import/no-duplicates': 'error',
            'import/newline-after-import': 'warn',

            // Path alias enforcement (hybrid pattern)
            // Block cross-boundary relative imports, allow within-directory imports
            'no-restricted-imports': ['error', {
                'patterns': [
                    {
                        'group': [
                            '../core/*',
                            '../features/*',
                            '../commands/*',
                            '../types/*',
                            '../utils/*',
                            '../webviews/*',
                            '../../core/*',
                            '../../features/*',
                            '../../commands/*',
                            '../../types/*',
                            '../../utils/*',
                            '../../webviews/*',
                            '../../../core/*',
                            '../../../features/*',
                            '../../../commands/*',
                            '../../../types/*',
                        ],
                        'message': 'Use path aliases (@/core/*, @/features/*, etc.) for cross-boundary imports. Within-directory imports (./) are allowed.',
                    },
                ],
            }],
        },
    },
    {
        files: ['webview-ui/**/*.ts', 'webview-ui/**/*.tsx'],
        plugins: {
            react,
            'react-hooks': reactHooks,
            'import': importPlugin,
        },
        rules: {
            // Path alias enforcement for webview-ui (hybrid pattern)
            'no-restricted-imports': ['error', {
                'patterns': [
                    {
                        'group': [
                            '../shared/*',
                            '../configure/*',
                            '../dashboard/*',
                            '../welcome/*',
                            '../wizard/*',
                            '../../shared/*',
                            '../../configure/*',
                            '../../dashboard/*',
                            '../../welcome/*',
                            '../../wizard/*',
                            '../../../shared/*',
                        ],
                        'message': 'Use path aliases (@/shared/*, @/configure/*, etc.) for cross-boundary imports in webview-ui. Within-directory imports (./) are allowed.',
                    },
                ],
            }],
        },
    },
    {
        files: ['tests/**/*.ts', 'tests/**/*.tsx'],
        rules: {
            // Relax rules for tests
            '@typescript-eslint/no-explicit-any': 'off',
            'no-console': 'off',
            'max-nested-callbacks': 'off',
        },
    },
    {
        ignores: [
            'dist/**',
            'node_modules/**',
            'scripts/**/*.js',
            'out/**',
            '*.config.mjs',
            'coverage/**',
            'webpack.config.js',
        ],
    }
);
