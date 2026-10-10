// IMPORTANT: Mock must be declared before imports
jest.mock('fs/promises', () => ({
    readFile: jest.fn(),
    readdir: jest.fn(),
}));

jest.mock('crypto', () => ({
    createHash: jest.fn(),
}));

import { detectMeshChanges } from '@/features/mesh/services/stalenessDetector';
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
            expect(result.changedEnvVars).toStrictEqual([]);
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

});
