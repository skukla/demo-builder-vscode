/**
 * Test Helpers for MeshDeployer Tests
 *
 * Shared mocks, factories, and utilities for mesh deployer test suite.
 */

import { Project } from '@/types';
import { CommandExecutor } from '@/core/shell';
import { Logger } from '@/core/logging';

/**
 * Creates a test project with Commerce configuration
 */
export function createMockProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'test-project',
        path: '/test/project',
        status: 'ready',
        created: new Date(),
        lastModified: new Date(),
        commerce: {
            type: 'platform-as-a-service',
            instance: {
                url: 'https://example.magentosite.cloud',
                environmentId: 'env123',
                storeView: 'default',
                websiteCode: 'base',
                storeCode: 'default'
            },
            services: {}
        },
        ...overrides
    };
}

/**
 * Creates a mock CommandExecutor with typed methods
 */
export function createMockCommandExecutor(): jest.Mocked<CommandExecutor> {
    return {
        executeAdobeCLI: jest.fn().mockResolvedValue({
            stdout: 'https://mesh-endpoint.adobe.io/graphql',
            stderr: '',
            code: 0,
            duration: 1000
        }),
    } as unknown as jest.Mocked<CommandExecutor>;
}

/**
 * Creates a real Logger instance for testing (no mocking needed)
 */
export function createTestLogger(): Logger {
    return new Logger('Test');
}

/**
 * Creates a project without Commerce configuration
 */
export function createProjectWithoutCommerce(): Project {
    return {
        name: 'test-project',
        path: '/test/project',
        status: 'ready',
        created: new Date(),
        lastModified: new Date()
    };
}

/**
 * Creates a project with null Commerce configuration
 */
export function createProjectWithNullCommerce(): Project {
    return {
        name: 'test-project',
        path: '/test/project',
        status: 'ready',
        created: new Date(),
        lastModified: new Date(),
        commerce: null as any
    };
}

/**
 * Command execution result types for testing
 */
export interface MockCommandResult {
    stdout: string;
    stderr: string;
    code: number;
    duration: number;
}

/**
 * Creates a successful command result
 */
export function createSuccessResult(stdout: string = 'https://mesh-endpoint.adobe.io/graphql'): MockCommandResult {
    return {
        stdout,
        stderr: '',
        code: 0,
        duration: 1000
    };
}

/**
 * Creates a failed command result
 */
export function createFailureResult(stderr: string = 'Command failed'): MockCommandResult {
    return {
        stdout: '',
        stderr,
        code: 1,
        duration: 100
    };
}
