/**
 * Shared test utilities for PrerequisitesManager tests
 */

// Mock debugLogger FIRST to prevent "Logger not initialized" errors

// Mock the ConfigurationLoader
jest.mock('@/core/config/ConfigurationLoader');

// Mock fs module for components.json reading
jest.mock('fs', () => ({
    readFileSync: jest.fn().mockReturnValue(
        JSON.stringify({
            infrastructure: {
                'adobe-cli': {
                    name: 'Adobe I/O CLI & SDK',
                    description: 'Command-line interface and SDK for Adobe I/O services',
                },
            },
        })
    ),
}));

import type { Logger } from '@/types/logger';
import type { CommandExecutor } from '@/core/shell';
import type { PrerequisiteDefinition } from '@/features/prerequisites/services/types';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';

export interface TestMocks {
    logger: jest.Mocked<Logger>;
    executor: jest.Mocked<CommandExecutor>;
}

export const mockConfig = {
    prerequisites: [
        {
            id: 'node',
            name: 'Node.js',
            description: 'JavaScript runtime',
            check: {
                command: 'node',
                args: ['--version'],
            },
            optional: false,
        },
        {
            id: 'npm',
            name: 'npm',
            description: 'Package manager',
            check: {
                command: 'npm',
                args: ['--version'],
            },
            optional: false,
            dependencies: ['node'],
        },
        {
            id: 'git',
            name: 'Git',
            description: 'Version control',
            check: {
                command: 'git',
                args: ['--version'],
            },
            optional: true,
        },
    ],
    componentRequirements: {
        'react-app': {
            prerequisites: ['node', 'npm'],
        },
        'commerce-paas': {
            prerequisites: ['node', 'npm', 'git'],
        },
    },
};

/**
 * Creates mock logger and executor for tests
 */
export function setupMocks(): TestMocks {
    jest.clearAllMocks();

    const mockLogger = createMockLogger();

    const mockExecutor = createMockCommandExecutor();

    // CONVERTED 2026-08-28 (ADR-015): the executor is a constructor argument
    // now — suites pass `mocks.executor` in. No registry mock at all.
    return {
        logger: mockLogger,
        executor: mockExecutor,
    };
}

/**
 * Sets up ConfigurationLoader mock
 */
export function setupConfigLoader(config = mockConfig) {
    const { ConfigurationLoader } = require('@/core/config/ConfigurationLoader');
    ConfigurationLoader.mockImplementation(() => ({
        load: jest.fn().mockResolvedValue(config),
    }));
}

/**
 * Creates a prerequisite with perNodeVersion flag
 */
export function createPerNodePrerequisite(
    overrides?: Partial<PrerequisiteDefinition>
): PrerequisiteDefinition {
    return {
        id: 'aio-cli',
        name: 'Adobe I/O CLI',
        description: 'Adobe I/O CLI',
        perNodeVersion: true,
        check: {
            command: 'aio --version',
            parseVersion: '@adobe/aio-cli/([0-9.]+)',
        },
        ...overrides,
    };
}

/**
 * Creates a standard prerequisite
 */
export function createStandardPrerequisite(
    overrides?: Partial<PrerequisiteDefinition>
): PrerequisiteDefinition {
    return {
        id: 'git',
        name: 'Git',
        description: 'Version control',
        check: {
            command: 'git --version',
            parseVersion: 'git version ([0-9.]+)',
        },
        ...overrides,
    };
}

/**
 * Creates a prerequisite with dynamic installation
 */
export function createDynamicInstallPrerequisite(
    overrides?: Partial<PrerequisiteDefinition>
): PrerequisiteDefinition {
    return {
        id: 'node',
        name: 'Node.js',
        description: 'JavaScript runtime',
        check: {
            // `args: ['--version']` sat here until 2026-08-28. `PrerequisiteCheck`
            // has no such field, production never reads `check.args`, and it
            // appears zero times in prerequisites.json — an invented field that
            // nothing could see while this builder was untyped.
            command: 'node --version',
        },
        install: {
            dynamic: true,
            steps: [
                {
                    name: 'Install Node.js {version}',
                    message: 'Installing Node.js {version}',
                    commandTemplate: 'fnm install {version}',
                    progressStrategy: 'exact' as const,
                    estimatedDuration: 30000,
                },
            ],
        },
        ...overrides,
    };
}
