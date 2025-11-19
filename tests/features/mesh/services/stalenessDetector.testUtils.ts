/**
 * Shared test utilities for StalenessDetector tests
 */

import type { Project } from '@/types';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';

// Mock dependencies
jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getCommandExecutor: jest.fn(() => ({
            execute: jest.fn(),
        })),
    },
}));

jest.mock('@/core/logging', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
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
export function createMockProject(overrides?: Partial<Project>): Project {
    return {
        name: 'Test Project',
        path: '/test',
        created: new Date('2024-01-01T00:00:00Z'),
        lastModified: new Date('2024-01-01T00:00:00Z'),
        status: 'running',
        ...overrides,
    };
}

export function createMockProjectWithMesh(overrides?: Partial<Project>): Project {
    return createMockProject({
        componentInstances: {
            'commerce-mesh': {
                id: 'commerce-mesh',
                name: 'API Mesh',
                path: '/test/mesh',
                status: 'deployed',
            },
        },
        meshState: {
            envVars: {
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
            },
            sourceHash: 'abc123',
            lastDeployed: '2024-01-01T00:00:00Z',
        },
        ...overrides,
    });
}

export function createMockProjectWithFrontend(overrides?: Partial<Project>): Project {
    return createMockProject({
        componentInstances: {
            'citisignal-nextjs': {
                id: 'citisignal-nextjs',
                name: 'Frontend',
                path: '/test/frontend',
                status: 'running',
            },
        },
        componentConfigs: {
            'citisignal-nextjs': {
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
export function setupMockCommandExecutor(
    authResponse: { code: number; stdout: string; stderr?: string },
    meshResponse?: { code: number; stdout: string; stderr?: string } | Error
) {
    const { ServiceLocator } = require('@/core/di');
    const mockCommandManager = {
        execute: jest.fn(),
    };

    if (meshResponse) {
        if (meshResponse instanceof Error) {
            mockCommandManager.execute
                .mockResolvedValueOnce(authResponse)
                .mockRejectedValueOnce(meshResponse);
        } else {
            mockCommandManager.execute
                .mockResolvedValueOnce(authResponse)
                .mockResolvedValueOnce(meshResponse);
        }
    } else {
        mockCommandManager.execute.mockResolvedValueOnce(authResponse);
    }

    ServiceLocator.getCommandExecutor.mockReturnValue(mockCommandManager);
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
        (mockFs.readdir as jest.Mock).mockResolvedValueOnce(resolverFiles as any);
    }

    if (schemaError) {
        (mockFs.readdir as jest.Mock).mockRejectedValueOnce(schemaError);
    } else {
        (mockFs.readdir as jest.Mock).mockResolvedValueOnce(schemaFiles as any);
    }

    const mockHash = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('abc123'),
    };
    (mockCrypto.createHash as jest.Mock).mockReturnValue(mockHash as any);

    return { mockFs, mockCrypto, mockHash };
}

export function setupMockFileSystemWithHash(
    hash: string | null,
    fileContent: string = 'content'
) {
    const mockFs = fs as jest.Mocked<typeof fs>;
    const mockCrypto = crypto as jest.Mocked<typeof crypto>;

    (mockFs.readFile as jest.Mock).mockResolvedValue(fileContent);
    (mockFs.readdir as jest.Mock).mockResolvedValue([] as any);

    const mockHash = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue(hash),
    };
    (mockCrypto.createHash as jest.Mock).mockReturnValue(mockHash as any);

    return { mockFs, mockCrypto, mockHash };
}
