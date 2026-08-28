/**
 * Test Helpers for MeshDeployer Tests
 *
 * Shared mocks, factories, and utilities for mesh deployer test suite.
 */

import { Project } from '@/types';
import { CommandExecutor } from '@/core/shell';
import type { Logger } from '@/types/logger';

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
                storeCode: 'default',
            },
        },
        ...overrides,
    };
}

/**
 * Creates a mock CommandExecutor with typed methods
 */
export function createMockCommandExecutor(): jest.Mocked<CommandExecutor> {
    return {
        execute: jest.fn().mockResolvedValue({
            stdout: 'https://mesh-endpoint.adobe.io/graphql',
            stderr: '',
            code: 0,
            duration: 1000,
        }),
    } as unknown as jest.Mocked<CommandExecutor>;
}

/**
 * Creates a real Logger instance for testing (no mocking needed)
 */
export function createTestLogger(): Logger {
    return {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        trace: jest.fn(),
    };
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
        lastModified: new Date(),
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
        commerce: null as any,
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

/** Canonical command result (ADR-016). */
export { createSuccessResult } from '../../../helpers/commandResultFake';

/** Canonical command result (ADR-016). */
export { createFailureResult } from '../../../helpers/commandResultFake';
