import {
    getMeshEnvVars,
    fetchDeployedMeshConfig,
    calculateMeshSourceHash,
    getCurrentMeshState,
    detectMeshChanges,
    updateMeshState,
    detectFrontendChanges,
} from '@/features/mesh/services/stalenessDetector';
import type { Project } from '@/types';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';

/**
 * StalenessDetector Test Suite
 *
 * Tests mesh change detection and configuration comparison:
 * - Environment variable extraction
 * - Deployed mesh config fetching
 * - Source file hashing
 * - Mesh state management
 * - Change detection (env vars + source files)
 * - Frontend change detection
 *
 * Total tests: 25
 */

// Mock dependencies
jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getCommandExecutor: jest.fn(() => ({
            executeAdobeCLI: jest.fn(),
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

describe('StalenessDetector', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getMeshEnvVars', () => {
        it('should extract mesh-related env vars from config', () => {
            const config = {
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                ADOBE_CATALOG_SERVICE_ENDPOINT: 'https://catalog.example.com',
                ADOBE_CATALOG_API_KEY: 'test-key',
                UNRELATED_VAR: 'should-not-appear',
            };

            const result = getMeshEnvVars(config);

            expect(result).toEqual({
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                ADOBE_CATALOG_SERVICE_ENDPOINT: 'https://catalog.example.com',
                ADOBE_CATALOG_API_KEY: 'test-key',
            });
        });

        it('should handle missing env vars', () => {
            const config = {
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
            };

            const result = getMeshEnvVars(config);

            expect(result).toEqual({
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
            });
        });

        it('should filter out null and undefined values', () => {
            const config = {
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                ADOBE_CATALOG_API_KEY: null,
                ADOBE_CATALOG_SERVICE_ENDPOINT: undefined,
            };

            const result = getMeshEnvVars(config);

            expect(result).toEqual({
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
            });
        });

        it('should convert values to strings', () => {
            const config = {
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 12345,
            };

            const result = getMeshEnvVars(config);

            expect(result).toEqual({
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: '12345',
            });
        });

        it('should return empty object for empty config', () => {
            const result = getMeshEnvVars({});

            expect(result).toEqual({});
        });
    });

    describe('fetchDeployedMeshConfig', () => {
        it('should fetch and parse deployed mesh config', async () => {
            const mockCommandManager = {
                executeAdobeCLI: jest.fn()
                    .mockResolvedValueOnce({ code: 0, stdout: '{"org":"test"}' }) // Auth check
                    .mockResolvedValueOnce({
                        code: 0,
                        stdout: JSON.stringify({
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
                        }),
                    }),
            };

            const { ServiceLocator } = require('@/core/di');
            ServiceLocator.getCommandExecutor.mockReturnValue(mockCommandManager);

            const result = await fetchDeployedMeshConfig();

            expect(result).toEqual({
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                ADOBE_CATALOG_SERVICE_ENDPOINT: 'https://catalog.example.com',
                ADOBE_CATALOG_API_KEY: 'test-key',
            });
        });

        it('should return null when not authenticated', async () => {
            const mockCommandManager = {
                executeAdobeCLI: jest.fn()
                    .mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'Not authenticated' }),
            };

            const { ServiceLocator } = require('@/core/di');
            ServiceLocator.getCommandExecutor.mockReturnValue(mockCommandManager);

            const result = await fetchDeployedMeshConfig();

            expect(result).toBeNull();
        });

        it('should return null when mesh fetch fails', async () => {
            const mockCommandManager = {
                executeAdobeCLI: jest.fn()
                    .mockResolvedValueOnce({ code: 0, stdout: '{"org":"test"}' })
                    .mockRejectedValueOnce(new Error('Network error')),
            };

            const { ServiceLocator } = require('@/core/di');
            ServiceLocator.getCommandExecutor.mockReturnValue(mockCommandManager);

            const result = await fetchDeployedMeshConfig();

            expect(result).toBeNull();
        });

        it('should return null when JSON parsing fails', async () => {
            const mockCommandManager = {
                executeAdobeCLI: jest.fn()
                    .mockResolvedValueOnce({ code: 0, stdout: '{"org":"test"}' })
                    .mockResolvedValueOnce({ code: 0, stdout: 'invalid json' }),
            };

            const { ServiceLocator } = require('@/core/di');
            ServiceLocator.getCommandExecutor.mockReturnValue(mockCommandManager);

            const result = await fetchDeployedMeshConfig();

            expect(result).toBeNull();
        });

        it('should skip API key with context.headers placeholder', async () => {
            const mockCommandManager = {
                executeAdobeCLI: jest.fn()
                    .mockResolvedValueOnce({ code: 0, stdout: '{"org":"test"}' })
                    .mockResolvedValueOnce({
                        code: 0,
                        stdout: JSON.stringify({
                            meshConfig: {
                                sources: [
                                    {
                                        name: 'catalog',
                                        handler: {
                                            graphql: {
                                                endpoint: 'https://catalog.example.com',
                                                operationHeaders: {
                                                    'x-api-key': '{context.headers[\'x-api-key\']}',
                                                },
                                            },
                                        },
                                    },
                                ],
                            },
                        }),
                    }),
            };

            const { ServiceLocator } = require('@/core/di');
            ServiceLocator.getCommandExecutor.mockReturnValue(mockCommandManager);

            const result = await fetchDeployedMeshConfig();

            expect(result).toEqual({
                ADOBE_CATALOG_SERVICE_ENDPOINT: 'https://catalog.example.com',
            });
            expect(result?.ADOBE_CATALOG_API_KEY).toBeUndefined();
        });
    });

    describe('calculateMeshSourceHash', () => {
        it('should calculate hash from mesh config and source files', async () => {
            const mockFs = fs as jest.Mocked<typeof fs>;
            const mockCrypto = crypto as jest.Mocked<typeof crypto>;

            (mockFs.readFile as jest.Mock)
                .mockResolvedValueOnce('mesh config content')
                .mockResolvedValueOnce('resolver1')
                .mockResolvedValueOnce('schema1');

            (mockFs.readdir as jest.Mock)
                .mockResolvedValueOnce(['resolver.js'] as any)
                .mockResolvedValueOnce(['schema.graphql'] as any);

            const mockHash = {
                update: jest.fn().mockReturnThis(),
                digest: jest.fn().mockReturnValue('abc123'),
            };
            (mockCrypto.createHash as jest.Mock).mockReturnValue(mockHash as any);

            const result = await calculateMeshSourceHash('/path/to/mesh');

            expect(result).toBe('abc123');
            expect(mockHash.update).toHaveBeenCalled();
        });

        it('should handle missing mesh config file', async () => {
            const mockFs = fs as jest.Mocked<typeof fs>;
            const mockCrypto = crypto as jest.Mocked<typeof crypto>;

            (mockFs.readFile as jest.Mock).mockRejectedValueOnce(new Error('ENOENT'));
            (mockFs.readdir as jest.Mock).mockResolvedValue([] as any);

            const mockHash = {
                update: jest.fn().mockReturnThis(),
                digest: jest.fn().mockReturnValue(null),
            };
            (mockCrypto.createHash as jest.Mock).mockReturnValue(mockHash as any);

            const result = await calculateMeshSourceHash('/path/to/mesh');

            expect(result).toBeNull();
        });

        it('should handle missing resolver directory', async () => {
            const mockFs = fs as jest.Mocked<typeof fs>;
            const mockCrypto = crypto as jest.Mocked<typeof crypto>;

            (mockFs.readFile as jest.Mock).mockResolvedValue('mesh config');
            (mockFs.readdir as jest.Mock)
                .mockRejectedValueOnce(new Error('ENOENT'))
                .mockResolvedValueOnce([] as any);

            const mockHash = {
                update: jest.fn().mockReturnThis(),
                digest: jest.fn().mockReturnValue('abc123'),
            };
            (mockCrypto.createHash as jest.Mock).mockReturnValue(mockHash as any);

            const result = await calculateMeshSourceHash('/path/to/mesh');

            expect(result).toBe('abc123');
        });

        it('should sort files for consistent hashing', async () => {
            const mockFs = fs as jest.Mocked<typeof fs>;
            const mockCrypto = crypto as jest.Mocked<typeof crypto>;

            (mockFs.readFile as jest.Mock).mockResolvedValue('content');
            (mockFs.readdir as jest.Mock)
                .mockResolvedValueOnce(['c.js', 'a.js', 'b.js'] as any)
                .mockResolvedValueOnce(['y.graphql', 'x.graphql'] as any);

            const mockHash = {
                update: jest.fn().mockReturnThis(),
                digest: jest.fn().mockReturnValue('abc123'),
            };
            (mockCrypto.createHash as jest.Mock).mockReturnValue(mockHash as any);

            await calculateMeshSourceHash('/path/to/mesh');

            // Verify files were sorted before reading
            const readFileCalls = mockFs.readFile.mock.calls;
            expect(readFileCalls[1][0]).toContain('a.js');
            expect(readFileCalls[2][0]).toContain('b.js');
            expect(readFileCalls[3][0]).toContain('c.js');
        });
    });

    describe('getCurrentMeshState', () => {
        it('should return mesh state from project', () => {
            const project: Project = {
                name: 'Test Project',
                path: '/test',
                created: new Date('2024-01-01T00:00:00Z'),
                lastModified: new Date('2024-01-01T00:00:00Z'),
                status: 'running',
                meshState: {
                    envVars: { VAR1: 'value1' },
                    sourceHash: 'abc123',
                    lastDeployed: '2024-01-01T00:00:00Z',
                },
            };

            const result = getCurrentMeshState(project);

            expect(result).toEqual({
                envVars: { VAR1: 'value1' },
                sourceHash: 'abc123',
                lastDeployed: new Date('2024-01-01T00:00:00Z'),
            });
        });

        it('should return null when no mesh state', () => {
            const project: Project = {
                name: 'Test Project',
                path: '/test',
                created: new Date('2024-01-01T00:00:00Z'),
                lastModified: new Date('2024-01-01T00:00:00Z'),
                status: 'running',
            };

            const result = getCurrentMeshState(project);

            expect(result).toBeNull();
        });

        it('should handle partial mesh state', () => {
            const project: Project = {
                name: 'Test Project',
                path: '/test',
                created: new Date('2024-01-01T00:00:00Z'),
                lastModified: new Date('2024-01-01T00:00:00Z'),
                status: 'running',
                meshState: {
                    envVars: {},
                    sourceHash: null,
                    lastDeployed: '',
                },
            };

            const result = getCurrentMeshState(project);

            expect(result).toEqual({
                envVars: {},
                sourceHash: null,
                lastDeployed: null,
            });
        });
    });

    describe('detectMeshChanges', () => {
        it('should detect no changes when state matches', async () => {
            const project: Project = {
                name: 'Test Project',
                path: '/test',
                created: new Date('2024-01-01T00:00:00Z'),
                lastModified: new Date('2024-01-01T00:00:00Z'),
                status: 'running',
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
            };

            const newConfig = {
                'commerce-mesh': {
                    ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                },
            };

            const mockFs = fs as jest.Mocked<typeof fs>;
            const mockCrypto = crypto as jest.Mocked<typeof crypto>;

            (mockFs.readFile as jest.Mock).mockResolvedValue('content');
            (mockFs.readdir as jest.Mock).mockResolvedValue([] as any);

            const mockHash = {
                update: jest.fn().mockReturnThis(),
                digest: jest.fn().mockReturnValue('abc123'),
            };
            (mockCrypto.createHash as jest.Mock).mockReturnValue(mockHash as any);

            const result = await detectMeshChanges(project, newConfig);

            expect(result.hasChanges).toBe(false);
            expect(result.envVarsChanged).toBe(false);
            expect(result.sourceFilesChanged).toBe(false);
        });

        it('should detect env var changes', async () => {
            const project: Project = {
                name: 'Test Project',
                path: '/test',
                created: new Date('2024-01-01T00:00:00Z'),
                lastModified: new Date('2024-01-01T00:00:00Z'),
                status: 'running',
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
                        ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://old.com/graphql',
                    },
                    sourceHash: 'abc123',
                    lastDeployed: '2024-01-01T00:00:00Z',
                },
            };

            const newConfig = {
                'commerce-mesh': {
                    ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://new.com/graphql',
                },
            };

            const mockFs = fs as jest.Mocked<typeof fs>;
            const mockCrypto = crypto as jest.Mocked<typeof crypto>;

            (mockFs.readFile as jest.Mock).mockResolvedValue('content');
            (mockFs.readdir as jest.Mock).mockResolvedValue([] as any);

            const mockHash = {
                update: jest.fn().mockReturnThis(),
                digest: jest.fn().mockReturnValue('abc123'),
            };
            (mockCrypto.createHash as jest.Mock).mockReturnValue(mockHash as any);

            const result = await detectMeshChanges(project, newConfig);

            expect(result.hasChanges).toBe(true);
            expect(result.envVarsChanged).toBe(true);
            expect(result.changedEnvVars).toContain('ADOBE_COMMERCE_GRAPHQL_ENDPOINT');
        });

        it('should detect source file changes', async () => {
            const project: Project = {
                name: 'Test Project',
                path: '/test',
                created: new Date('2024-01-01T00:00:00Z'),
                lastModified: new Date('2024-01-01T00:00:00Z'),
                status: 'running',
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
            };

            const newConfig = {
                'commerce-mesh': {
                    ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                },
            };

            const mockFs = fs as jest.Mocked<typeof fs>;
            const mockCrypto = crypto as jest.Mocked<typeof crypto>;

            (mockFs.readFile as jest.Mock).mockResolvedValue('different content');
            (mockFs.readdir as jest.Mock).mockResolvedValue([] as any);

            const mockHash = {
                update: jest.fn().mockReturnThis(),
                digest: jest.fn().mockReturnValue('xyz789'),
            };
            (mockCrypto.createHash as jest.Mock).mockReturnValue(mockHash as any);

            const result = await detectMeshChanges(project, newConfig);

            expect(result.hasChanges).toBe(true);
            expect(result.sourceFilesChanged).toBe(true);
        });

        it('should return hasChanges=true when no previous state', async () => {
            const project: Project = {
                name: 'Test Project',
                path: '/test',
                created: new Date('2024-01-01T00:00:00Z'),
                lastModified: new Date('2024-01-01T00:00:00Z'),
                status: 'running',
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        path: '/test/mesh',
                        status: 'ready',
                    },
                },
            };

            const newConfig = {
                'commerce-mesh': {
                    ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                },
            };

            const result = await detectMeshChanges(project, newConfig);

            expect(result.hasChanges).toBe(true);
            expect(result.envVarsChanged).toBe(true);
            expect(result.sourceFilesChanged).toBe(true);
        });

        it('should return no changes when no mesh component', async () => {
            const project: Project = {
                name: 'Test Project',
                path: '/test',
                created: new Date('2024-01-01T00:00:00Z'),
                lastModified: new Date('2024-01-01T00:00:00Z'),
                status: 'running',
            };

            const result = await detectMeshChanges(project, {});

            expect(result.hasChanges).toBe(false);
            expect(result.envVarsChanged).toBe(false);
            expect(result.sourceFilesChanged).toBe(false);
        });
    });

    describe('updateMeshState', () => {
        it('should update mesh state after deployment', async () => {
            const project: Project = {
                name: 'Test Project',
                path: '/test',
                created: new Date('2024-01-01T00:00:00Z'),
                lastModified: new Date('2024-01-01T00:00:00Z'),
                status: 'running',
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        path: '/test/mesh',
                        status: 'deployed',
                    },
                },
                componentConfigs: {
                    'commerce-mesh': {
                        ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                    },
                },
            };

            const mockFs = fs as jest.Mocked<typeof fs>;
            const mockCrypto = crypto as jest.Mocked<typeof crypto>;

            (mockFs.readFile as jest.Mock).mockResolvedValue('content');
            (mockFs.readdir as jest.Mock).mockResolvedValue([] as any);

            const mockHash = {
                update: jest.fn().mockReturnThis(),
                digest: jest.fn().mockReturnValue('abc123'),
            };
            (mockCrypto.createHash as jest.Mock).mockReturnValue(mockHash as any);

            await updateMeshState(project);

            expect(project.meshState).toBeDefined();
            expect(project.meshState?.envVars).toEqual({
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
            });
            expect(project.meshState?.sourceHash).toBe('abc123');
            expect(project.meshState?.lastDeployed).toBeDefined();
        });

        it('should do nothing when no mesh component', async () => {
            const project: Project = {
                name: 'Test Project',
                path: '/test',
                created: new Date('2024-01-01T00:00:00Z'),
                lastModified: new Date('2024-01-01T00:00:00Z'),
                status: 'running',
            };

            await updateMeshState(project);

            expect(project.meshState).toBeUndefined();
        });
    });

    describe('detectFrontendChanges', () => {
        it('should detect frontend env var changes', () => {
            const { getFrontendEnvVars } = require('@/core/state');

            getFrontendEnvVars.mockReturnValue({
                MESH_ENDPOINT: 'https://new.com',
                OTHER_VAR: 'value',
            });

            const project: Project = {
                name: 'Test Project',
                path: '/test',
                created: new Date('2024-01-01T00:00:00Z'),
                lastModified: new Date('2024-01-01T00:00:00Z'),
                status: 'running',
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
                        MESH_ENDPOINT: 'https://new.com',
                        OTHER_VAR: 'value',
                    },
                },
                frontendEnvState: {
                    envVars: {
                        MESH_ENDPOINT: 'https://old.com',
                        OTHER_VAR: 'value',
                    },
                    capturedAt: '2024-01-01T00:00:00Z',
                },
            };

            const result = detectFrontendChanges(project);

            expect(result).toBe(true);
        });

        it('should return false when no changes', () => {
            const { getFrontendEnvVars } = require('@/core/state');

            getFrontendEnvVars.mockReturnValue({
                MESH_ENDPOINT: 'https://example.com',
                OTHER_VAR: 'value',
            });

            const project: Project = {
                name: 'Test Project',
                path: '/test',
                created: new Date('2024-01-01T00:00:00Z'),
                lastModified: new Date('2024-01-01T00:00:00Z'),
                status: 'running',
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
            };

            const result = detectFrontendChanges(project);

            expect(result).toBe(false);
        });

        it('should return false when no frontend component', () => {
            const project: Project = {
                name: 'Test Project',
                path: '/test',
                created: new Date('2024-01-01T00:00:00Z'),
                lastModified: new Date('2024-01-01T00:00:00Z'),
                status: 'running',
            };

            const result = detectFrontendChanges(project);

            expect(result).toBe(false);
        });
    });
});
