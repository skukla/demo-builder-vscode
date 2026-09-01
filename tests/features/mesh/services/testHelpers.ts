/**
 * Test Helpers for MeshDeployer Tests
 *
 * Shared mocks, factories, and utilities for mesh deployer test suite.
 */

import { Project } from '@/types/base';
import type { Logger } from '@/types/logger';
import { createMockProject as createMockProjectBase } from '../../../helpers/projectFake';
import { createMockLogger } from '../../../helpers/loggerFake';

/**
 * Creates a test project with Commerce configuration
 */
export function createMeshProject(overrides: Partial<Project> = {}): Project {
    return createMockProjectBase({
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
    })
}

/** Canonical command-executor fake (ADR-016). */
export { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';

/**
 * Creates a real Logger instance for testing (no mocking needed)
 */
export function createTestLogger(): Logger {
    return createMockLogger();
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
