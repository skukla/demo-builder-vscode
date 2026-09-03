module.exports = {
  roots: ['<rootDir>/tests'],

  // Performance optimizations
  // Note: Heap size configured via package.json test script (--max-old-space-size=4096)
  //
  // `cache` / `cacheDirectory` are NOT set here. Like `roots` and `testPathIgnorePatterns`
  // below, they do not propagate into `projects` — set at this level they are inert, and
  // were: `.jest-cache/` has been in .gitignore since the day it was configured and the
  // directory has never existed. Jest silently used its default cache under $TMPDIR
  // instead, which is shared with every other checkout on the machine. Both projects now
  // declare it themselves; verified by the directory actually appearing after a run.
  //
  // 25% was set in 87db88e7 alongside the fix for OOM kills (exit 137). That commit's
  // actual cure was replacing real setTimeout delays with fake timers; the worker cut
  // was belt-and-braces on top. With the remaining real-timer sleeps now routed through
  // core/utils/sleep and mocked in the suites that hit them, the pressure is lower again.
  // Measured on 16 cores: 25% = 35s @ 1.8GB, 75% = 18s @ 4.0GB. On CI (ubuntu-latest,
  // 4 cores / 16GB) 75% is 3 workers, ~1.2GB — cores bind there, never memory.
  maxWorkers: '75%',

  // Memory management - recycle workers when they exceed 256MB
  // Reduced from 512MB to prevent OOM issues during large test runs.
  // KEEP AT 256MB. Raising it back to 512MB measured only 1.7s faster but took peak
  // RSS from 4.0GB to 6.8GB — reintroducing the exact exposure 87db88e7 closed, for
  // a rounding error. The worker count above is the safe lever; this one is not.
  workerIdleMemoryLimit: '256MB',

  // Separate test environments for Node and React tests
  projects: [
    {
      displayName: 'node',
      testEnvironment: 'node',
      cache: true,
      cacheDirectory: '<rootDir>/.jest-cache/node',
      testMatch: [
        '**/tests/**/*.test.ts',
        // The whole `tests/core/ui` subtree is React: components, hooks and the
        // utilities they call. It runs under the react project below, which owns
        // jsdom and the fake-timer contract. Until 2026-09-02 the shared half of
        // it lived in `tests/webview-ui/` and was excluded here by that name; the
        // suites moved to their subjects' mirror, so the exclusion follows the
        // subject instead of the old tree.
        '!**/tests/core/ui/**/*.test.ts',
        '!**/tests/core/ui/**/*.test.tsx',
        // A feature's React HOOK suites are `.test.ts`, not `.test.tsx`, so the
        // extension rule above would hand them to node. Until 2026-09-03 each carried
        // a `@jest-environment jsdom` docblock instead — eighteen of them — which
        // works for jest and silently defeats Stryker: a per-file environment
        // bypasses the coverage hook, and every mutation run on those modules failed.
        // The environment is decided HERE, once, and a docblock is now an enforcer
        // failure (`tests/sop/no-jest-environment-docblocks.test.ts`).
        '!**/tests/features/**/ui/**/use*.test.ts'
      ],
      // `roots` (top-level) does not propagate into `projects`, so Jest would
      // otherwise crawl the whole repo — including agent worktrees under
      // `.claude/worktrees/`, which carry stale duplicate copies of every test.
      // Ignore them so runs are deterministic regardless of in-flight worktrees.
      testPathIgnorePatterns: [
          '/node_modules/',
          '<rootDir>/.claude/worktrees/',
          '<rootDir>/.stryker-tmp',
      ],
      modulePathIgnorePatterns: [
          '<rootDir>/.claude/worktrees/',
          '<rootDir>/.stryker-tmp',
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
        '^.+\\.md(\\.template)?$': '<rootDir>/tests/transformers/mdTransformer.js',
      },
      moduleFileExtensions: ['ts', 'js', 'json', 'md'],
      moduleNameMapper: {
        '^@/commands/(.*)$': '<rootDir>/src/commands/$1',
        '^@/core/(.*)$': '<rootDir>/src/core/$1',
        '^@/features/(.*)$': '<rootDir>/src/features/$1',
        '^@/mcp-server$': '<rootDir>/src/mcp-server',
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
      cache: true,
      cacheDirectory: '<rootDir>/.jest-cache/react',
      testMatch: [
        '**/tests/features/**/*.test.tsx',
        '**/tests/core/ui/**/*.test.ts',
        '**/tests/core/ui/**/*.test.tsx',
        // See the node project's matching exclusion for why hook suites are named here.
        '**/tests/features/**/ui/**/use*.test.ts',
        '**/src/features/**/*.test.tsx'
      ],
      // See node project: ignore agent worktrees so their stale duplicate test
      // copies don't run against the live source via the `@/` aliases.
      testPathIgnorePatterns: [
          '/node_modules/',
          '<rootDir>/.claude/worktrees/',
          '<rootDir>/.stryker-tmp',
      ],
      modulePathIgnorePatterns: [
          '<rootDir>/.claude/worktrees/',
          '<rootDir>/.stryker-tmp',
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
        // Path aliases
        '^@/core/(.*)$': '<rootDir>/src/core/$1',
        '^@/features/(.*)$': '<rootDir>/src/features/$1',
        '^@/shared/(.*)$': '<rootDir>/src/shared/$1',
        '^@/services/(.*)$': '<rootDir>/src/services/$1',
        '^@/types/(.*)$': '<rootDir>/src/types/$1',
        '^@/providers/(.*)$': '<rootDir>/src/providers/$1',
        '^@/utils/(.*)$': '<rootDir>/src/utils/$1',
        // Style mocks
        '\\.(css|less|scss|sass)$': '<rootDir>/tests/__mocks__/styleMock.js',
        // Adobe Spectrum mocks - prevents loading ~6MB library
        '^@adobe/react-spectrum$': '<rootDir>/tests/__mocks__/@adobe/react-spectrum.tsx',
        '^@spectrum-icons/workflow/(.*)$': '<rootDir>/tests/__mocks__/@spectrum-icons/workflow.tsx',
        '^@spectrum-icons/(.*)$': '<rootDir>/tests/__mocks__/@spectrum-icons/workflow.tsx',
        // Other mocks
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

  // Global setup/teardown. Unlike `cache` and `roots` above, these DO apply to a
  // multi-project run — jest runs them once for the whole run, not per project.
  // globalSetup stamps a per-run id that keeps concurrent runs' MCP sockets apart;
  // globalTeardown removes that run's tree and sweeps dead ones.
  globalSetup: '<rootDir>/tests/setup/globalSetup.ts',
  globalTeardown: '<rootDir>/tests/setup/globalTeardown.ts',
};
