/**
 * Shared test utilities for checkHandler tests
 *
 * IMPORTANT: Each test file using these utilities must include the following at the top:
 *
 * // Mock shared utilities
 * jest.mock('@/features/prerequisites/handlers/shared', () => ({
 *     getNodeVersionMapping: jest.fn(),
 *     checkPerNodeVersionStatus: jest.fn(),
 *     areDependenciesInstalled: jest.fn(),
 * }));
 *
 * // Mock timeout utilities
 * jest.mock('@/types/typeGuards', () => ({
 *     toError: (error: any) => (error instanceof Error ? error : new Error(String(error))),
 *     isTimeoutError: (error: any) => error?.message?.includes('timeout'),
 * }));
 */

import type { HandlerContext } from '@/types/handlers';
import type { PrerequisiteDefinition, PrerequisiteStatus } from '@/features/prerequisites/services/PrerequisitesManager';

// Test data
export const mockConfig = {
    version: '1.0',
    prerequisites: [
        {
            id: 'node',
            name: 'Node.js',
            description: 'JavaScript runtime',
            check: { command: 'node --version' },
        } as PrerequisiteDefinition,
        {
            id: 'npm',
            name: 'npm',
            description: 'Package manager',
            depends: ['node'],
            check: { command: 'npm --version' },
        } as PrerequisiteDefinition,
    ],
};

export const mockNodeResult: PrerequisiteStatus = {
    id: 'node',
    name: 'Node.js',
    description: 'JavaScript runtime',
    installed: true,
    version: 'v18.0.0',
    optional: false,
    canInstall: false,
};

export const mockNpmResult: PrerequisiteStatus = {
    id: 'npm',
    name: 'npm',
    description: 'Package manager',
    installed: true,
    version: '9.0.0',
    optional: false,
    canInstall: false,
};

export const mockAdobeCliPrereq: PrerequisiteDefinition = {
    id: 'adobe-cli',
    name: 'Adobe I/O CLI',
    perNodeVersion: true,
    check: { command: 'aio --version' },
} as PrerequisiteDefinition;

/**
 * Helper to create mock HandlerContext
 */
export function createMockContext(overrides?: Partial<HandlerContext>): jest.Mocked<HandlerContext> {
    return {
        prereqManager: {
            loadConfig: jest.fn(),
            resolveDependencies: jest.fn(),
            checkPrerequisite: jest.fn(),
            checkMultipleNodeVersions: jest.fn(),
            getCacheManager: jest.fn().mockReturnValue({
                getPerVersionResults: jest.fn().mockReturnValue(undefined),
                clearAll: jest.fn(),
            }),
        } as any,
        authManager: {} as any,
        componentHandler: {} as any,
        errorLogger: {} as any,
        progressUnifier: {} as any,
        stepLogger: {
            log: jest.fn(),
        } as any,
        logger: {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as any,
        debugLogger: {
            debug: jest.fn(),
        } as any,
        context: {} as any,
        panel: undefined,
        stateManager: {} as any,
        communicationManager: undefined,
        sendMessage: jest.fn().mockResolvedValue(undefined),
        sharedState: {
            isAuthenticating: false,
            currentPrerequisites: undefined,
            currentPrerequisiteStates: undefined,
            currentComponentSelection: undefined,
        },
        ...overrides,
    } as jest.Mocked<HandlerContext>;
}

/**
 * Helper to create component selection for multi-version tests
 */
export function createComponentSelection(backend: string, appBuilder: string[] = []) {
    return {
        frontend: 'react-app',
        backend,
        dependencies: [],
        integrations: [],
        appBuilder,
    };
}

/**
 * Setup standard mock implementations for shared utilities
 */
export function setupStandardMocks() {
    const shared = require('@/features/prerequisites/handlers/shared');
    (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({});
    (shared.areDependenciesInstalled as jest.Mock).mockReturnValue(true);
}

/**
 * Cleanup function to be called in afterEach
 */
export function cleanupTests() {
    jest.clearAllMocks();
    jest.restoreAllMocks();
}
