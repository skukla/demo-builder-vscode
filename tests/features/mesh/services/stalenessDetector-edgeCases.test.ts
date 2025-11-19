// IMPORTANT: Mock must be declared before imports
jest.mock('fs/promises', () => ({
    readFile: jest.fn(),
    readdir: jest.fn(),
}));

jest.mock('crypto', () => ({
    createHash: jest.fn(),
}));

jest.mock('@/core/state', () => ({
    getFrontendEnvVars: jest.fn(),
}));

import {
    detectMeshChanges,
    updateMeshState,
    detectFrontendChanges,
} from '@/features/mesh/services/stalenessDetector';
import {
    createMockProject,
    createMockProjectWithMesh,
    createMockProjectWithFrontend,
    setupMockFileSystemWithHash,
} from './stalenessDetector.testUtils';

/**
 * StalenessDetector - Edge Cases and Frontend Changes
 *
 * Tests edge cases, error scenarios, and frontend change detection:
 * - Detect no changes when state matches
 * - Detect env var changes
 * - Detect source file changes
 * - Handle missing previous state
 * - Update mesh state after deployment
 * - Detect frontend env var changes
 * - Handle missing frontend component
 *
 * Total tests: 9
 */

describe('StalenessDetector - Edge Cases', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Re-setup mock implementations
        const fs = require('fs/promises');
        const crypto = require('crypto');

        jest.mocked(fs.readFile).mockReset();
        jest.mocked(fs.readdir).mockReset();
        jest.mocked(crypto.createHash).mockReset();
    });

    describe('detectMeshChanges - change detection', () => {
        it('should detect no changes when state matches', async () => {
            const project = createMockProjectWithMesh();

            const newConfig = {
                'commerce-mesh': {
                    ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                },
            };

            setupMockFileSystemWithHash('abc123');

            const result = await detectMeshChanges(project, newConfig);

            expect(result.hasChanges).toBe(false);
            expect(result.envVarsChanged).toBe(false);
            expect(result.sourceFilesChanged).toBe(false);
        });

        it('should detect env var changes', async () => {
            const project = createMockProjectWithMesh({
                meshState: {
                    envVars: {
                        ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://old.com/graphql',
                    },
                    sourceHash: 'abc123',
                    lastDeployed: '2024-01-01T00:00:00Z',
                },
            });

            const newConfig = {
                'commerce-mesh': {
                    ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://new.com/graphql',
                },
            };

            setupMockFileSystemWithHash('abc123');

            const result = await detectMeshChanges(project, newConfig);

            expect(result.hasChanges).toBe(true);
            expect(result.envVarsChanged).toBe(true);
            expect(result.changedEnvVars).toContain('ADOBE_COMMERCE_GRAPHQL_ENDPOINT');
        });

        it('should detect source file changes', async () => {
            const project = createMockProjectWithMesh();

            const newConfig = {
                'commerce-mesh': {
                    ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                },
            };

            setupMockFileSystemWithHash('xyz789', 'different content');

            const result = await detectMeshChanges(project, newConfig);

            expect(result.hasChanges).toBe(true);
            expect(result.sourceFilesChanged).toBe(true);
        });

        it('should return hasChanges=true when no previous state', async () => {
            const project = createMockProject({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        path: '/test/mesh',
                        status: 'ready',
                    },
                },
            });

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
            const project = createMockProject();

            const result = await detectMeshChanges(project, {});

            expect(result.hasChanges).toBe(false);
            expect(result.envVarsChanged).toBe(false);
            expect(result.sourceFilesChanged).toBe(false);
        });
    });

    describe('updateMeshState', () => {
        it('should update mesh state after deployment', async () => {
            const project = createMockProject({
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
            });

            setupMockFileSystemWithHash('abc123');

            await updateMeshState(project);

            expect(project.meshState).toBeDefined();
            expect(project.meshState?.envVars).toEqual({
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
            });
            expect(project.meshState?.sourceHash).toBe('abc123');
            expect(project.meshState?.lastDeployed).toBeDefined();
        });

        it('should do nothing when no mesh component', async () => {
            const project = createMockProject();

            await updateMeshState(project);

            expect(project.meshState).toBeUndefined();
        });
    });

    describe('detectFrontendChanges', () => {
        beforeEach(() => {
            const { getFrontendEnvVars } = require('@/core/state');
            getFrontendEnvVars.mockClear();
        });

        it('should detect frontend env var changes', () => {
            const { getFrontendEnvVars } = require('@/core/state');

            getFrontendEnvVars.mockReturnValue({
                MESH_ENDPOINT: 'https://new.com',
                OTHER_VAR: 'value',
            });

            const project = createMockProjectWithFrontend({
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
            });

            const result = detectFrontendChanges(project);

            expect(result).toBe(true);
        });

        it('should return false when no changes', () => {
            const { getFrontendEnvVars } = require('@/core/state');

            getFrontendEnvVars.mockReturnValue({
                MESH_ENDPOINT: 'https://example.com',
                OTHER_VAR: 'value',
            });

            const project = createMockProjectWithFrontend({
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
            });

            const result = detectFrontendChanges(project);

            expect(result).toBe(false);
        });

        it('should return false when no frontend component', () => {
            const project = createMockProject();

            const result = detectFrontendChanges(project);

            expect(result).toBe(false);
        });
    });
});
