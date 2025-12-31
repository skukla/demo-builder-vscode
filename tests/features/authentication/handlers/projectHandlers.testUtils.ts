/**
 * Shared Test Utilities for Project Handlers
 *
 * Common mocks, factories, and helpers used across project handler tests.
 */

import { HandlerContext } from '@/commands/handlers/HandlerContext';

// Mock dependencies setup
export const setupMocks = () => {
    jest.mock('@/core/di/serviceLocator');
    jest.mock('@/core/validation');
    jest.mock('@/types/typeGuards', () => ({
        toError: jest.fn((error: any) => error instanceof Error ? error : new Error(String(error))),
        parseJSON: jest.fn((str: string) => JSON.parse(str))
    }));
    jest.mock('@/core/utils/timeoutConfig', () => ({
        TIMEOUTS: {
            NORMAL: 30000 // Standard API calls (replaces PROJECT_LIST, WORKSPACE_LIST)
        }
    }));
    jest.mock('@/core/utils/promiseUtils', () => ({
        withTimeout: jest.fn((promise) => promise)
    }));
};

/**
 * Creates a mock authentication manager with all required methods
 */
export const createMockAuthManager = () => ({
    getCurrentOrganization: jest.fn(),
    getCurrentProject: jest.fn(),
    getProjects: jest.fn(),
    selectProject: jest.fn()
});

/**
 * Creates a mock command executor
 */
export const createMockCommandExecutor = () => ({
    execute: jest.fn()
});

/**
 * Creates a mock handler context with all required dependencies
 *
 * IMPORTANT: This returns a FUNCTION, not an object.
 * Call it to get a fresh mock context: const mockContext = createMockContext();
 */
export const createMockContext = () => {
    const mockAuthManager = createMockAuthManager();

    return {
        authManager: mockAuthManager,
        logger: {
            trace: jest.fn(),
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn()
        } as any,
        debugLogger: {
            trace: jest.fn(),
            debug: jest.fn()
        } as any,
        sendMessage: jest.fn().mockResolvedValue(undefined),
        sharedState: {
            isAuthenticating: false
        }
    } as any;
};

/**
 * Sample project data for testing
 */
export const mockProjects = [
    { id: 'proj-1', name: 'Project 1', title: 'Project 1' },
    { id: 'proj-2', name: 'Project 2', title: 'Project 2' }
];

/**
 * Sample organization data for testing
 */
export const mockOrganization = {
    id: 'org-123',
    name: 'Test Org'
};
