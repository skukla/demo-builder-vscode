import type { PrerequisiteStatus } from '@/features/prerequisites/services/types';

/**
 * Shared test utilities for PrerequisitesCacheManager tests
 */

/**
 * Creates a complete mock PrerequisiteStatus object with sensible defaults
 */
export const createMockStatus = (
    overrides: Partial<PrerequisiteStatus> = {},
): PrerequisiteStatus => ({
    id: 'test-prereq',
    name: 'Test Prerequisite',
    description: 'Test description',
    installed: true,
    optional: false,
    canInstall: true,
    version: '1.0.0',
    ...overrides,
});

/**
 * Setup mock for Date.now() with controllable time
 */
export const setupMockTime = (initialTime = 1000000): {
    advance: (ms: number) => void;
    restore: () => void;
    currentTime: () => number;
} => {
    let mockTime = initialTime;
    const spy = jest.spyOn(Date, 'now').mockImplementation(() => mockTime);

    return {
        advance: (ms: number) => {
            mockTime += ms;
        },
        restore: () => {
            spy.mockRestore();
        },
        currentTime: () => mockTime,
    };
};

/**
 * Setup mock for Math.random() with consistent value
 */
export const setupMockRandom = (value = 0.5): { restore: () => void } => {
    const originalRandom = Math.random;
    Math.random = jest.fn(() => value);

    return {
        restore: () => {
            Math.random = originalRandom;
        },
    };
};

/**
 * Common mock configurations for dependencies
 */
export const mockDependencies = () => {
    jest.mock('@/core/logging/debugLogger', () => ({
        getLogger: jest.fn(() => ({
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        })),
    }));

    jest.mock('@/core/utils/timeoutConfig', () => ({
        CACHE_TTL: {
            MEDIUM: 300000, // 5 minutes - semantic category (replaces PREREQUISITE_CHECK)
        },
    }));
};
