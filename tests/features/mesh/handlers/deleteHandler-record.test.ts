/**
 * delete-api-mesh — the project hears that its mesh is gone, and no deploy runs beside it.
 *
 * The agent's `delete_mesh` deleted the cloud mesh and saved nothing to the project: the card
 * went on reading "Deployed" over a mesh that no longer existed, until an on-open check noticed.
 * It also took no `meshDeployLock`, so a delete could run in the middle of a deploy
 * (PL-104 fix 5, F266).
 */

const mockWithOrgContext = jest.fn((_target: unknown, fn: () => Promise<unknown>) => fn());
jest.mock('@/core/shell/orgContextEnv', () => ({
    ...jest.requireActual('@/core/shell/orgContextEnv'),
    withOrgContext: (target: unknown, fn: () => Promise<unknown>) => mockWithOrgContext(target, fn),
}));
jest.mock('@/core/di/serviceLocator');

import { handleDeleteApiMesh } from '@/features/mesh/handlers/deleteHandler';
import { meshDeployLock } from '@/features/mesh/services/meshDeployLock';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { servicesFor } from './deleteHandler.testUtils';

const OWN_WORKSPACE = 'project-workspace-id';

function deployedProject(): Project {
    return createMockProject({
        adobe: { organization: 'org@AdobeOrg', projectId: 'proj-1', workspace: OWN_WORKSPACE },
        componentInstances: {
            'eds-commerce-mesh': {
                id: 'eds-commerce-mesh',
                name: 'API Mesh',
                subType: 'mesh',
                status: 'deployed',
            },
        },
        appBuilderComponents: {
            mesh: {
                kind: 'mesh',
                source: { owner: 'adobe', repo: 'commerce-mesh' },
                status: 'deployed',
                endpoint: 'https://mesh.example/graphql',
                lastDeployed: '2026-11-01T00:00:00.000Z',
                sourceHash: 'abc',
                envVars: { ADOBE_CATALOG_ENDPOINT: 'https://catalog.example' },
                providesEnvVars: { MESH_ENDPOINT: 'https://mesh.example/graphql' },
            },
        },
    });
}

let execute: jest.Mock;

function contextFor(project: Project | undefined): HandlerContext {
    return createMockHandlerContext({
        logger: createMockLogger(),
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(project),
        }),
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    execute = jest.fn().mockResolvedValue({ code: 0, stdout: 'deleted', stderr: '' });
    servicesFor({ execute });
});

describe('the project records its mesh as gone', () => {
    it('clears the deploy record and keeps what names the mesh, then saves', async () => {
        const project = deployedProject();
        const context = contextFor(project);

        const result = await handleDeleteApiMesh(context, { workspaceId: OWN_WORKSPACE });

        expect(result).toEqual({ success: true });
        expect(context.stateManager.saveProject).toHaveBeenCalledTimes(1);
        const saved = (context.stateManager.saveProject as jest.Mock).mock.calls[0][0] as Project;
        expect(saved.appBuilderComponents?.mesh).toStrictEqual({
            kind: 'mesh',
            source: { owner: 'adobe', repo: 'commerce-mesh' },
            status: 'not-deployed',
            endpoint: undefined,
            lastDeployed: undefined,
            sourceHash: undefined,
            envVars: undefined,
            providesEnvVars: { MESH_ENDPOINT: 'https://mesh.example/graphql' },
        });
        expect(saved.componentInstances?.['eds-commerce-mesh']?.status).toBe('ready');
    });

    it("records nothing when the deleted mesh was another workspace's", async () => {
        const context = contextFor(deployedProject());

        const result = await handleDeleteApiMesh(context, {
            workspaceId: 'someone-elses-workspace',
        });

        expect(result).toEqual({ success: true });
        expect(context.stateManager.saveProject).not.toHaveBeenCalled();
    });

    it('records nothing when the delete failed', async () => {
        execute.mockResolvedValue({ code: 1, stdout: '', stderr: 'mesh not found' });
        const context = contextFor(deployedProject());

        const result = await handleDeleteApiMesh(context, { workspaceId: OWN_WORKSPACE });

        expect(result.success).toBe(false);
        expect(context.stateManager.saveProject).not.toHaveBeenCalled();
    });
});

describe('no deploy runs beside a delete', () => {
    it('refuses while a mesh deploy is running, and never reaches the CLI', async () => {
        const release = await meshDeployLock.acquire();
        try {
            const result = await handleDeleteApiMesh(contextFor(deployedProject()), {
                workspaceId: OWN_WORKSPACE,
            });

            expect(result).toEqual({ success: false, error: 'A mesh deploy is already running.' });
            expect(execute).not.toHaveBeenCalled();
        } finally {
            release();
        }
    });

    it('holds the mesh lock while it deletes, and lets go after', async () => {
        let lockedDuringDelete: boolean | undefined;
        execute.mockImplementation(async () => {
            lockedDuringDelete = meshDeployLock.isLocked();
            return { code: 0, stdout: 'deleted', stderr: '' };
        });

        await handleDeleteApiMesh(contextFor(deployedProject()), { workspaceId: OWN_WORKSPACE });

        expect(lockedDuringDelete).toBe(true);
        expect(meshDeployLock.isLocked()).toBe(false);
    });
});
