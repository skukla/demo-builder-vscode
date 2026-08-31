/**
 * Shared test utilities for StalenessDetector tests
 */

import type { Project } from '@/types';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import { createMockProject as createMockProjectBase } from '../../../helpers/projectFake';

// Mock dependencies
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getCommandExecutor: jest.fn(() => ({
            execute: jest.fn(),
        })),
        getAuthenticationService: jest.fn(() => ({
            getTokenStatus: jest.fn().mockResolvedValue({ isAuthenticated: true, expiresInMinutes: 30 }),
        })),
    },
}));

jest.mock('@/core/state', () => ({
    getFrontendEnvVars: jest.fn((config) => ({
        MESH_ENDPOINT: config.MESH_ENDPOINT || '',
        OTHER_VAR: config.OTHER_VAR || '',
    })),
    updateFrontendState: jest.fn(),
}));

jest.mock('fs/promises', () => ({
    readFile: jest.fn(),
    readdir: jest.fn(),
}));

jest.mock('crypto', () => ({
    createHash: jest.fn(),
}));

// Exported constants
export const MOCK_MESH_CONFIG = {
    meshConfig: {
        sources: [
            {
                name: 'magento',
                handler: {
                    graphql: {
                        endpoint: 'https://example.com/graphql',
                    },
                },
            },
            {
                name: 'catalog',
                handler: {
                    graphql: {
                        endpoint: 'https://catalog.example.com',
                        operationHeaders: {
                            'x-api-key': 'test-key',
                        },
                    },
                },
            },
        ],
    },
};

export const MOCK_DEPLOYED_CONFIG = {
    ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
    ADOBE_CATALOG_SERVICE_ENDPOINT: 'https://catalog.example.com',
    ADOBE_CATALOG_API_KEY: 'test-key',
};

// Factory functions
export function createStalenessProject(overrides?: Partial<Project>): Project {
    return createMockProjectBase({
        name: 'Test Project',
        path: '/test',
        created: new Date('2024-01-01T00:00:00Z'),
        lastModified: new Date('2024-01-01T00:00:00Z'),
        status: 'running',
        ...overrides,
    } as never)
}

export function createMockProjectWithMesh(overrides?: Partial<Project>): Project {
    return createStalenessProject({
        componentInstances: {
            'commerce-mesh': {
                id: 'commerce-mesh',
                name: 'API Mesh',
                subType: 'mesh',
                path: '/test/mesh',
                status: 'deployed',
            },
        },
        appBuilderComponents: {
            mesh: {
                kind: 'mesh',
                status: 'deployed',
                source: { owner: '', repo: '' },
                    envVars: {
                        ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                    },
                    sourceHash: 'abc123',
                    lastDeployed: '2024-01-01T00:00:00Z',
                    },
        },
        ...overrides,
    });
}

export function createMockProjectWithFrontend(overrides?: Partial<Project>): Project {
    return createStalenessProject({
        componentInstances: {
            'headless': {
                id: 'headless',
                name: 'Frontend',
                type: 'frontend',
                path: '/test/frontend',
                status: 'running',
            },
        },
        componentConfigs: {
            'headless': {
                MESH_ENDPOINT: 'https://example.com',
                OTHER_VAR: 'value',
            },
        },
        frontendEnvState: {
            envVars: {
                MESH_ENDPOINT: 'https://example.com',
                OTHER_VAR: 'value',
            },
            capturedAt: '2024-01-01T00:00:00Z',
        },
        ...overrides,
    });
}

// Mock setup functions
/**
 * CONVERTED 2026-08-28 (ADR-015): staleness detection receives its
 * collaborators. This ONE object is what every suite hands in; the setup
 * function below swaps the fakes inside it, so the suites' existing setup calls
 * keep working unchanged and no registry mock is involved.
 */
export const meshDeps = {
    commandManager: { execute: jest.fn() },
    authManager: { getTokenStatus: jest.fn(async () => ({ isAuthenticated: true })) },
} as never;

/** The same object, typed for mutation by the setup helper below. */
const mutableDeps = meshDeps as unknown as {
    commandManager: { execute: jest.Mock };
    authManager: { getTokenStatus: jest.Mock };
};

export function setupMockCommandExecutor(
    authResponse: { code: number; stdout: string; stderr?: string },
    meshResponse?: { code: number; stdout: string; stderr?: string } | Error
) {
    const mockCommandManager = {
        execute: jest.fn(),
    };

    // Determine if auth should succeed based on the authResponse code
    // code: 0 = authenticated, code: 1 = not authenticated
    const isAuthenticated = authResponse.code === 0;
    const mockAuthService = {
        getTokenStatus: jest.fn().mockResolvedValue({
            isAuthenticated,
            expiresInMinutes: isAuthenticated ? 30 : -5,
        }),
    };
    mutableDeps.authManager = mockAuthService as never;

    // Only set up command executor mock for mesh response (auth is now handled by authService)
    if (meshResponse) {
        if (meshResponse instanceof Error) {
            mockCommandManager.execute.mockRejectedValueOnce(meshResponse);
        } else {
            mockCommandManager.execute.mockResolvedValueOnce(meshResponse);
        }
    }

    mutableDeps.commandManager = mockCommandManager as never;
    return mockCommandManager;
}

export function setupMockFileSystem(
    fileContent: string = 'content',
    resolverFiles: string[] = [],
    schemaFiles: string[] = [],
    resolverError?: Error,
    schemaError?: Error
) {
    const mockFs = fs as jest.Mocked<typeof fs>;
    const mockCrypto = crypto as jest.Mocked<typeof crypto>;

    (mockFs.readFile as jest.Mock).mockResolvedValue(fileContent);

    if (resolverError) {
        (mockFs.readdir as jest.Mock).mockRejectedValueOnce(resolverError);
    } else {
        (mockFs.readdir as jest.Mock).mockResolvedValueOnce(resolverFiles);
    }

    if (schemaError) {
        (mockFs.readdir as jest.Mock).mockRejectedValueOnce(schemaError);
    } else {
        (mockFs.readdir as jest.Mock).mockResolvedValueOnce(schemaFiles);
    }

    const mockHash = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('abc123'),
    };
    (mockCrypto.createHash as jest.Mock).mockReturnValue(mockHash);

    return { mockFs, mockCrypto, mockHash };
}

export function setupMockFileSystemWithHash(
    hash: string | null,
    fileContent: string = 'content'
) {
    const mockFs = fs as jest.Mocked<typeof fs>;
    const mockCrypto = crypto as jest.Mocked<typeof crypto>;

    (mockFs.readFile as jest.Mock).mockResolvedValue(fileContent);
    (mockFs.readdir as jest.Mock).mockResolvedValue([]);

    const mockHash = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue(hash),
    };
    (mockCrypto.createHash as jest.Mock).mockReturnValue(mockHash);

    return { mockFs, mockCrypto, mockHash };
}
