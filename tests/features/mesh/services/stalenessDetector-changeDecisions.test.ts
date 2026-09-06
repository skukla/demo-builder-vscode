// IMPORTANT: Mock must be declared before imports
jest.mock('fs/promises', () => ({
    readFile: jest.fn(),
    readdir: jest.fn(),
}));

jest.mock('crypto', () => ({
    createHash: jest.fn(),
}));

jest.mock('@/core/state/projectStateSync', () => ({
    getFrontendEnvVars: jest.fn(),
}));

import {
    detectMeshChanges,
    detectFrontendChanges,
    getCurrentMeshState,
} from '@/features/mesh/services/stalenessDetector';
import { getFrontendEnvVars } from '@/core/state/projectStateSync';
import {
    createStalenessProject,
    createMockProjectWithMesh,
    setupMockFileSystemWithHash,
    meshDeps,
} from './stalenessDetector.testUtils';

/**
 * StalenessDetector — the decisions the comparison makes.
 *
 * Each test here pins one branch that nothing else constrains, and asserts the
 * VERDICT the caller acts on (`hasChanges`, `sourceFilesChanged`,
 * `shouldSaveProject`) or the argument a collaborator receives — never a log
 * line. Several of them separate "this shape is tolerated" from "reading this
 * shape throws", which look identical from a caller that only checks for a
 * falsy answer.
 */

const MESH_INSTANCES = {
    'commerce-mesh': {
        id: 'commerce-mesh',
        name: 'API Mesh',
        subType: 'mesh' as const,
        path: '/test/mesh',
        status: 'deployed' as const,
    },
};

describe('StalenessDetector - change decisions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        const fs = require('fs/promises');
        const crypto = require('crypto');
        jest.mocked(fs.readFile).mockReset();
        jest.mocked(fs.readdir).mockReset();
        jest.mocked(crypto.createHash).mockReset();
    });

    describe('getCurrentMeshState — what counts as deployment evidence', () => {
        it('reports state from a sourceHash alone, with no envVars and no lastDeployed', () => {
            const project = createStalenessProject({
                componentInstances: MESH_INSTANCES,
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                        sourceHash: 'abc123',
                    },
                },
            });

            expect(getCurrentMeshState(project)).toEqual({
                envVars: {},
                sourceHash: 'abc123',
                lastDeployed: null,
            });
        });
    });

    describe('detectMeshChanges', () => {
        it('reports an empty changed list when the project has no mesh component', async () => {
            const project = createStalenessProject();

            const result = await detectMeshChanges(project, {}, meshDeps);

            expect(result).toEqual({
                hasChanges: false,
                envVarsChanged: false,
                sourceFilesChanged: false,
                changedEnvVars: [],
            });
        });

        it('does not ask the caller to save when it read the baseline off the project', async () => {
            const project = createMockProjectWithMesh();
            setupMockFileSystemWithHash('abc123');

            const result = await detectMeshChanges(
                project,
                {
                    'commerce-mesh': {
                        ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                    },
                },
                meshDeps
            );

            expect(result.shouldSaveProject).toBe(false);
        });

        it('tolerates a component whose config entry is null', async () => {
            const project = createMockProjectWithMesh();
            setupMockFileSystemWithHash('abc123');

            const result = await detectMeshChanges(
                project,
                {
                    'broken-component': null,
                    'commerce-mesh': {
                        ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                    },
                },
                meshDeps
            );

            expect(result.hasChanges).toBe(false);
            expect(result.changedEnvVars).toEqual([]);
        });

        it('tolerates a project that has selected no backend at all', async () => {
            const project = createMockProjectWithMesh({ componentSelections: undefined });
            setupMockFileSystemWithHash('abc123');

            const result = await detectMeshChanges(
                project,
                {
                    'commerce-mesh': {
                        ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                    },
                },
                meshDeps
            );

            expect(result.hasChanges).toBe(false);
        });

        it('treats a never-captured source hash as up to date, not as a change', async () => {
            const project = createStalenessProject({
                componentInstances: MESH_INSTANCES,
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                        envVars: {
                            ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                        },
                    },
                },
            });
            setupMockFileSystemWithHash('a-freshly-computed-hash');

            const result = await detectMeshChanges(
                project,
                {
                    'commerce-mesh': {
                        ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                    },
                },
                meshDeps
            );

            expect(result.sourceFilesChanged).toBe(false);
            expect(result.hasChanges).toBe(false);
        });
    });

    describe('detectFrontendChanges', () => {
        const FRONTEND_INSTANCES = {
            headless: {
                id: 'headless',
                name: 'Frontend',
                type: 'frontend' as const,
                path: '/test/frontend',
                status: 'running' as const,
            },
        };

        it('reports no change when the frontend has no captured env state', () => {
            const project = createStalenessProject({
                componentInstances: FRONTEND_INSTANCES,
                componentConfigs: { headless: { MESH_ENDPOINT: 'https://example.com' } },
            });

            expect(detectFrontendChanges(project)).toBe(false);
            expect(getFrontendEnvVars).not.toHaveBeenCalled();
        });

        it("compares against THAT frontend's own config", () => {
            jest.mocked(getFrontendEnvVars).mockReturnValue({
                MESH_ENDPOINT: 'https://example.com',
            });
            const project = createStalenessProject({
                componentInstances: FRONTEND_INSTANCES,
                componentConfigs: {
                    headless: { MESH_ENDPOINT: 'https://example.com', OTHER_VAR: 'value' },
                    'some-other-component': { MESH_ENDPOINT: 'https://wrong.example' },
                },
                frontendEnvState: {
                    envVars: { MESH_ENDPOINT: 'https://example.com' },
                    capturedAt: '2024-01-01T00:00:00Z',
                },
            });

            expect(detectFrontendChanges(project)).toBe(false);
            expect(getFrontendEnvVars).toHaveBeenCalledWith({
                MESH_ENDPOINT: 'https://example.com',
                OTHER_VAR: 'value',
            });
        });

        it('tolerates a project carrying no componentConfigs at all', () => {
            jest.mocked(getFrontendEnvVars).mockReturnValue({});
            const project = createStalenessProject({
                componentInstances: FRONTEND_INSTANCES,
                componentConfigs: undefined,
                frontendEnvState: {
                    envVars: { MESH_ENDPOINT: 'https://example.com' },
                    capturedAt: '2024-01-01T00:00:00Z',
                },
            });

            expect(detectFrontendChanges(project)).toBe(false);
            expect(getFrontendEnvVars).toHaveBeenCalledWith({});
        });
    });
});
