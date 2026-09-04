/**
 * EDS Reset — step 12, the optional mesh redeploy.
 *
 * Two things are pinned here. First, the regression that named this suite: the
 * redeploy sources `existingMeshId` from REMOTE truth (`fetchMeshInfoFromAdobeIO`)
 * inside the SAME withOrgContext wrapper that targets the project's workspace,
 * not from local metadata — a remotely-deleted mesh with stale local metadata
 * once made reset run `api-mesh:update` against nothing.
 *
 * Second, what the step HANDS its collaborators and what it returns: the
 * preflight's arguments, the org target, the deploy arguments and its progress
 * relay, the persisted endpoint, and the exact partial result for each way the
 * redeploy can fail. Every collaborator here is mocked, so the call is what is
 * asserted.
 */

import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

jest.setTimeout(5000);

// =============================================================================
// Mocks — defined before imports
// =============================================================================

const mockWithOrgContext = jest.fn((_target: unknown, fn: () => Promise<unknown>) => fn());
jest.mock('@/core/shell/orgContextEnv', () => ({
    ...jest.requireActual('@/core/shell/orgContextEnv'),
    withOrgContext: (target: unknown, fn: () => Promise<unknown>) => mockWithOrgContext(target, fn),
}));

const mockEnsureProjectAdobeContext = jest.fn().mockResolvedValue({ ready: true });
jest.mock('@/features/authentication/services/ensureProjectAdobeContext', () => ({
    ensureProjectAdobeContext: (...args: unknown[]) => mockEnsureProjectAdobeContext(...args),
}));

const mockDeployMeshComponent = jest.fn();
jest.mock('@/features/mesh/services/meshDeployment', () => ({
    deployMeshComponent: (...args: unknown[]) => mockDeployMeshComponent(...args),
}));

const mockFetchMeshInfo = jest.fn();
jest.mock('@/features/mesh/services/meshVerifier', () => ({
    fetchMeshInfoFromAdobeIO: (...args: unknown[]) => mockFetchMeshInfo(...args),
}));

const mockUpdateMeshState = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/mesh/services/stalenessDetector', () => ({
    updateMeshState: (...args: unknown[]) => mockUpdateMeshState(...args),
}));

import { redeployApiMesh } from '@/features/eds/services/reset/edsResetMeshHelper';
import { createMeshDepsFake } from '../../../../helpers/meshDepsFake';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockHandlerContext } from '../../../../helpers/handlerContextTestHelpers';
import { createMockStateManager } from '../../../../helpers/stateManagerFake';
import { createMockProject } from '../../../../helpers/projectFake';

// =============================================================================
// Fixtures
// =============================================================================

const MESH_PATH = '/p/components/eds-accs-mesh';

/** The auth fake is built here so the suite can assert the deps object by identity. */
const meshDeps = createMeshDepsFake({
    authManager: {
        getTokenStatus: jest.fn(async () => ({ isAuthenticated: true })),
        getCachedOrganization: jest.fn(),
    },
});
const cachedOrganization = meshDeps.authManager.getCachedOrganization as jest.Mock;

function makeProject(overrides: Partial<Project> = {}): Project {
    return createMockProject({
        name: 'demo',
        path: '/p',
        adobe: { organization: 'org1', projectId: 'proj1', workspace: 'ws1' },
        componentInstances: {
            'eds-accs-mesh': {
                name: 'eds-accs-mesh',
                status: 'ready',
                id: 'eds-accs-mesh',
                subType: 'mesh',
                path: MESH_PATH,
                // Stale LOCAL id — the bug source; must NOT reach deployMeshComponent.
                metadata: { meshId: 'stale-local-mesh-id' },
            },
        },
        ...overrides,
    });
}

function makeContext(): HandlerContext {
    return createMockHandlerContext({
        logger: createMockLogger(),
        stateManager: createMockStateManager({
            saveProject: jest.fn().mockResolvedValue(undefined),
        }),
    });
}

async function run(project: Project = makeProject()) {
    const context = makeContext();
    const report = jest.fn();
    const result = await redeployApiMesh(
        project,
        'skukla',
        'repo',
        context,
        report,
        1,
        2,
        meshDeps
    );
    return { result, context, report, project };
}

/** The partial-success result the step returns when the mesh could not be redeployed. */
function partial(error: string) {
    return {
        success: true,
        filesReset: 1,
        contentCopied: 2,
        meshRedeployed: false,
        error,
        errorType: 'MESH_REDEPLOY_FAILED',
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    cachedOrganization.mockReturnValue(undefined);
    mockEnsureProjectAdobeContext.mockResolvedValue({ ready: true });
    mockFetchMeshInfo.mockResolvedValue({ meshId: 'remote-mesh-id' });
    mockDeployMeshComponent.mockResolvedValue({
        success: true,
        data: { meshId: 'remote-mesh-id', endpoint: 'https://mesh/graphql' },
    });
});

// =============================================================================
// Tests
// =============================================================================

describe('redeployApiMesh — remote-truth existingMeshId', () => {
    it('passes the REMOTE mesh id to deployMeshComponent (not local metadata)', async () => {
        await run();

        const existingMeshIdArg = mockDeployMeshComponent.mock.calls[0][4];
        expect(existingMeshIdArg).toBe('remote-mesh-id');
    });

    it('passes an EMPTY id when the remote has no mesh, even with stale local metadata', async () => {
        // The inverse-bug pin: remote mesh deleted out-of-band, local metadata stale
        // → deploy must run CREATE (empty id), not update-against-nothing.
        mockFetchMeshInfo.mockResolvedValue(null);

        await run();

        const existingMeshIdArg = mockDeployMeshComponent.mock.calls[0][4];
        expect(existingMeshIdArg).toBe('');
    });

    it('probes the remote INSIDE the org-context wrapper (targets the project workspace)', async () => {
        let probedInsideContext = false;
        mockWithOrgContext.mockImplementation(
            async (_target: unknown, fn: () => Promise<unknown>) => {
                mockFetchMeshInfo.mockImplementation(() => {
                    probedInsideContext = true;
                    return Promise.resolve({ meshId: 'remote-mesh-id' });
                });
                return fn();
            }
        );

        await run();

        expect(probedInsideContext).toBe(true);
    });
});

describe('redeployApiMesh — skip and preflight', () => {
    it('returns null without any preflight when the project has no mesh component', async () => {
        const { result, report } = await run(makeProject({ componentInstances: {} }));

        expect(result).toBeNull();
        expect(mockEnsureProjectAdobeContext).not.toHaveBeenCalled();
        expect(report).not.toHaveBeenCalled();
    });

    it('returns null when the mesh component has no path to deploy from', async () => {
        const project = makeProject();
        delete project.componentInstances!['eds-accs-mesh']!.path;

        const { result } = await run(project);

        expect(result).toBeNull();
        expect(mockEnsureProjectAdobeContext).not.toHaveBeenCalled();
    });

    it('runs the preflight with the auth service, the project and the reset wording', async () => {
        const { context, project, report } = await run();

        expect(report).toHaveBeenNthCalledWith(1, 12, 'Checking Adobe organization access...');
        expect(mockEnsureProjectAdobeContext).toHaveBeenCalledWith({
            authManager: meshDeps.authManager,
            project,
            logger: context.logger,
            logPrefix: '[EdsReset]',
            warningMessage:
                'Your Adobe I/O session has expired. Please sign in to continue the mesh redeployment.',
        });
    });

    it('skips the deploy with the org reason when the preflight is blocked by the org', async () => {
        mockEnsureProjectAdobeContext.mockResolvedValue({ ready: false, blockedBy: 'org' });

        const { result } = await run();

        expect(result).toStrictEqual(
            partial(
                "Reset completed but mesh redeployment skipped: the project's Adobe organization is not the one you're signed into"
            )
        );
        expect(mockWithOrgContext).not.toHaveBeenCalled();
    });

    it('skips the deploy with the auth reason when the preflight is blocked by auth', async () => {
        mockEnsureProjectAdobeContext.mockResolvedValue({
            ready: false,
            blockedBy: 'auth',
            cancelled: true,
        });

        const { result } = await run();

        expect(result).toStrictEqual(
            partial(
                'Reset completed but mesh redeployment skipped: Adobe I/O authentication required'
            )
        );
        expect(mockWithOrgContext).not.toHaveBeenCalled();
    });
});

describe('redeployApiMesh — the targeted deploy', () => {
    it('targets the project org/project/workspace, enriched from a matching cached org', async () => {
        cachedOrganization.mockReturnValue({ id: 'org1', code: 'ORG1', name: 'Org One' });

        await run();

        expect(mockWithOrgContext).toHaveBeenCalledWith(
            {
                orgId: 'org1',
                orgCode: 'ORG1',
                orgName: 'Org One',
                projectId: 'proj1',
                workspaceId: 'ws1',
            },
            expect.any(Function)
        );
    });

    it('deploys the mesh at the component path with the reset deps and logger', async () => {
        const { context, report } = await run();

        expect(report).toHaveBeenNthCalledWith(2, 12, 'Redeploying API Mesh...');
        expect(mockFetchMeshInfo).toHaveBeenCalledWith(meshDeps.commandManager, context.logger);
        expect(mockDeployMeshComponent).toHaveBeenCalledWith(
            MESH_PATH,
            meshDeps.commandManager,
            context.logger,
            expect.any(Function),
            'remote-mesh-id'
        );
    });

    it('relays deploy progress on step 12, preferring the sub-message', async () => {
        const { report } = await run();
        const onProgress: (message: string, subMessage?: string) => void =
            mockDeployMeshComponent.mock.calls[0][3];
        report.mockClear();

        onProgress('Deploying mesh', 'Uploading config');
        onProgress('Deploying mesh');
        onProgress('Deploying mesh', '');

        expect(report.mock.calls).toStrictEqual([
            [12, 'Uploading config'],
            [12, 'Deploying mesh'],
            [12, 'Deploying mesh'],
        ]);
    });

    it('persists the new endpoint on the project and returns null on success', async () => {
        const { result, context, project } = await run();

        expect(mockUpdateMeshState).toHaveBeenCalledWith(project, 'https://mesh/graphql');
        expect(context.stateManager.saveProject).toHaveBeenCalledWith(project);
        expect(result).toBeNull();
    });
});

describe('redeployApiMesh — partial results', () => {
    it('returns the deploy error as a partial result when the deploy reports failure', async () => {
        mockDeployMeshComponent.mockResolvedValue({
            success: false,
            error: 'aio api-mesh:update exited 1',
        });

        const { result, context } = await run();

        expect(result).toStrictEqual(
            partial('Reset completed but mesh redeployment failed: aio api-mesh:update exited 1')
        );
        expect(mockUpdateMeshState).not.toHaveBeenCalled();
        expect(context.stateManager.saveProject).not.toHaveBeenCalled();
    });

    it('falls back to a generic message when the failed deploy carries no error', async () => {
        mockDeployMeshComponent.mockResolvedValue({ success: false });

        const { result } = await run();

        expect(result).toStrictEqual(
            partial('Reset completed but mesh redeployment failed: Mesh deployment failed')
        );
    });

    it('treats a successful deploy with no endpoint as a failure and persists nothing', async () => {
        mockDeployMeshComponent.mockResolvedValue({
            success: true,
            data: { meshId: 'remote-mesh-id' },
        });

        const { result, context } = await run();

        expect(result).toStrictEqual(
            partial('Reset completed but mesh redeployment failed: Mesh deployment failed')
        );
        expect(mockUpdateMeshState).not.toHaveBeenCalled();
        expect(context.stateManager.saveProject).not.toHaveBeenCalled();
    });

    it('treats a successful deploy with no data at all as a failure', async () => {
        mockDeployMeshComponent.mockResolvedValue({ success: true });

        const { result } = await run();

        expect(result).toStrictEqual(
            partial('Reset completed but mesh redeployment failed: Mesh deployment failed')
        );
    });

    it('returns a thrown deploy error as a partial result', async () => {
        mockDeployMeshComponent.mockRejectedValue(new Error('spawn aio ENOENT'));

        const { result } = await run();

        expect(result).toStrictEqual(
            partial('Reset completed but mesh redeployment failed: spawn aio ENOENT')
        );
    });
});
