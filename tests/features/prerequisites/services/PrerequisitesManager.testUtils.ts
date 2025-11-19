/**
 * Shared test utilities for PrerequisitesManager tests
 */

// Mock debugLogger FIRST to prevent "Logger not initialized" errors
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

// Mock the ConfigurationLoader
jest.mock('@/core/config/ConfigurationLoader');
jest.mock('@/core/di');

// Mock fs module for components.json reading
jest.mock('fs', () => ({
    readFileSync: jest.fn().mockReturnValue(JSON.stringify({
        infrastructure: {
            'adobe-cli': {
                name: 'Adobe I/O CLI & SDK',
                description: 'Command-line interface and SDK for Adobe I/O services'
            }
        }
    }))
}));

import { Logger } from '@/core/logging';
import type { CommandExecutor } from '@/core/shell';
import { ServiceLocator } from '@/core/di';

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

    const mockLogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    } as any;

    const mockExecutor = {
        execute: jest.fn(),
    } as any;

    // Mock ServiceLocator
    (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue(mockExecutor);

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
export function createPerNodePrerequisite(overrides?: any) {
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
export function createStandardPrerequisite(overrides?: any) {
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
export function createDynamicInstallPrerequisite(overrides?: any) {
    return {
        id: 'node',
        name: 'Node.js',
        description: 'JavaScript runtime',
        check: {
            command: 'node',
            args: ['--version'],
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
