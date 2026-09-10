/**
 * Shared test utilities for installHandler tests.
 *
 * The wall of `jest.mock` calls these suites need lives in
 * `./installHandler.mocks` — import that FIRST in a spec and the mocks are
 * registered. This docblock used to say "each test file using these utilities
 * must include the following at the top" and then list the wall, which is an
 * instruction to duplicate; five suites duly carried it verbatim until
 * 2026-09-02.
 *
 * Two suites deliberately differ and do NOT import that module:
 * `installHandler-byId` mocks nothing, and `installHandler-plugins` declares its
 * own set.
 */

import { HandlerContext, PrerequisiteCheckState } from '@/types/handlers';
import type { PrerequisiteStatusPayload } from '@/types/webviewPayloads';
import { PrerequisiteDefinition, PrerequisiteStatus } from '@/features/prerequisites/services/types';
import type { PrerequisitesManager } from '@/features/prerequisites/services/PrerequisitesManager';
import type { ErrorLogger } from '@/core/logging/errorLogger';
import type { ProgressUnifier } from '@/core/utils/progressUnifier/ProgressUnifier';
import type { StepLogger } from '@/core/logging/stepLogger';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { createMockHandlerContext as createMockHandlerContextBase } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';

import { createMockDebugLogger } from '../../../helpers/debugLoggerFake';
// Mock prerequisite definitions
export const mockNodePrereq: PrerequisiteDefinition = {
    id: 'node',
    name: 'Node.js',
    description: 'JavaScript runtime',
    check: { command: 'node --version' },
    install: {
        steps: [
            { name: 'Install Node {version}', message: 'Installing Node {version}...', commands: ['fnm install {version}'] },
            { name: 'Set Node {version} as default', message: 'Setting as default...', commands: ['fnm default {version}'] },
        ],
    },
};

export const mockNpmPrereq: PrerequisiteDefinition = {
    id: 'npm',
    name: 'npm',
    description: 'Package manager',
    check: { command: 'npm --version' },
    install: {
        steps: [
            { name: 'Install npm', message: 'Installing npm...', commands: ['npm install -g npm'] },
        ],
    },
};

export const mockAdobeCliPrereq: PrerequisiteDefinition = {
    id: 'adobe-cli',
    name: 'Adobe I/O CLI',
    description: 'Adobe I/O command-line tool',
    perNodeVersion: true,
    check: { command: 'aio --version', parseVersion: '@adobe/aio-cli/(\\S+)' },
    install: {
        steps: [
            { name: 'Install Adobe I/O CLI (Node {version})', message: 'Installing Adobe I/O CLI for Node {version}', commands: ['npm install -g @adobe/aio-cli'] },
        ],
    },
};

export const mockAdobeCliPrereqNoVersion: PrerequisiteDefinition = {
    id: 'adobe-cli',
    name: 'Adobe I/O CLI',
    description: 'Adobe I/O command-line tool',
    perNodeVersion: false,
    check: { command: 'aio --version', parseVersion: '@adobe/aio-cli/(\\S+)' },
    install: {
        steps: [
            { name: 'Install Adobe I/O CLI', message: 'Installing Adobe I/O CLI globally', commands: ['npm install -g @adobe/aio-cli'] },
        ],
    },
};

export const mockManualPrereq: PrerequisiteDefinition = {
    id: 'docker',
    name: 'Docker',
    description: 'Container platform',
    check: { command: 'docker --version' },
    install: {
        manual: true,
        url: 'https://www.docker.com/get-started',
    },
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

/**
 * Setup mock CommandExecutor with smart responses based on command
 */
export function setupMockCommandExecutor() {
    const mockExecute = jest.fn().mockImplementation((command: string) => {
        if (command === 'fnm list') {
            // Return installed Node versions
            return Promise.resolve({
                stdout: 'v18.20.8\nv20.19.5\n',
                stderr: '',
                code: 0,
                duration: 100,
            });
        }
        if (command.includes('aio') || command === 'aio --version') {
            // Return Adobe CLI version
            return Promise.resolve({
                stdout: '@adobe/aio-cli/10.0.0',
                stderr: '',
                code: 0,
                duration: 100,
            });
        }
        if (command.includes('node') || command === 'node --version') {
            // Return Node version
            return Promise.resolve({
                stdout: 'v18.20.8',
                stderr: '',
                code: 0,
                duration: 100,
            });
        }
        if (command.includes('npm') || command === 'npm --version') {
            // Return npm version
            return Promise.resolve({
                stdout: '9.0.0',
                stderr: '',
                code: 0,
                duration: 100,
            });
        }
        // Default for installation commands and other operations
        return Promise.resolve({
            stdout: 'Success',
            stderr: '',
            code: 0,
            duration: 100,
        });
    });

    (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue({
        execute: mockExecute,
    });

    return mockExecute;
}

/**
 * Setup mock implementations for shared utilities
 */
export function setupSharedUtilityMocks() {
    const shared = require('@/features/prerequisites/handlers/shared');
    (shared.getRequiredNodeVersions as jest.Mock).mockResolvedValue(['18', '20']);
    (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({
        '18': 'React App',
        '20': 'Node Backend',
    });
    (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValue({
        perNodeVersionStatus: [
            { version: 'Node 18', component: '10.0.0', installed: true },
            { version: 'Node 20', component: '10.0.0', installed: true },
        ],
        perNodeVariantMissing: false,
        missingVariantMajors: [],
    });
    // Object utility helpers (used for Object.keys patterns)
    (shared.hasNodeVersions as jest.Mock).mockImplementation((mapping: Record<string, string>) => {
        return mapping && Object.keys(mapping).length > 0;
    });
    (shared.getNodeVersionKeys as jest.Mock).mockImplementation((mapping: Record<string, string>) => {
        return Object.keys(mapping || {}).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    });
}

/**
 * Helper to create mock HandlerContext
 */
export function createInstallHandlerContext(overrides?: Partial<HandlerContext>): jest.Mocked<HandlerContext> {
    const states = new Map<number, PrerequisiteCheckState>();
    states.set(0, { prereq: mockNpmPrereq, result: mockNodeResult });

    // The manager, step logger, error logger and progress unifier are CLASSES
    // with private members, so no literal can satisfy them; each fake carries
    // only the methods the install handlers call.
    return createMockHandlerContextBase({
        prereqManager: {
            /**
             * The FULL manager surface. Four methods were missing until 2026-09-02 —
             * `resolveDependencies`, `getPrerequisiteById`, `getRequiredPrerequisites`
             * and `checkAllPrerequisites` — and the first one's absence is WHY the
             * `prerequisiteId` install path had no test: reaching it throws
             * "Cannot read properties of undefined" before the handler runs.
             *
             * A fake smaller than its subject does not fail; it makes a branch
             * UNTESTABLE, and the branch then looks merely uncovered. The cast
             * at the end of this object is what let it drift — the class has
             * private members, so the literal cannot be checked against it, and
             * a missing method is a TypeError three layers into a handler rather
             * than a compile error.
             */
            resolveDependencies: jest.fn().mockReturnValue([]),
            getPrerequisiteById: jest.fn(),
            getRequiredPrerequisites: jest.fn().mockReturnValue([]),
            checkAllPrerequisites: jest.fn().mockResolvedValue([]),
            getLatestInFamily: jest.fn(),
            loadConfig: jest.fn(),
            getInstallSteps: jest.fn().mockReturnValue({
                steps: [
                    { name: 'Install npm', message: 'Installing npm...', commands: ['npm install -g npm'] },
                ],
            }),
            checkPrerequisite: jest.fn().mockResolvedValue(mockNodeResult),
            checkMultipleNodeVersions: jest.fn().mockResolvedValue([
                { version: 'Node 18', component: 'v18.0.0', installed: true },
                { version: 'Node 20', component: 'v20.0.0', installed: true },
            ]),
            checkVersionSatisfaction: jest.fn().mockResolvedValue(false), // Default: not satisfied
            // Default: no install commands, so the plugin loop skips. Tests that
            // exercise plugin installation override this.
            getPluginInstallCommands: jest.fn().mockResolvedValue(undefined),
            getCacheManager: jest.fn().mockReturnValue({
                invalidate: jest.fn(),
                get: jest.fn(),
                set: jest.fn(),
            }),
        } as unknown as PrerequisitesManager,
        sendMessage: jest.fn().mockResolvedValue(undefined),
        logger: createMockLogger(),
        debugLogger: createMockDebugLogger(),
        stepLogger: {
            log: jest.fn(),
        } as unknown as StepLogger,
        errorLogger: {
            logError: jest.fn(),
        } as unknown as ErrorLogger,
        progressUnifier: {
            executeStep: jest.fn().mockImplementation(async (step, current, total, callback, _options) => {
                // Call the progress callback
                await callback?.({ current: current + 1, total, message: step.message });
                // Return void (no return value needed)
            }),
        } as unknown as ProgressUnifier,
        sharedState: {
            isAuthenticating: false,
            currentPrerequisiteStates: states,
            currentComponentSelection: undefined,
        },
        ...overrides,
    });
}

/**
 * The `invalidate` mock the context's cache manager hands out.
 *
 * `getCacheManager` is a `mockReturnValue`, so it yields the SAME object every
 * call and this is a stable reference across the whole handler run.
 *
 * It exists as a helper rather than a cast at each call site because reaching it
 * needs one, and one cast with a reason beats five without. The reason: the mock
 * is cast to the real manager class above, so its jest shape is not visible to
 * the compiler here.
 *
 * WHY ANY TEST NEEDS IT. Mutation testing found `invalidateCaches` deletable in
 * full with every suite still green — nothing asserted the call. The cache manager
 * itself is well tested, but always by calling `invalidate` DIRECTLY, which proves
 * the cache works and says nothing about whether the install path uses it. A stale
 * cache after an install is a user-visible wrong version.
 */
export function cacheInvalidateMock(context: HandlerContext): jest.Mock {
    const manager = context.prereqManager!.getCacheManager() as unknown as {
        invalidate: jest.Mock;
    };
    return manager.invalidate;
}

/**
 * The LAST `prerequisite-status` payload the handler pushed.
 *
 * This is the handler's answer: the webview renders the row from it, so every
 * decision `sendFinalInstallStatus` makes — installed or not, which per-version
 * status list to attach, whether Install stays offered — is readable here and
 * nowhere else.
 *
 * Returns `undefined` when no status was sent, which is itself a real outcome:
 * an early return sends `prerequisite-install-complete` instead.
 */
export function lastFinalStatus(context: HandlerContext): PrerequisiteStatusPayload | undefined {
    const calls = (context.sendMessage as jest.Mock).mock.calls.filter(
        ([type]: [string]) => type === 'prerequisite-status'
    );
    return calls.at(-1)?.[1] as PrerequisiteStatusPayload | undefined;
}

/**
 * A prerequisite that carries a plugin, shaped from the REAL config entry.
 *
 * Copied from `aio-cli` in `src/features/prerequisites/config/prerequisites.json`
 * rather than written from memory — including the detail that matters most for the
 * tests: the shipped `api-mesh` plugin declares NO `requiredFor`, so production
 * takes the "no specific version mapping, use targetVersions[0]" branch. A fixture
 * that invented `requiredFor` would have tested a path nothing uses.
 *
 * Why it exists at all: no installHandler fixture defined `plugins`, so
 * `installPlugins` always hit its `if (!prereq.plugins) return` guard and 89
 * mutants below it were unreachable — the single largest block of untested code in
 * the file, and it is the path that installs the API Mesh CLI plugin.
 */
export const mockAioCliWithPlugin: PrerequisiteDefinition = {
    ...mockAdobeCliPrereq,
    perNodeVersion: true,
    plugins: [
        {
            id: 'api-mesh',
            name: 'API Mesh Plugin',
            description: 'Adobe API Mesh management plugin',
        },
    ],
} as PrerequisiteDefinition;

/**
 * Arrange the per-Node Adobe I/O CLI install: the prerequisite state and the
 * one install step whose name carries a `{version}` placeholder.
 *
 * Twelve tests across four suites in this family opened with these nine lines,
 * byte-identical (counted 2026-09-02). None of them is testing the arrangement
 * — they vary what `checkPerNodeVersionStatus` answers next, and assert on how
 * many steps ran.
 *
 * @param context - the handler context to arrange, mutated in place
 */
export function arrangePerNodeAdobeCliInstall(context: jest.Mocked<HandlerContext>): void {
    const states = new Map();
    states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
    context.sharedState.currentPrerequisiteStates = states;
    (context.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
        steps: [
            {
                name: 'Install Adobe I/O CLI (Node {version})',
                message: 'Installing Adobe I/O CLI for Node {version}',
                command: 'npm install -g @adobe/aio-cli',
            },
        ],
    });
}
