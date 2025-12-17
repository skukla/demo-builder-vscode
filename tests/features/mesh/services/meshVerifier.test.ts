import { verifyMeshDeployment, syncMeshStatus } from '@/features/mesh/services/meshVerifier';
import type { Project } from '@/types';

/**
 * MeshVerifier Test Suite
 *
 * Tests mesh deployment verification with Adobe I/O:
 * - Mesh existence checking
 * - Mesh ID validation
 * - Endpoint extraction
 * - Error handling
 * - Project state synchronization
 *
 * Total tests: 17
 */

// Mock dependencies
jest.mock('@/core/logging', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getCommandExecutor: jest.fn(),
    },
}));

jest.mock('@/features/mesh/services/meshConfig', () => ({
    getMeshNodeVersion: () => '20',
}));

describe('MeshVerifier', () => {
    let mockCommandManager: any;

    // Helper to create complete Project objects
    const createMockProject = (overrides: Partial<Project> = {}): Project => ({
        name: 'Test Project',
        path: '/test',
        created: new Date('2024-01-01'),
        lastModified: new Date('2024-01-01'),
        status: 'ready' as const,
        ...overrides,
    });

    beforeEach(() => {
        jest.clearAllMocks();

        mockCommandManager = {
            execute: jest.fn(),
        };

        const { ServiceLocator } = require('@/core/di');
        ServiceLocator.getCommandExecutor.mockReturnValue(mockCommandManager);
    });

    describe('verifyMeshDeployment', () => {
        it('should verify mesh exists with valid response', async () => {
            const project = createMockProject({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        path: '/test/mesh',
                        status: 'deployed',
                        metadata: {
                            meshId: 'mesh123',
                        },
                    },
                },
            });

            mockCommandManager.execute.mockResolvedValue({
                code: 0,
                stdout: 'Mesh ID: mesh123\nEndpoint: https://example.com/graphql',
            });

            const result = await verifyMeshDeployment(project);

            expect(result.success).toBe(true);
            expect(result.data?.exists).toBe(true);
            expect(result.data?.meshId).toBe('mesh123');
            expect(result.data?.endpoint).toBe('https://example.com/graphql');
        });

        it('should parse JSON response format', async () => {
            const project = createMockProject({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        path: '/test/mesh',
                        status: 'deployed',
                        metadata: {
                            meshId: 'mesh123',
                        },
                    },
                },
            });

            mockCommandManager.execute.mockResolvedValue({
                code: 0,
                stdout: JSON.stringify({
                    meshId: 'mesh123',
                    endpoint: 'https://example.com/graphql',
                }),
            });

            const result = await verifyMeshDeployment(project);

            expect(result.success).toBe(true);
            expect(result.data?.exists).toBe(true);
            expect(result.data?.meshId).toBe('mesh123');
            expect(result.data?.endpoint).toBe('https://example.com/graphql');
        });

        it('should return exists=false when no mesh component', async () => {
            const project = createMockProject();

            const result = await verifyMeshDeployment(project);

            expect(result.success).toBe(true);
            expect(result.data?.exists).toBe(false);
        });

        it('should return error when no mesh ID in metadata', async () => {
            const project = createMockProject({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        path: '/test/mesh',
                        status: 'deployed',
                    },
                },
            });

            const result = await verifyMeshDeployment(project);

            expect(result.success).toBe(false);
            expect(result.error).toContain('No mesh ID found');
        });

        it('should handle command failure', async () => {
            const project = createMockProject({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        path: '/test/mesh',
                        status: 'deployed',
                        metadata: {
                            meshId: 'mesh123',
                        },
                    },
                },
            });

            mockCommandManager.execute.mockResolvedValue({
                code: 1,
                stderr: 'Mesh not found',
            });

            const result = await verifyMeshDeployment(project);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Mesh not found');
        });

        it('should detect mesh ID mismatch', async () => {
            const project = createMockProject({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        path: '/test/mesh',
                        status: 'deployed',
                        metadata: {
                            meshId: 'mesh123',
                        },
                    },
                },
            });

            mockCommandManager.execute.mockResolvedValue({
                code: 0,
                stdout: 'meshId: abc456\nendpoint: https://example.com/graphql',
            });

            const result = await verifyMeshDeployment(project);

            expect(result.success).toBe(false);
            expect(result.error).toContain('mismatch');
        });

        it('should handle command exception', async () => {
            const project = createMockProject({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        path: '/test/mesh',
                        status: 'deployed',
                        metadata: {
                            meshId: 'mesh123',
                        },
                    },
                },
            });

            mockCommandManager.execute.mockRejectedValue(new Error('Network error'));

            const result = await verifyMeshDeployment(project);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Network error');
        });

        it('should use project meshId when regex fails', async () => {
            const project = createMockProject({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        path: '/test/mesh',
                        status: 'deployed',
                        metadata: {
                            meshId: 'mesh123',
                        },
                    },
                },
            });

            // Use stdout that doesn't contain mesh ID pattern at all
            // Avoid "mesh ID" text followed by hex chars which could false-positive match
            mockCommandManager.execute.mockResolvedValue({
                code: 0,
                stdout: 'API configuration loaded successfully\nGraphQL URL: https://example.com/graphql',
            });

            const result = await verifyMeshDeployment(project);

            expect(result.success).toBe(true);
            expect(result.data?.meshId).toBe('mesh123');
        });

        it('should handle missing endpoint gracefully', async () => {
            const project = createMockProject({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        path: '/test/mesh',
                        status: 'deployed',
                        metadata: {
                            meshId: 'mesh123',
                        },
                    },
                },
            });

            mockCommandManager.execute.mockResolvedValue({
                code: 0,
                stdout: 'Mesh ID: mesh123',
            });

            const result = await verifyMeshDeployment(project);

            expect(result.success).toBe(true);
            expect(result.data?.exists).toBe(true);
            expect(result.data?.endpoint).toBeUndefined();
        });
    });

    describe('syncMeshStatus', () => {
        it('should update project when mesh exists', async () => {
            const project = createMockProject({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        path: '/test/mesh',
                        status: 'ready',
                        metadata: {
                            meshId: 'mesh123',
                        },
                    },
                },
                meshState: {
                    envVars: {},
                    sourceHash: 'abc123',
                    lastDeployed: '2024-01-01',
                },
            });

            const verificationResult = {
                success: true,
                data: {
                    exists: true,
                    meshId: 'mesh123',
                    endpoint: 'https://example.com/graphql',
                },
            };

            await syncMeshStatus(project, verificationResult);

            expect(project.componentInstances?.['commerce-mesh'].endpoint).toBe('https://example.com/graphql');
            expect(project.componentInstances?.['commerce-mesh'].status).toBe('deployed');
        });

        it('should clear meshState when mesh does not exist', async () => {
            const project = createMockProject({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        path: '/test/mesh',
                        status: 'deployed',
                        metadata: {
                            meshId: 'mesh123',
                        },
                    },
                },
                meshState: {
                    envVars: {},
                    sourceHash: 'abc123',
                    lastDeployed: '2024-01-01',
                },
            });

            const verificationResult = {
                success: true,
                data: {
                    exists: false,
                },
            };

            await syncMeshStatus(project, verificationResult);

            expect(project.meshState).toBeUndefined();
            expect(project.componentInstances?.['commerce-mesh'].status).toBe('ready');
            expect(project.componentInstances?.['commerce-mesh'].endpoint).toBeUndefined();
        });

        it('should do nothing when no mesh component', async () => {
            const project = createMockProject();

            const verificationResult = {
                success: true,
                data: {
                    exists: true,
                    meshId: 'mesh123',
                },
            };

            await syncMeshStatus(project, verificationResult);

            // Should not throw
            expect(project.meshState).toBeUndefined();
        });

        it('should do nothing on verification failure', async () => {
            const project = createMockProject({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        path: '/test/mesh',
                        status: 'deployed',
                        endpoint: 'https://old.com/graphql',
                    },
                },
            });

            const verificationResult = {
                success: false,
                error: 'Verification failed',
            };

            await syncMeshStatus(project, verificationResult);

            // Should not modify project
            expect(project.componentInstances?.['commerce-mesh'].endpoint).toBe('https://old.com/graphql');
        });

        it('should update endpoint if different', async () => {
            const project = createMockProject({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        path: '/test/mesh',
                        status: 'deployed',
                        endpoint: 'https://old.com/graphql',
                    },
                },
                meshState: {
                    envVars: {},
                    sourceHash: 'abc123',
                    lastDeployed: '2024-01-01',
                },
            });

            const verificationResult = {
                success: true,
                data: {
                    exists: true,
                    meshId: 'mesh123',
                    endpoint: 'https://new.com/graphql',
                },
            };

            await syncMeshStatus(project, verificationResult);

            expect(project.componentInstances?.['commerce-mesh'].endpoint).toBe('https://new.com/graphql');
        });

        it('should not update endpoint if same', async () => {
            const project = createMockProject({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        path: '/test/mesh',
                        status: 'deployed',
                        endpoint: 'https://example.com/graphql',
                    },
                },
            });

            const verificationResult = {
                success: true,
                data: {
                    exists: true,
                    meshId: 'mesh123',
                    endpoint: 'https://example.com/graphql',
                },
            };

            await syncMeshStatus(project, verificationResult);

            expect(project.componentInstances?.['commerce-mesh'].endpoint).toBe('https://example.com/graphql');
        });
    });
});
