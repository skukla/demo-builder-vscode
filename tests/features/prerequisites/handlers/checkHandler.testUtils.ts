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
 *     hasNodeVersions: jest.fn(),
 *     getNodeVersionKeys: jest.fn(),
 * }));
 *
 * // Mock timeout utilities
 * jest.mock('@/types/typeGuards', () => ({
 *     toError: (error: any) => (error instanceof Error ? error : new Error(String(error))),
 *     isTimeoutError: (error: any) => error?.message?.includes('timeout'),
 * }));
 */

import type { HandlerContext } from '@/types/handlers';
import type {
    PrerequisiteDefinition,
    PrerequisiteStatus,
    PrerequisitesManager,
} from '@/features/prerequisites/services/PrerequisitesManager';
import type { ErrorLogger } from '@/core/logging/errorLogger';
import type { ProgressUnifier } from '@/core/utils/progressUnifier/ProgressUnifier';
import type { StepLogger } from '@/core/logging/stepLogger';
import { createMockHandlerContext as createMockHandlerContextBase } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';

import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';
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
export function createCheckHandlerContext(
    overrides?: Partial<HandlerContext>
): jest.Mocked<HandlerContext> {
    // The manager, error logger, progress unifier and step logger are CLASSES
    // with private members, so no literal can satisfy them; each fake carries
    // only the methods the check handlers call.
    return createMockHandlerContextBase({
        prereqManager: {
            loadConfig: jest.fn(),
            resolveDependencies: jest.fn(),
            checkPrerequisite: jest.fn(),
            checkMultipleNodeVersions: jest.fn(),
            getCacheManager: jest.fn().mockReturnValue({
                getPerVersionResults: jest.fn().mockReturnValue(undefined),
                clearAll: jest.fn(),
            }),
        } as unknown as PrerequisitesManager,
        authManager: createMockAuthenticationService(),
        errorLogger: {} as unknown as ErrorLogger,
        progressUnifier: {} as unknown as ProgressUnifier,
        stepLogger: {
            log: jest.fn(),
        } as unknown as StepLogger,
        logger: createMockLogger(),
        debugLogger: createMockLogger(),
        context: createMockExtensionContext(),
        panel: undefined,
        communicationManager: undefined,
        sendMessage: jest.fn().mockResolvedValue(undefined),
        sharedState: {
            isAuthenticating: false,
            currentPrerequisites: undefined,
            currentPrerequisiteStates: undefined,
            currentComponentSelection: undefined,
        },
        ...overrides,
    });
}

/** Canonical component-selection fixture (ADR-016). */
export { createComponentSelection } from '../../../helpers/componentSelectionFake';

/**
 * Setup standard mock implementations for shared utilities
 */
export function setupStandardMocks() {
    const shared = require('@/features/prerequisites/handlers/shared');
    (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({});
    (shared.areDependenciesInstalled as jest.Mock).mockReturnValue(true);
    // Object utility helpers (used for Object.keys patterns)
    (shared.hasNodeVersions as jest.Mock).mockImplementation((mapping: Record<string, string>) => {
        return mapping && Object.keys(mapping).length > 0;
    });
    (shared.getNodeVersionKeys as jest.Mock).mockImplementation(
        (mapping: Record<string, string>) => {
            return Object.keys(mapping || {}).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
        }
    );
}

/**
 * Cleanup function to be called in afterEach
 */
export function cleanupTests() {
    jest.clearAllMocks();
    jest.restoreAllMocks();
}
