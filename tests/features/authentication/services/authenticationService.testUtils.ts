import type { CommandExecutor, CommandResult } from '@/core/shell';
import type { Logger, StepLogger } from '@/core/logging';
import type { AdobeOrg, AdobeProject, AdobeWorkspace } from '@/features/authentication/services/types';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import type { EntityServices } from '@/features/authentication/services/adobeEntityService';

/**
 * Shared test utilities for AuthenticationService tests
 */

// Mock data
export const mockOrg: AdobeOrg = {
    id: 'org123',
    code: 'ORGCODE',
    name: 'Test Organization',
};

export const mockProject: AdobeProject = {
    id: 'proj123',
    name: 'Test Project',
};

export const mockWorkspace: AdobeWorkspace = {
    id: 'ws123',
    name: 'Test Workspace',
};

// Mock factory functions
export const createMockCommandExecutor = (): jest.Mocked<CommandExecutor> => ({
    execute: jest.fn(),
    executeCommand: jest.fn(),
    executeWithNodeVersion: jest.fn(),
    testCommand: jest.fn(),
    getNodeVersionForComponent: jest.fn(),
    getCachedBinaryPath: jest.fn(),
    invalidateBinaryPathCache: jest.fn(),
    getCachedNodeVersion: jest.fn(),
    invalidateNodeVersionCache: jest.fn(),
} as any);

export const createMockLogger = (): jest.Mocked<Logger> => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    trace: jest.fn(),
} as any);

export const createMockStepLogger = (): jest.Mocked<StepLogger> => ({
    logTemplate: jest.fn(),
    logMessage: jest.fn(),
    setCurrentStep: jest.fn(),
    setStepName: jest.fn(),
} as any);

// Command result helpers
export const createSuccessResult = (stdout: string): CommandResult => ({
    code: 0,
    stdout,
    stderr: '',
    duration: 0,
});

export const createFailureResult = (stderr: string): CommandResult => ({
    code: 1,
    stdout: '',
    stderr,
    duration: 0,
});

export const createValidTokenResult = (expiry?: number): CommandResult => {
    const futureExpiry = expiry || Date.now() + 3600000; // 1 hour from now
    return createSuccessResult(JSON.stringify({
        token: 'x'.repeat(150), // Valid token > 100 chars
        expiry: futureExpiry
    }));
};

export const createInvalidTokenResult = (): CommandResult => {
    return createSuccessResult(JSON.stringify({
        token: 'short', // Invalid token < 100 chars
        expiry: Date.now() + 3600000
    }));
};

export const createOrgContextResult = (): CommandResult => {
    return createSuccessResult(JSON.stringify({ org: 'org123', project: 'proj123' }));
};

export const createProjectListResult = (): CommandResult => {
    return createSuccessResult(JSON.stringify([{ id: 'proj1', name: 'Project 1' }]));
};

/**
 * Creates a mock SDK client with default behavior.
 * IMPORTANT: Returns a function to create fresh instances per test to avoid closure issues.
 */
export const createMockSDKClient = (): jest.Mocked<AdobeSDKClient> => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    ensureInitialized: jest.fn().mockResolvedValue(true),
    clear: jest.fn(),
} as any);

/**
 * Creates mock entity services matching the EntityServices shape.
 * Methods are grouped by sub-service (fetcher, resolver, selector).
 */
export const createMockEntityServices = (): {
    entities: EntityServices;
    fetcher: jest.Mocked<EntityServices['fetcher']>;
    resolver: jest.Mocked<EntityServices['resolver']>;
    selector: jest.Mocked<EntityServices['selector']>;
} => {
    const fetcher = {
        getOrganizations: jest.fn().mockResolvedValue([mockOrg]),
        getProjects: jest.fn().mockResolvedValue([mockProject]),
        getWorkspaces: jest.fn().mockResolvedValue([mockWorkspace]),
    } as any;

    const resolver = {
        getCurrentOrganization: jest.fn().mockResolvedValue(mockOrg),
        getCurrentProject: jest.fn().mockResolvedValue(mockProject),
        getCurrentWorkspace: jest.fn().mockResolvedValue(mockWorkspace),
        getCurrentContext: jest.fn().mockResolvedValue({
            org: mockOrg, project: mockProject, workspace: mockWorkspace,
        }),
    } as any;

    const selector = {
        selectOrganization: jest.fn().mockResolvedValue(true),
        selectProject: jest.fn().mockResolvedValue(true),
        selectWorkspace: jest.fn().mockResolvedValue(true),
        autoSelectOrganizationIfNeeded: jest.fn().mockResolvedValue(undefined),
    } as any;

    return {
        entities: { fetcher, resolver, selector },
        fetcher,
        resolver,
        selector,
    };
};
