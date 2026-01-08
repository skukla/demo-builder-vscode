module.exports = {
  roots: ['<rootDir>/tests'],

  // Performance optimizations
  // Note: Heap size configured via package.json test script (--max-old-space-size=4096)
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache',
  maxWorkers: '50%',

  // Memory management - recycle workers when they exceed 512MB
  // Critical for preventing memory crashes during large test runs
  workerIdleMemoryLimit: '512MB',

  // Separate test environments for Node and React tests
  projects: [
    {
      displayName: 'node',
      testEnvironment: 'node',
      testMatch: [
        '**/tests/**/*.test.ts',
        '!**/tests/webview-ui/**/*.test.ts',
        '!**/tests/webview-ui/**/*.test.tsx'
      ],
      transform: {
        '^.+\\.ts$': ['@swc/jest', {
          jsc: {
            parser: {
              syntax: 'typescript',
              tsx: false,
              decorators: true,
            },
            target: 'es2021',
            keepClassNames: true,
          },
          module: {
            type: 'commonjs',
          },
          sourceMaps: true,
        }],
      },
      moduleFileExtensions: ['ts', 'js', 'json'],
      moduleNameMapper: {
        '^@/commands/(.*)$': '<rootDir>/src/commands/$1',
        '^@/core/(.*)$': '<rootDir>/src/core/$1',
        '^@/features/(.*)$': '<rootDir>/src/features/$1',
        '^@/shared/(.*)$': '<rootDir>/src/shared/$1',
        '^@/services/(.*)$': '<rootDir>/src/services/$1',
        '^@/types/(.*)$': '<rootDir>/src/types/$1',
        '^@/providers/(.*)$': '<rootDir>/src/providers/$1',
        '^@/utils/(.*)$': '<rootDir>/src/utils/$1',
        '^vscode$': '<rootDir>/tests/__mocks__/vscode.ts',
        '^uuid$': '<rootDir>/tests/__mocks__/uuid.ts',
        '^@octokit/core$': '<rootDir>/tests/__mocks__/@octokit/core.ts',
        '^@octokit/plugin-retry$': '<rootDir>/tests/__mocks__/@octokit/plugin-retry.ts',
      },
      // Transform ESM-only packages (Octokit, etc.)
      transformIgnorePatterns: [
        'node_modules/(?!(@octokit|universal-user-agent|before-after-hook)/)',
      ],
      setupFilesAfterEnv: ['<rootDir>/tests/setup/node.ts'],
    },
    {
      displayName: 'react',
      testEnvironment: 'jsdom',
      testMatch: [
        '**/tests/webview-ui/**/*.test.ts',
        '**/tests/webview-ui/**/*.test.tsx',
        '**/tests/features/**/*.test.tsx',
        '**/tests/core/ui/**/*.test.tsx',
        '**/src/features/**/*.test.tsx'
      ],
      transform: {
        '^.+\\.(ts|tsx)$': ['@swc/jest', {
          jsc: {
            parser: {
              syntax: 'typescript',
              tsx: true,
              decorators: true,
            },
            transform: {
              react: {
                runtime: 'automatic',
              },
            },
            target: 'es2021',
            keepClassNames: true,
          },
          module: {
            type: 'commonjs',
          },
          sourceMaps: true,
        }],
      },
      setupFilesAfterEnv: ['<rootDir>/tests/setup/react.ts'],
      moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
      moduleNameMapper: {
        '^@/core/(.*)$': '<rootDir>/src/core/$1',
        '^@/features/(.*)$': '<rootDir>/src/features/$1',
        '^@/shared/(.*)$': '<rootDir>/src/shared/$1',
        '^@/services/(.*)$': '<rootDir>/src/services/$1',
        '^@/types/(.*)$': '<rootDir>/src/types/$1',
        '^@/providers/(.*)$': '<rootDir>/src/providers/$1',
        '^@/utils/(.*)$': '<rootDir>/src/utils/$1',
        '\\.(css|less|scss|sass)$': '<rootDir>/tests/__mocks__/styleMock.js',
        '^vscode$': '<rootDir>/tests/__mocks__/vscode.ts',
        '^uuid$': '<rootDir>/tests/__mocks__/uuid.ts',
        '^@octokit/core$': '<rootDir>/tests/__mocks__/@octokit/core.ts',
        '^@octokit/plugin-retry$': '<rootDir>/tests/__mocks__/@octokit/plugin-retry.ts',
      },
    }
  ],

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/extension.ts',
    // Now include webviews in coverage
    'src/webviews/**/*.{ts,tsx}',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },

  testTimeout: 10000,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,

  // Global teardown to clean up any remaining handles
  globalTeardown: '<rootDir>/tests/setup/globalTeardown.ts',
};
