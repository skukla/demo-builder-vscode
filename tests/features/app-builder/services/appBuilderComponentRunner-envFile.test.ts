/**
 * Deploy-contract runner — the mesh `.env` step.
 *
 * A mesh repo's `mesh.config.js` opens with `require('dotenv').config()` and
 * resolves every endpoint through `{env.*}`, so the file must exist BEFORE the
 * deploy tail runs. The dashboard add path never wrote one: it synthesized its
 * own component definition carrying no `requiredEnvVars` and never reached
 * `generateComponentEnvFile`, so `aio api-mesh` failed with
 * `ENOENT: no such file or directory, open '.env'`.
 *
 * These tests pin the ORDERING (env before deploy) and the SCOPE (mesh only —
 * catalog app repos ship no `.env` by design and take credentials through the
 * deploy's env injection instead; see runtimeCredentials.ts).
 *
 * Lives beside appBuilderComponentRunner.test.ts rather than inside it: that file
 * is already past the 500-line lint threshold.
 */

import { mockWithOrgContext } from './appBuilderComponentRunner.orgContextMock';
import type { Project } from '@/types/base';

jest.setTimeout(5000);

// =============================================================================
// Mocks — defined before imports
// =============================================================================

jest.mock('@/features/app-builder/services/appConfigPackages', () => ({
    listDeclaredPackageNames: jest.fn().mockResolvedValue([]),
    detectAppLayout: jest.fn().mockResolvedValue('standalone'),
}));

// =============================================================================
// Imports (after mocks)
// =============================================================================

import {
    addAppBuilderComponent,
    deployAppBuilderComponent,
} from '@/features/app-builder/services/appBuilderComponentRunner';
import {
    MESH_ENTRY,
    INTEGRATION_ENTRY,
    createDeps,
    createProject,
} from './appBuilderComponentRunner.testUtils';

beforeEach(() => {
    jest.clearAllMocks();
    mockWithOrgContext.mockImplementation((_target: unknown, fn: () => Promise<unknown>) => fn());
});

describe('mesh add — writes the .env before deploying', () => {
    it('calls writeComponentEnv with the installed path and the mesh id', async () => {
        const project = createProject();
        const deps = createDeps();

        const result = await addAppBuilderComponent(project, MESH_ENTRY, deps);

        expect(result.success).toBe(true);
        expect(deps.writeComponentEnv).toHaveBeenCalledWith(
            project,
            MESH_ENTRY.id,
            `/proj/components/${MESH_ENTRY.id}`
        );
    });

    // The whole point. A .env written after the deploy is a .env the deploy
    // never saw — which is indistinguishable from the bug being fixed.
    it('writes the .env BEFORE the mesh deploy tail runs', async () => {
        const project = createProject();
        const order: string[] = [];
        const deps = createDeps({
            writeComponentEnv: jest.fn(async () => {
                order.push('env');
            }),
            deployMesh: jest.fn(async () => {
                order.push('deploy');
                return { success: true, data: { meshId: 'm1', endpoint: 'https://mesh/graphql' } };
            }),
        });

        await addAppBuilderComponent(project, MESH_ENTRY, deps);

        expect(order).toEqual(['env', 'deploy']);
    });

    it('fails the add without deploying when the .env cannot be written', async () => {
        const project = createProject();
        const deps = createDeps({
            writeComponentEnv: jest.fn().mockRejectedValue(new Error('registry unavailable')),
        });

        const result = await addAppBuilderComponent(project, MESH_ENTRY, deps);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/registry unavailable/);
        // Deploying anyway is exactly the ENOENT failure this step exists to stop.
        expect(deps.deployMesh).not.toHaveBeenCalled();
    });
});

describe('integration add — no .env (catalog app repos ship none)', () => {
    it('does not write a .env for an integration', async () => {
        const project = createProject();
        const deps = createDeps();

        const result = await addAppBuilderComponent(project, INTEGRATION_ENTRY, deps);

        expect(result.success).toBe(true);
        expect(deps.writeComponentEnv).not.toHaveBeenCalled();
        expect(deps.deployApp).toHaveBeenCalledTimes(1);
    });
});

describe('mesh redeploy — refreshes the .env', () => {
    /** A project with the mesh already installed and deployed. */
    function deployedMeshProject(): Project {
        const project = createProject();
        project.componentInstances = {
            [MESH_ENTRY.id]: {
                id: MESH_ENTRY.id,
                name: MESH_ENTRY.name,
                status: 'ready',
                path: `/proj/components/${MESH_ENTRY.id}`,
            },
        };
        project.appBuilderComponents = {
            [MESH_ENTRY.id]: {
                kind: 'mesh',
                status: 'deployed',
                name: MESH_ENTRY.name,
                source: MESH_ENTRY.source,
            },
        };
        return project;
    }

    // Redeploy is the path a user reaches after changing Commerce credentials in
    // Configure. Reusing a stale .env would deploy the old endpoints and look
    // like the change silently failed.
    it('rewrites the .env before the deploy tail on a redeploy', async () => {
        const project = deployedMeshProject();
        const order: string[] = [];
        const deps = createDeps({
            writeComponentEnv: jest.fn(async () => {
                order.push('env');
            }),
            deployMesh: jest.fn(async () => {
                order.push('deploy');
                return { success: true, data: { meshId: 'm1', endpoint: 'https://mesh/graphql' } };
            }),
        });

        const result = await deployAppBuilderComponent(project, MESH_ENTRY.id, deps);

        expect(result.success).toBe(true);
        expect(order).toEqual(['env', 'deploy']);
    });
});
