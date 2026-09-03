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
import {
    PrerequisiteDefinition,
    PrerequisiteStatus,
} from '@/features/prerequisites/services/types';
import { createMockHandlerContext as createMockHandlerContextBase } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';

// Mock prerequisite definitions
export const mockNodePrereq: PrerequisiteDefinition = {
    id: 'node',
    name: 'Node.js',
    description: 'JavaScript runtime',
    check: { command: 'node --version' },
};

export const mockNpmPrereq: PrerequisiteDefinition = {
    id: 'npm',
    name: 'npm',
    description: 'Package manager',
    depends: ['node'],
    check: { command: 'npm --version' },
};

export const mockAdobeCliPrereq: PrerequisiteDefinition = {
    id: 'adobe-cli',
    name: 'Adobe I/O CLI',
    description: 'Adobe I/O command-line tool',
    perNodeVersion: true,
    check: { command: 'aio --version', parseVersion: '@adobe/aio-cli/(\\S+)' },
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

// Helper to create mock HandlerContext
// CRITICAL: Return a function, not the object directly, to avoid closure issues
export function createContinueHandlerContext(
    overrides?: Partial<HandlerContext>
): jest.Mocked<HandlerContext> {
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
        },
        sendMessage: jest.fn().mockResolvedValue(undefined),
        logger: createMockLogger(),
        debugLogger: createMockLogger(),
        stepLogger: {
            log: jest.fn(),
        },
        sharedState: {
            currentPrerequisites: [mockNodePrereq, mockNpmPrereq],
            currentPrerequisiteStates: states,
        },
        ...overrides,
    } as never);
}

import * as shared from '@/features/prerequisites/handlers/shared';
import { ServiceLocator } from '@/core/di/serviceLocator';

export interface ContinueHandlerHarness {
    mockContext: ReturnType<typeof createContinueHandlerContext>;
    mockCommandExecutor: { execute: jest.Mock };
}

/**
 * The collaborators two continueHandler suites set up identically.
 *
 * The two `mockImplementation`s are the real behaviour, not stubs: `hasNodeVersions`
 * answers whether the mapping has any keys, and `getNodeVersionKeys` returns them
 * NUMERICALLY sorted — text order would put Node 8 after Node 20, which is the
 * defect the handler's own sort exists to prevent.
 *
 * The edge-cases suite is deliberately not a caller: it drives a different node
 * mapping per test, so a shared default would be overwritten in every one.
 */
export function setupContinueHandler(): ContinueHandlerHarness {
    const mockCommandExecutor = {
        execute: jest.fn().mockResolvedValue({ stdout: '@adobe/aio-cli/10.0.0' }),
    };
    (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue(mockCommandExecutor);

    (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({
        '18': 'React App',
        '20': 'Node Backend',
    });
    (shared.areDependenciesInstalled as jest.Mock).mockReturnValue(true);
    (shared.hasNodeVersions as jest.Mock).mockImplementation(
        (mapping: Record<string, string>) => Boolean(mapping) && Object.keys(mapping).length > 0
    );
    (shared.getNodeVersionKeys as jest.Mock).mockImplementation((mapping: Record<string, string>) =>
        Object.keys(mapping || {}).sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
    );

    return { mockContext: createContinueHandlerContext(), mockCommandExecutor };
}
