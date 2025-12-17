/**
 * Shared test utilities for installHandler tests
 *
 * IMPORTANT: Each test file using these utilities must include the following at the top:
 *
 * // Mock all dependencies (must be before imports)
 * jest.mock('@/features/prerequisites/handlers/shared');
 * jest.mock('@/core/di');
 * jest.mock('vscode', () => ({
 *     env: {
 *         openExternal: jest.fn(),
 *     },
 *     Uri: {
 *         parse: jest.fn((url: string) => ({ url })),
 *     },
 * }));
 * jest.mock('@/core/logging/debugLogger', () => ({
 *     getLogger: () => ({
 *         debug: jest.fn(),
 *         trace: jest.fn(),
 *         info: jest.fn(),
 *         warn: jest.fn(),
 *         error: jest.fn(),
 *     }),
 * }));
 */

import { HandlerContext } from '@/commands/handlers/HandlerContext';
import { PrerequisiteDefinition, PrerequisiteStatus } from '@/features/prerequisites/services/types';
import { ServiceLocator } from '@/core/di';

// Mock prerequisite definitions
export const mockNodePrereq: PrerequisiteDefinition = {
    id: 'node',
    name: 'Node.js',
    description: 'JavaScript runtime',
    check: { command: 'node --version' },
    install: {
        steps: [
            { name: 'Install Node {version}', message: 'Installing Node {version}...', command: 'fnm install {version}' },
            { name: 'Set Node {version} as default', message: 'Setting as default...', command: 'fnm default {version}' },
        ],
    },
} as any;

export const mockNpmPrereq: PrerequisiteDefinition = {
    id: 'npm',
    name: 'npm',
    description: 'Package manager',
    check: { command: 'npm --version' },
    install: {
        steps: [
            { name: 'Install npm', message: 'Installing npm...', command: 'npm install -g npm' },
        ],
    },
} as any;

export const mockAdobeCliPrereq: PrerequisiteDefinition = {
    id: 'adobe-cli',
    name: 'Adobe I/O CLI',
    description: 'Adobe I/O command-line tool',
    perNodeVersion: true,
    check: { command: 'aio --version', parseVersion: '@adobe/aio-cli/(\\S+)' },
    install: {
        steps: [
            { name: 'Install Adobe I/O CLI (Node {version})', message: 'Installing Adobe I/O CLI for Node {version}', command: 'npm install -g @adobe/aio-cli' },
        ],
    },
} as any;

export const mockAdobeCliPrereqNoVersion: PrerequisiteDefinition = {
    id: 'adobe-cli',
    name: 'Adobe I/O CLI',
    description: 'Adobe I/O command-line tool',
    perNodeVersion: false,
    check: { command: 'aio --version', parseVersion: '@adobe/aio-cli/(\\S+)' },
    install: {
        steps: [
            { name: 'Install Adobe I/O CLI', message: 'Installing Adobe I/O CLI globally', command: 'npm install -g @adobe/aio-cli' },
        ],
    },
} as any;

export const mockManualPrereq: PrerequisiteDefinition = {
    id: 'docker',
    name: 'Docker',
    description: 'Container platform',
    check: { command: 'docker --version' },
    install: {
        manual: true,
        url: 'https://www.docker.com/get-started',
    },
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
export function createMockContext(overrides?: Partial<HandlerContext>): jest.Mocked<HandlerContext> {
    const states = new Map();
    states.set(0, { prereq: mockNpmPrereq, result: mockNodeResult });

    return {
        prereqManager: {
            loadConfig: jest.fn(),
            getInstallSteps: jest.fn().mockReturnValue({
                steps: [
                    { name: 'Install npm', message: 'Installing npm...', command: 'npm install -g npm' },
                ],
            }),
            checkPrerequisite: jest.fn().mockResolvedValue(mockNodeResult),
            checkMultipleNodeVersions: jest.fn().mockResolvedValue([
                { version: 'Node 18', component: 'v18.0.0', installed: true },
                { version: 'Node 20', component: 'v20.0.0', installed: true },
            ]),
            checkVersionSatisfaction: jest.fn().mockResolvedValue(false), // Default: not satisfied
            getCacheManager: jest.fn().mockReturnValue({
                invalidate: jest.fn(),
                get: jest.fn(),
                set: jest.fn(),
            }),
        } as any,
        sendMessage: jest.fn().mockResolvedValue(undefined),
        logger: {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        } as any,
        debugLogger: {
            debug: jest.fn(),
            trace: jest.fn(),
        } as any,
        stepLogger: {
            log: jest.fn(),
        } as any,
        errorLogger: {
            logError: jest.fn(),
        } as any,
        progressUnifier: {
            executeStep: jest.fn().mockImplementation(async (step, current, total, callback, options) => {
                // Call the progress callback
                await callback?.({ current: current + 1, total, message: step.message });
                // Return void (no return value needed)
            }),
        } as any,
        sharedState: {
            currentPrerequisiteStates: states,
            currentComponentSelection: undefined,
        },
        ...overrides,
    } as jest.Mocked<HandlerContext>;
}
