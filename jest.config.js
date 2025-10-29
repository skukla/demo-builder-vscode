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
        '!**/tests/webviews/**/*.test.ts',
        '!**/tests/webviews/**/*.test.tsx'
      ],
      transform: {
        '^.+\\.ts$': 'ts-jest',
      },
      moduleFileExtensions: ['ts', 'js', 'json'],
      moduleNameMapper: {
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
      globals: {
        'ts-jest': {
          tsconfig: {
            esModuleInterop: true,
            allowSyntheticDefaultImports: true,
          },
        },
      },
    },
    {
      displayName: 'react',
      testEnvironment: 'jsdom',
      testMatch: ['**/tests/webviews/**/*.test.ts', '**/tests/webviews/**/*.test.tsx'],
      transform: {
        '^.+\\.(ts|tsx)$': ['ts-jest', {
          tsconfig: {
            jsx: 'react',
            esModuleInterop: true,
            allowSyntheticDefaultImports: true,
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
        '^@/(.*)$': '<rootDir>/src/webviews/$1',
        '\\.(css|less|scss|sass)$': '<rootDir>/tests/__mocks__/styleMock.js',
        '^vscode$': '<rootDir>/tests/__mocks__/vscode.ts',
        '^uuid$': '<rootDir>/tests/__mocks__/uuid.ts',
      },
      globals: {
        'ts-jest': {
          tsconfig: {
            jsx: 'react',
            esModuleInterop: true,
            allowSyntheticDefaultImports: true,
          },
        },
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
