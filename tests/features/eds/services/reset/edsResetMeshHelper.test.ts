/**
 * EDS Reset — mesh redeploy sources existingMeshId from REMOTE truth
 *
 * Regression (review finding on the create→update fallback fix): this was the
 * only deployMeshComponent caller sourcing `existingMeshId` from LOCAL state
 * (`meshComponent.metadata.meshId`) — the inverse of the "already has a mesh"
 * bug. A remotely-deleted mesh with stale local metadata made reset run
 * `api-mesh:update` against nothing and fail. Pin: the id comes from
 * `fetchMeshInfoFromAdobeIO` (like deployMeshHeadless and projectResetService),
 * inside the SAME withOrgContext wrapper that targets the project's workspace.
 */

import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

jest.setTimeout(5000);

// =============================================================================
// Mocks — defined before imports
// =============================================================================

const mockWithOrgContext = jest.fn((_target: unknown, fn: () => Promise<unknown>) => fn());
jest.mock('@/core/shell', () => ({
    ...jest.requireActual('@/core/shell'),
    withOrgContext: (target: unknown, fn: () => Promise<unknown>) => mockWithOrgContext(target, fn),
}));

jest.mock(
    'vscode',
    () => ({
        window: { showWarningMessage: jest.fn(), showInformationMessage: jest.fn() },
        ProgressLocation: { Notification: 15 },
        Uri: { parse: jest.fn((url: string) => ({ toString: () => url })) },
    }),
    { virtual: true }
);

jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(() => ({
            getCachedOrganization: jest.fn().mockReturnValue(undefined),
        })),
        getCommandExecutor: jest.fn(() => ({})),
    },
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

/** Shared fake (PL-16) — this was one of eleven hand-rolled copies. */
const meshDeps = createMeshDepsFake();


// =============================================================================
// Fixtures
// =============================================================================

function makeProject(): Project {
    return {
        name: 'demo',
        path: '/p',
        adobe: { organization: { id: 'org1', code: 'ORG1', name: 'Org' } },
        componentInstances: {
            'eds-accs-mesh': {
                id: 'eds-accs-mesh',
                subType: 'mesh',
                path: '/p/components/eds-accs-mesh',
                // Stale LOCAL id — the bug source; must NOT reach deployMeshComponent.
                metadata: { meshId: 'stale-local-mesh-id' },
            },
        },
    } as unknown as Project;
}

function makeContext(): HandlerContext {
    return {
        logger: createMockLogger(),
        stateManager: { saveProject: jest.fn().mockResolvedValue(undefined) },
    } as unknown as HandlerContext;
}

async function run(): Promise<unknown> {
    return redeployApiMesh(makeProject(), 'skukla', 'repo', makeContext(), jest.fn(), 1, 2, meshDeps);
}

// =============================================================================
// Tests
// =============================================================================

describe('redeployApiMesh — remote-truth existingMeshId', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockEnsureProjectAdobeContext.mockResolvedValue({ ready: true });
        mockDeployMeshComponent.mockResolvedValue({
            success: true,
            data: { meshId: 'remote-mesh-id', endpoint: 'https://mesh/graphql' },
        });
    });

    it('passes the REMOTE mesh id to deployMeshComponent (not local metadata)', async () => {
        mockFetchMeshInfo.mockResolvedValue({ meshId: 'remote-mesh-id' });

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
        mockFetchMeshInfo.mockResolvedValue({ meshId: 'remote-mesh-id' });
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
