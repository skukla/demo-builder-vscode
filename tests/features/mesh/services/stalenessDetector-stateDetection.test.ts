// IMPORTANT: Mock must be declared before imports
jest.mock('@/core/logging', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        trace: jest.fn(),
    }),
}));

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
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                        envVars: { VAR1: 'value1' },
                        sourceHash: 'abc123',
                        lastDeployed: '2024-01-01T00:00:00Z',
                    },
                },
            } as unknown as Partial<Project>);

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
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                        envVars: {},
                        sourceHash: null,
                        lastDeployed: '',
                    },
                },
            } as unknown as Partial<Project>);

            const result = getCurrentMeshState(project);

            expect(result).toEqual({
                envVars: {},
                sourceHash: null,
                lastDeployed: null,
            });
        });

        // The deployed baseline reads from the keyed mesh appBuilderComponents
        // entry — the only carrier since PL-1 phase 2.
        describe('keyed-first read (ADR-011 D3 Step 06)', () => {
            it('should read envVars/sourceHash/lastDeployed from the keyed mesh entry (keyed-only)', () => {
                const project = createMockProject({
                    appBuilderComponents: {
                        'commerce-mesh': {
                            kind: 'mesh',
                            status: 'deployed',
                            source: { owner: '', repo: '' },
                            endpoint: 'https://mesh/graphql',
                            envVars: { VAR1: 'keyed-value' },
                            sourceHash: 'keyed-hash',
                            lastDeployed: '2026-07-01T00:00:00Z',
                        },
                    },
                } as unknown as Partial<Project>);

                const result = getCurrentMeshState(project);

                expect(result).toEqual({
                    envVars: { VAR1: 'keyed-value' },
                    sourceHash: 'keyed-hash',
                    lastDeployed: new Date('2026-07-01T00:00:00Z'),
                });
            });

            it('should return null for an undeployed keyed entry with no runtime fields (fresh-deploy semantics)', () => {
                const project = createMockProject({
                    appBuilderComponents: {
                        mesh: {
                            kind: 'mesh',
                            status: 'not-deployed',
                            source: { owner: '', repo: '' },
                        },
                    },
                } as unknown as Partial<Project>);

                expect(getCurrentMeshState(project)).toBeNull();
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
                        envVars: {},
                        sourceHash: null,
                        lastDeployed: '',
                    },
                },
            } as unknown as Partial<Project>);

            setupMockCommandExecutor(
                { code: 0, stdout: '{"org":"test"}' },
                new Error('Timeout')
            );

            const result = await detectMeshChanges(project, {});

            expect(result.unknownDeployedState).toBe(true);
            expect(result.hasChanges).toBe(false);
            expect(result.envVarsChanged).toBe(false);
        });

        it('should populate the keyed entry envVars and set shouldSaveProject when fetch succeeds (keyed-only)', async () => {
            const project: Project = createMockProject({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        subType: 'mesh',
                        path: '/test/mesh',
                        status: 'deployed',
                    },
                },
                // Post-Step-07 shape: the deployment record lives on the keyed
                // entry only (empty envVars = baseline never captured).
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                        endpoint: 'https://example.com/graphql',
                        envVars: {},
                        sourceHash: null,
                    },
                },
            } as unknown as Partial<Project>);

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
            expect(project.appBuilderComponents?.mesh?.envVars).toEqual(deployedConfig);
        });

        it('should handle an empty keyed baseline with fetch returning null (no mesh deployed)', async () => {
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
                        status: 'not-deployed',
                        source: { owner: '', repo: '' },
                        envVars: {},
                        sourceHash: null,
                        lastDeployed: '',
                    },
                },
            } as unknown as Partial<Project>);

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
