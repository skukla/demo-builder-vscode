module.exports = {
  preset: 'ts-jest',
  roots: ['<rootDir>/tests'],

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
        '^.+\\.ts$': ['ts-jest', {
          tsconfig: {
            esModuleInterop: true,
            allowSyntheticDefaultImports: true,
          },
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
      },
    },
    {
      displayName: 'react',
      testEnvironment: 'jsdom',
      testMatch: [
        '**/tests/webview-ui/**/*.test.ts',
        '**/tests/webview-ui/**/*.test.tsx'
      ],
      transform: {
        '^.+\\.(ts|tsx)$': ['ts-jest', {
          tsconfig: {
            jsx: 'react',
            esModuleInterop: true,
            allowSyntheticDefaultImports: true,
            types: ['@testing-library/jest-dom', 'jest', 'node'],
          },
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
        '^@/webview-ui/(.*)$': '<rootDir>/webview-ui/src/$1',
        '^@/(.*)$': '<rootDir>/src/webviews/$1',
        '\\.(css|less|scss|sass)$': '<rootDir>/tests/__mocks__/styleMock.js',
        '^vscode$': '<rootDir>/tests/__mocks__/vscode.ts',
        '^uuid$': '<rootDir>/tests/__mocks__/uuid.ts',
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
};
