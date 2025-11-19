import {
    getCurrentMeshState,
    detectMeshChanges,
} from '@/features/mesh/services/stalenessDetector';
import {
    createMockProject,
    setupMockCommandExecutor,
    setupMockFileSystemWithHash,
} from './stalenessDetector.testUtils';
import type { Project } from '@/types';

/**
 * StalenessDetector - State Detection Tests
 *
 * Tests mesh state retrieval and unknown deployed state handling:
 * - Get current mesh state from project
 * - Handle missing/partial mesh state
 * - Detect unknown deployed state when fetch fails
 * - Populate baseline mesh state when fetch succeeds
 * - Handle scenarios where mesh is not deployed
 *
 * Total tests: 7
 */

describe('StalenessDetector - State Detection', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getCurrentMeshState', () => {
        it('should return mesh state from project', () => {
            const project = createMockProject({
                meshState: {
                    envVars: { VAR1: 'value1' },
                    sourceHash: 'abc123',
                    lastDeployed: '2024-01-01T00:00:00Z',
                },
            });

            const result = getCurrentMeshState(project);

            expect(result).toEqual({
                envVars: { VAR1: 'value1' },
                sourceHash: 'abc123',
                lastDeployed: new Date('2024-01-01T00:00:00Z'),
            });
        });

        it('should return null when no mesh state', () => {
            const project = createMockProject();

            const result = getCurrentMeshState(project);

            expect(result).toBeNull();
        });

        it('should handle partial mesh state', () => {
            const project = createMockProject({
                meshState: {
                    envVars: {},
                    sourceHash: null,
                    lastDeployed: '',
                },
            });

            const result = getCurrentMeshState(project);

            expect(result).toEqual({
                envVars: {},
                sourceHash: null,
                lastDeployed: null,
            });
        });
    });

    describe('detectMeshChanges - unknownDeployedState handling', () => {
        it('should return unknownDeployedState=true and hasChanges=false when fetch fails (timeout)', async () => {
            const project = createMockProject({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        path: '/test/mesh',
                        status: 'deployed',
                    },
                },
                meshState: {
                    envVars: {},
                    sourceHash: null,
                    lastDeployed: '',
                },
            });

            setupMockCommandExecutor(
                { code: 0, stdout: '{"org":"test"}' },
                new Error('Timeout')
            );

            const result = await detectMeshChanges(project, {});

            expect(result.unknownDeployedState).toBe(true);
            expect(result.hasChanges).toBe(false);
            expect(result.envVarsChanged).toBe(false);
        });

        it('should populate meshState.envVars and set shouldSaveProject when fetch succeeds', async () => {
            const project: Project = createMockProject({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        path: '/test/mesh',
                        status: 'deployed',
                    },
                },
                meshState: {
                    envVars: {},
                    sourceHash: null,
                    lastDeployed: '',
                },
            });

            const deployedConfig = {
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
            };

            setupMockCommandExecutor(
                { code: 0, stdout: '{"org":"test"}' },
                {
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
                            ],
                        },
                    }),
                }
            );

            setupMockFileSystemWithHash('hash123');

            const newConfig = {
                'commerce-mesh': {
                    ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                },
            };

            const result = await detectMeshChanges(project, newConfig);

            expect(result.shouldSaveProject).toBe(true);
            expect(result.hasChanges).toBe(false);
            expect(result.unknownDeployedState).toBeUndefined();
            expect(project.meshState?.envVars).toEqual(deployedConfig);
        });

        it('should handle empty meshState with fetch returning null (no mesh deployed)', async () => {
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
                    sourceHash: null,
                    lastDeployed: '',
                },
            });

            setupMockCommandExecutor({
                code: 1,
                stdout: '',
                stderr: 'Not authenticated',
            });

            const result = await detectMeshChanges(project, {});

            expect(result.unknownDeployedState).toBe(true);
            expect(result.hasChanges).toBe(false);
        });

        it('should handle missing mesh component gracefully', async () => {
            const project = createMockProject();

            const result = await detectMeshChanges(project, {});

            expect(result.hasChanges).toBe(false);
            expect(result.envVarsChanged).toBe(false);
            expect(result.sourceFilesChanged).toBe(false);
        });
    });
});
