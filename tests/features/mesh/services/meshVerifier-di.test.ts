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

import {
    createMockProject,
    MeshVerifierService,
    setupMeshVerifier,
    type MeshCommandExecutorFake,
} from './meshVerifier.testUtils';
import { createSuccessResult, createFailureResult } from '../../../helpers/commandResultFake';



describe('MeshVerifierService - DI Pattern', () => {
    let mockLogger: ReturnType<typeof setupMeshVerifier>['mockLogger'];
    let service: MeshVerifierService;
    let mockCommandManager: MeshCommandExecutorFake;

    beforeEach(() => {
        ({ mockLogger, mockCommandManager } = setupMeshVerifier());
        // The whole point of this suite: the logger arrives by constructor, and
        // every assertion below reads the one handed in here.
        service = new MeshVerifierService(mockLogger, mockCommandManager);
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
                        subType: 'mesh',
                        path: '/test/mesh',
                        status: 'deployed',
                        metadata: {
                            meshId: 'mesh123',
                        },
                    },
                },
            });

            mockCommandManager.execute.mockResolvedValue(createSuccessResult('Mesh ID: mesh123\nEndpoint: https://example.com/graphql'));

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
                        subType: 'mesh',
                        path: '/test/mesh',
                        status: 'deployed',
                        // No meshId - triggers recovery attempt
                    },
                },
            });

            mockCommandManager.execute.mockResolvedValue(createSuccessResult(JSON.stringify({
                    meshId: 'recovered-mesh-123',
                    endpoint: 'https://example.com/graphql',
                })));

            await service.verifyMeshDeployment(project);

            // Recovery should log using injected logger
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('recover')
            );
        });

        it('should use injected logger when fetching mesh info', async () => {
            mockCommandManager.execute.mockResolvedValue(createSuccessResult(JSON.stringify({
                    meshId: 'mesh123',
                    endpoint: 'https://example.com/graphql',
                })));

            const project = createMockProject({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        subType: 'mesh',
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
                        subType: 'mesh',
                        path: '/test/mesh',
                        status: 'deployed',
                        metadata: {
                            meshId: 'mesh123',
                        },
                    },
                },
            });

            mockCommandManager.execute.mockResolvedValue(createFailureResult('Command failed'));

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

        it('should sync mesh status correctly', async () => {
            const project = createMockProject({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        subType: 'mesh',
                        path: '/test/mesh',
                        status: 'ready',
                    },
                },
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                            envVars: {},
                            sourceHash: 'abc123',
                            lastDeployed: '2024-01-01',
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

            await service.syncMeshStatus(project, verificationResult);

            // status should be updated
            expect(project.componentInstances?.['commerce-mesh'].status).toBe('deployed');
        });
    });
});
