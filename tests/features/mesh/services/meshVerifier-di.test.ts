/**
 * MeshVerifier DI Pattern Tests
 *
 * Tests that MeshVerifierService uses constructor injection for logger.
 * This is part of Step 9: Standardize DI patterns.
 *
 * The MeshVerifierService should:
 * - Accept logger via constructor injection
 * - NOT use `getLogger()` inside functions
 * - Use the injected logger for all logging operations
 */

import { MeshVerifierService } from '@/features/mesh/services/meshVerifier';
import type { Project } from '@/types';

// Mock dependencies
jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getCommandExecutor: jest.fn(),
    },
}));

jest.mock('@/features/mesh/services/meshConfig', () => ({
    getMeshNodeVersion: () => '20',
}));

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        NORMAL: 30000, // Standard operations (replaces MESH_DESCRIBE)
    },
}));

describe('MeshVerifierService - DI Pattern', () => {
    let mockLogger: any;
    let service: MeshVerifierService;
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

        // Create mock logger to verify injection works
        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            trace: jest.fn(),
        };

        mockCommandManager = {
            execute: jest.fn(),
        };

        const { ServiceLocator } = require('@/core/di');
        ServiceLocator.getCommandExecutor.mockReturnValue(mockCommandManager);

        // Create service with injected logger
        service = new MeshVerifierService(mockLogger);
    });

    describe('Constructor Injection', () => {
        it('should accept logger via constructor', () => {
            expect(service).toBeDefined();
            expect(service).toBeInstanceOf(MeshVerifierService);
        });

        it('should use injected logger when verifying mesh deployment', async () => {
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

            await service.verifyMeshDeployment(project);

            // Verify injected logger was used
            expect(mockLogger.debug).toHaveBeenCalled();
        });

        it('should use injected logger when recovering mesh ID', async () => {
            const project = createMockProject({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        path: '/test/mesh',
                        status: 'deployed',
                        // No meshId - triggers recovery attempt
                    },
                },
            });

            mockCommandManager.execute.mockResolvedValue({
                code: 0,
                stdout: JSON.stringify({
                    meshId: 'recovered-mesh-123',
                    endpoint: 'https://example.com/graphql',
                }),
            });

            await service.verifyMeshDeployment(project);

            // Recovery should log using injected logger
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('recover')
            );
        });

        it('should use injected logger when fetching mesh info', async () => {
            mockCommandManager.execute.mockResolvedValue({
                code: 0,
                stdout: JSON.stringify({
                    meshId: 'mesh123',
                    endpoint: 'https://example.com/graphql',
                }),
            });

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

            await service.verifyMeshDeployment(project);

            // Should use injected logger for debug output
            expect(mockLogger.debug).toHaveBeenCalled();
        });

        it('should use injected logger for error scenarios', async () => {
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
                stderr: 'Command failed',
            });

            await service.verifyMeshDeployment(project);

            // Error logging should use injected logger
            expect(mockLogger.debug).toHaveBeenCalled();
        });
    });

    describe('Service Methods', () => {
        it('should return exists=false when no mesh component', async () => {
            const project = createMockProject();

            const result = await service.verifyMeshDeployment(project);

            expect(result.success).toBe(true);
            expect(result.data?.exists).toBe(false);
        });

        it('should sync mesh status correctly (status only, not endpoint)', async () => {
            const project = createMockProject({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        path: '/test/mesh',
                        status: 'ready',
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

            await service.syncMeshStatus(project, verificationResult);

            // Note: syncMeshStatus does NOT write endpoint - that's managed by deployMesh.ts
            // The single source of truth for endpoint writes is the deployment command
            expect(project.componentInstances?.['commerce-mesh'].endpoint).toBeUndefined();
            // But status should be updated
            expect(project.componentInstances?.['commerce-mesh'].status).toBe('deployed');
        });
    });
});
