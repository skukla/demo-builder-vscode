/**
 * Project Reset Service - Mesh Redeployment Org-Context Tests
 *
 * Phase 4a migration: handleMeshRedeployment no longer mutates the shared
 * `aio` global via selectOrganization/selectProject/selectWorkspace. It wraps
 * the mesh redeploy in `withOrgContext(projectTarget, ...)` so the deploy
 * targets the project's KNOWN org/project/workspace through per-invocation
 * AIO_CONSOLE_* env — without clobbering concurrent processes.
 */

import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

jest.setTimeout(5000);

// =============================================================================
// Mocks — defined before imports
// =============================================================================

const mockSelectOrganization = jest.fn().mockResolvedValue(true);
const mockSelectProject = jest.fn().mockResolvedValue(true);
const mockSelectWorkspace = jest.fn().mockResolvedValue(true);
const mockGetCachedOrganization = jest.fn().mockReturnValue(undefined);

jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(() => ({
            selectOrganization: mockSelectOrganization,
            selectProject: mockSelectProject,
            selectWorkspace: mockSelectWorkspace,
            getCachedOrganization: mockGetCachedOrganization,
        })),
        getCommandExecutor: jest.fn(() => ({})),
    },
}));

const mockEnsureAdobeIOAuth = jest.fn().mockResolvedValue({ authenticated: true });
jest.mock('@/core/auth/adobeAuthGuard', () => ({
    ensureAdobeIOAuth: (...args: unknown[]) => mockEnsureAdobeIOAuth(...args),
}));

// withOrgContext records the target then runs the callback (no global mutation).
const mockWithOrgContext = jest.fn(
    (_target: unknown, fn: () => Promise<unknown>) => fn(),
);
jest.mock('@/core/shell', () => ({
    ...jest.requireActual('@/core/shell'),
    withOrgContext: (target: unknown, fn: () => Promise<unknown>) =>
        mockWithOrgContext(target, fn),
}));

const mockDeployMeshComponent = jest.fn().mockResolvedValue({
    success: true,
    data: { endpoint: 'https://mesh.example.com/graphql' },
});
jest.mock('@/features/mesh/services/meshDeployment', () => ({
    deployMeshComponent: (...args: unknown[]) => mockDeployMeshComponent(...args),
}));

jest.mock('@/features/mesh/services/meshVerifier', () => ({
    fetchMeshInfoFromAdobeIO: jest.fn().mockResolvedValue({ meshId: 'mesh-123' }),
}));

jest.mock('@/features/mesh/services/stalenessDetector', () => ({
    updateMeshState: jest.fn(),
}));

const mockGetMeshComponentInstance = jest.fn();
jest.mock('@/types/typeGuards', () => ({
    getMeshComponentInstance: (...args: unknown[]) => mockGetMeshComponentInstance(...args),
}));

// =============================================================================
// Imports (after mocks)
// =============================================================================

import { handleMeshRedeployment } from '@/features/lifecycle/services/projectResetService';

// =============================================================================
// Helpers
// =============================================================================

function createProject(): Project {
    return {
        name: 'test-project',
        adobe: {
            organization: 'org-123',
            projectId: 'proj-456',
            workspace: 'ws-789',
        },
    } as unknown as Project;
}

function createContext(): HandlerContext {
    return {
        logger: { info: jest.fn(), debug: jest.fn(), error: jest.fn(), warn: jest.fn() },
        stateManager: { saveProject: jest.fn().mockResolvedValue(undefined) },
    } as unknown as HandlerContext;
}

const progress = { report: jest.fn() };
const vscode = { window: { showWarningMessage: jest.fn() } } as unknown as typeof import('vscode');

// =============================================================================
// Tests
// =============================================================================

describe('Project Reset Service - Mesh Redeployment Org-Context', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
        mockDeployMeshComponent.mockResolvedValue({
            success: true,
            data: { endpoint: 'https://mesh.example.com/graphql' },
        });
        mockGetMeshComponentInstance.mockReturnValue({ path: '/test/mesh' });
        mockGetCachedOrganization.mockReturnValue(undefined);
    });

    it('should wrap the mesh redeploy in withOrgContext and never mutate the aio global', async () => {
        const project = createProject();
        const context = createContext();

        await handleMeshRedeployment(project, context, '[ProjectReset]', progress, vscode);

        expect(mockWithOrgContext).toHaveBeenCalledTimes(1);
        expect(mockDeployMeshComponent).toHaveBeenCalledTimes(1);
        expect(mockSelectOrganization).not.toHaveBeenCalled();
        expect(mockSelectProject).not.toHaveBeenCalled();
        expect(mockSelectWorkspace).not.toHaveBeenCalled();
    });

    it('should target the project org/project/workspace via withOrgContext', async () => {
        const project = createProject();
        const context = createContext();

        await handleMeshRedeployment(project, context, '[ProjectReset]', progress, vscode);

        expect(mockWithOrgContext).toHaveBeenCalledWith(
            expect.objectContaining({
                orgId: 'org-123',
                projectId: 'proj-456',
                workspaceId: 'ws-789',
            }),
            expect.any(Function),
        );
    });

    it('should resolve org code/name from the cached org when its id matches', async () => {
        mockGetCachedOrganization.mockReturnValue({
            id: 'org-123', code: 'CODE@AdobeOrg', name: 'Acme Inc',
        });
        const project = createProject();
        const context = createContext();

        await handleMeshRedeployment(project, context, '[ProjectReset]', progress, vscode);

        expect(mockWithOrgContext).toHaveBeenCalledWith(
            expect.objectContaining({
                orgId: 'org-123',
                orgCode: 'CODE@AdobeOrg',
                orgName: 'Acme Inc',
            }),
            expect.any(Function),
        );
    });

    it('should NOT borrow cached org code/name when the cached org id differs', async () => {
        mockGetCachedOrganization.mockReturnValue({
            id: 'org-OTHER', code: 'OTHER@AdobeOrg', name: 'Other Org',
        });
        const project = createProject();
        const context = createContext();

        await handleMeshRedeployment(project, context, '[ProjectReset]', progress, vscode);

        const target = mockWithOrgContext.mock.calls[0][0] as Record<string, unknown>;
        expect(target.orgId).toBe('org-123');
        expect(target.orgCode).toBeUndefined();
        expect(target.orgName).toBeUndefined();
    });

    it('should return early (no targeting) when auth fails', async () => {
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false });
        const project = createProject();
        const context = createContext();

        const result = await handleMeshRedeployment(project, context, '[ProjectReset]', progress, vscode);

        expect(result).toEqual({ redeployed: false });
        expect(mockWithOrgContext).not.toHaveBeenCalled();
        expect(mockDeployMeshComponent).not.toHaveBeenCalled();
    });

    it('should return null when the project has no mesh component', async () => {
        mockGetMeshComponentInstance.mockReturnValue(undefined);
        const project = createProject();
        const context = createContext();

        const result = await handleMeshRedeployment(project, context, '[ProjectReset]', progress, vscode);

        expect(result).toBeNull();
        expect(mockWithOrgContext).not.toHaveBeenCalled();
    });
});
