/**
 * Shared setup for the continueHandler suites.
 *
 * THIS FILE OWNS THE MOCKS AND EVERY IMPORT THEY REPLACE. Specs import those
 * from HERE and declare no jest.mock of their own — jest.mock hoists above the
 * imports of the module it appears in, NOT across modules, so an import left
 * behind in a spec loads the real module before these mocks register.
 *
 * Extracted 2026-08-30 (lane C1) from byte-identical copies in:
 *   continueHandler-edge-cases.test.ts
 *   continueHandler-errors.test.ts
 *   continueHandler-operations.test.ts
 */

// Mock dependencies - but keep handlePrerequisiteCheckError real
jest.mock('@/features/prerequisites/handlers/shared', () => {
    const actual = jest.requireActual('@/features/prerequisites/handlers/shared');
    return {
        ...actual,
        getNodeVersionMapping: jest.fn(),
        areDependenciesInstalled: jest.fn(),
        hasNodeVersions: jest.fn(),
        getNodeVersionKeys: jest.fn(),
        // Keep handlePrerequisiteCheckError as the real implementation
    };
});
jest.mock('@/core/di/serviceLocator');

export * as shared from '@/features/prerequisites/handlers/shared';
export { ServiceLocator } from '@/core/di/serviceLocator';

import { HandlerContext } from '@/types/handlers';
import { PrerequisiteDefinition, PrerequisiteStatus } from '@/features/prerequisites/services/types';
import { createMockHandlerContext as createMockHandlerContextBase } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';

// Mock prerequisite definitions
export const mockNodePrereq: PrerequisiteDefinition = {
    id: 'node',
    name: 'Node.js',
    description: 'JavaScript runtime',
    check: { command: 'node --version' },
} as any;

export const mockNpmPrereq: PrerequisiteDefinition = {
    id: 'npm',
    name: 'npm',
    description: 'Package manager',
    depends: ['node'],
    check: { command: 'npm --version' },
} as any;

export const mockAdobeCliPrereq: PrerequisiteDefinition = {
    id: 'adobe-cli',
    name: 'Adobe I/O CLI',
    description: 'Adobe I/O command-line tool',
    perNodeVersion: true,
    check: { command: 'aio --version', parseVersion: '@adobe/aio-cli/(\\S+)' },
} as any;

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

// Helper to create mock HandlerContext
// CRITICAL: Return a function, not the object directly, to avoid closure issues
export function createContinueHandlerContext(overrides?: Partial<HandlerContext>): jest.Mocked<HandlerContext> {
    const states = new Map();
    states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
    states.set(1, { prereq: mockNpmPrereq, result: mockNpmResult });

    return createMockHandlerContextBase({
        prereqManager: {
            checkPrerequisite: jest.fn().mockResolvedValue(mockNodeResult),
            checkMultipleNodeVersions: jest.fn().mockResolvedValue([
                { version: 'Node 18', component: 'v18.0.0', installed: true },
                { version: 'Node 20', component: 'v20.0.0', installed: true },
            ]),
        } as any,
        sendMessage: jest.fn().mockResolvedValue(undefined),
        logger: createMockLogger() as any,
        debugLogger: {
            debug: jest.fn(),
        } as any,
        stepLogger: {
            log: jest.fn(),
        } as any,
        sharedState: {
            currentPrerequisites: [mockNodePrereq, mockNpmPrereq],
            currentPrerequisiteStates: states,
        },
        ...overrides,
    } as never)
}
