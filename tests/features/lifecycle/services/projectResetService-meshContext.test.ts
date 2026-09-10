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

const mockGetCachedOrganization = jest.fn().mockReturnValue(undefined);
/**
 * The org-reachability check (`detectProjectOrgMismatch`) lists the token's
 * orgs and looks for the project's. Until 2026-09-02 the auth fake was `{}`
 * cast to the service, so this read THREW, the check swallowed the error as
 * "could not run, proceed", and the redeploy went ahead. With the real fake
 * the list must actually contain the project's org for the same path to run.
 */
const mockGetOrganizations = jest.fn();

/** CONVERTED 2026-08-28 (ADR-015): the executor is handed in, not fetched. */
const executor = createMockCommandExecutor({ execute: jest.fn() });
/** ADR-015: the auth service is handed in too. */
const authManagerFake = createMockAuthenticationService({
    getCachedOrganization: mockGetCachedOrganization,
    getOrganizations: mockGetOrganizations,
});

jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(() => ({
            getCachedOrganization: mockGetCachedOrganization,
        })),
    },
}));

const mockEnsureAdobeIOAuth = jest.fn().mockResolvedValue({ authenticated: true });
jest.mock('@/core/auth/adobeAuthGuard', () => ({
    ensureAdobeIOAuth: (...args: unknown[]) => mockEnsureAdobeIOAuth(...args),
}));

// withOrgContext records the target then runs the callback (no global mutation).
const mockWithOrgContext = jest.fn((_target: unknown, fn: () => Promise<unknown>) => fn());
jest.mock('@/core/shell/orgContextEnv', () => ({
    ...jest.requireActual('@/core/shell/orgContextEnv'),
    withOrgContext: (target: unknown, fn: () => Promise<unknown>) => mockWithOrgContext(target, fn),
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
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockProject } from '../../../helpers/projectFake';

// =============================================================================
// Helpers
// =============================================================================

function createProject(): Project {
    return createMockProject({
        name: 'test-project',
        adobe: {
            organization: 'org-123',
            projectId: 'proj-456',
            workspace: 'ws-789',
        },
    });
}

function createContext(): HandlerContext {
    return createMockHandlerContext({
        logger: createMockLogger(),
        stateManager: createMockStateManager({
            saveProject: jest.fn().mockResolvedValue(undefined),
        }),
    });
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
        mockGetOrganizations.mockResolvedValue([
            { id: 'org-123', code: 'CODE@AdobeOrg', name: 'Acme Inc' },
        ]);
    });

    it('should wrap the mesh redeploy in withOrgContext', async () => {
        const project = createProject();
        const context = createContext();

        await handleMeshRedeployment(
            project,
            context,
            '[ProjectReset]',
            progress,
            vscode,
            executor,
            authManagerFake
        );

        expect(mockWithOrgContext).toHaveBeenCalledTimes(1);
        expect(mockDeployMeshComponent).toHaveBeenCalledTimes(1);
    });

    it('should target the project org/project/workspace via withOrgContext', async () => {
        const project = createProject();
        const context = createContext();

        await handleMeshRedeployment(
            project,
            context,
            '[ProjectReset]',
            progress,
            vscode,
            executor,
            authManagerFake
        );

        expect(mockWithOrgContext).toHaveBeenCalledWith(
            expect.objectContaining({
                orgId: 'org-123',
                projectId: 'proj-456',
                workspaceId: 'ws-789',
            }),
            expect.any(Function)
        );
    });

    it('should resolve org code/name from the cached org when its id matches', async () => {
        mockGetCachedOrganization.mockReturnValue({
            id: 'org-123',
            code: 'CODE@AdobeOrg',
            name: 'Acme Inc',
        });
        const project = createProject();
        const context = createContext();

        await handleMeshRedeployment(
            project,
            context,
            '[ProjectReset]',
            progress,
            vscode,
            executor,
            authManagerFake
        );

        expect(mockWithOrgContext).toHaveBeenCalledWith(
            expect.objectContaining({
                orgId: 'org-123',
                orgCode: 'CODE@AdobeOrg',
                orgName: 'Acme Inc',
            }),
            expect.any(Function)
        );
    });

    it('should NOT borrow cached org code/name when the cached org id differs', async () => {
        mockGetCachedOrganization.mockReturnValue({
            id: 'org-OTHER',
            code: 'OTHER@AdobeOrg',
            name: 'Other Org',
        });
        const project = createProject();
        const context = createContext();

        await handleMeshRedeployment(
            project,
            context,
            '[ProjectReset]',
            progress,
            vscode,
            executor,
            authManagerFake
        );

        const target = mockWithOrgContext.mock.calls[0][0] as Record<string, unknown>;
        expect(target.orgId).toBe('org-123');
        expect(target.orgCode).toBeUndefined();
        expect(target.orgName).toBeUndefined();
    });

    it('should return early (no targeting) when auth fails', async () => {
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false });
        const project = createProject();
        const context = createContext();

        const result = await handleMeshRedeployment(
            project,
            context,
            '[ProjectReset]',
            progress,
            vscode,
            executor,
            authManagerFake
        );

        expect(result).toEqual({ redeployed: false });
        expect(mockWithOrgContext).not.toHaveBeenCalled();
        expect(mockDeployMeshComponent).not.toHaveBeenCalled();
    });

    it('should return null when the mesh component has no path', async () => {
        mockGetMeshComponentInstance.mockReturnValue({ id: 'commerce-mesh', path: undefined });

        const result = await handleMeshRedeployment(
            createProject(),
            createContext(),
            '[ProjectReset]',
            progress,
            vscode,
            executor,
            authManagerFake
        );

        expect(result).toBeNull();
        expect(mockEnsureAdobeIOAuth).not.toHaveBeenCalled();
    });

    it('runs the auth preflight against THIS project with the reset wording, before targeting', async () => {
        const project = createProject();
        const context = createContext();

        await handleMeshRedeployment(
            project,
            context,
            '[Dashboard]',
            progress,
            vscode,
            executor,
            authManagerFake
        );

        expect(mockEnsureAdobeIOAuth).toHaveBeenCalledWith(
            expect.objectContaining({
                authManager: authManagerFake,
                logger: context.logger,
                logPrefix: '[Dashboard]',
                warningMessage: expect.stringContaining('skip to finish without redeploying'),
            })
        );
        expect(mockEnsureAdobeIOAuth.mock.invocationCallOrder[0]).toBeLessThan(
            mockWithOrgContext.mock.invocationCallOrder[0]
        );
        expect(progress.report).toHaveBeenCalledWith({
            message: 'Checking Adobe organization access…',
        });
    });

    it('deploys the mesh at the component path through the handed-in executor and logger', async () => {
        const project = createProject();
        const context = createContext();

        await handleMeshRedeployment(
            project,
            context,
            '[ProjectReset]',
            progress,
            vscode,
            executor,
            authManagerFake
        );

        expect(mockDeployMeshComponent).toHaveBeenCalledWith(
            '/test/mesh',
            executor,
            context.logger,
            expect.any(Function),
            'mesh-123'
        );
        expect(progress.report).toHaveBeenCalledWith({ message: 'Redeploying API Mesh…' });
    });

    it('relays deploy progress to the notification, preferring the sub-message', async () => {
        await handleMeshRedeployment(
            createProject(),
            createContext(),
            '[ProjectReset]',
            progress,
            vscode,
            executor,
            authManagerFake
        );

        const onProgress = mockDeployMeshComponent.mock.calls[0][3] as (
            message: string,
            subMessage?: string
        ) => void;
        onProgress('Deploying mesh', 'Provisioning…');
        expect(progress.report).toHaveBeenLastCalledWith({ message: 'Provisioning…' });
        onProgress('Deploying mesh', undefined);
        expect(progress.report).toHaveBeenLastCalledWith({ message: 'Deploying mesh' });
    });

    describe('when the deploy fails', () => {
        it('lands the project on ready, warns the SC, and returns the early result', async () => {
            mockDeployMeshComponent.mockResolvedValue({ success: false, error: 'aio exploded' });
            const project = createProject();
            const context = createContext();

            const result = await handleMeshRedeployment(
                project,
                context,
                '[ProjectReset]',
                progress,
                vscode,
                executor,
                authManagerFake
            );

            expect(result).toEqual({
                redeployed: false,
                earlyReturn: {
                    success: true,
                    error: 'Reset completed but mesh redeployment failed: aio exploded',
                },
            });
            expect(project.status).toBe('ready');
            expect(context.stateManager.saveProject).toHaveBeenCalledWith(project);
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                '"test-project" reset successfully, but mesh redeployment failed: aio exploded. ' +
                    'You can redeploy manually from the dashboard.'
            );
            const { updateMeshState } = require('@/features/mesh/services/stalenessDetector');
            expect(updateMeshState).not.toHaveBeenCalled();
        });

        it('a failure without a message gets the generic one', async () => {
            mockDeployMeshComponent.mockResolvedValue({ success: false });

            const result = await handleMeshRedeployment(
                createProject(),
                createContext(),
                '[ProjectReset]',
                progress,
                vscode,
                executor,
                authManagerFake
            );

            expect(result?.earlyReturn?.error).toBe(
                'Reset completed but mesh redeployment failed: Mesh deployment failed'
            );
        });

        it('a "success" that carries no data is a failure too', async () => {
            mockDeployMeshComponent.mockResolvedValue({ success: true });

            const result = await handleMeshRedeployment(
                createProject(),
                createContext(),
                '[ProjectReset]',
                progress,
                vscode,
                executor,
                authManagerFake
            );

            expect(result?.redeployed).toBe(false);
            expect(result?.earlyReturn?.error).toBe(
                'Reset completed but mesh redeployment failed: Mesh deployment failed'
            );
        });

        it('a thrown deploy is reported the same way', async () => {
            mockDeployMeshComponent.mockRejectedValue(new Error('socket hang up'));

            const result = await handleMeshRedeployment(
                createProject(),
                createContext(),
                '[ProjectReset]',
                progress,
                vscode,
                executor,
                authManagerFake
            );

            expect(result?.earlyReturn?.error).toBe(
                'Reset completed but mesh redeployment failed: socket hang up'
            );
        });
    });

    it('should return null when the project has no mesh component', async () => {
        mockGetMeshComponentInstance.mockReturnValue(undefined);
        const project = createProject();
        const context = createContext();

        const result = await handleMeshRedeployment(
            project,
            context,
            '[ProjectReset]',
            progress,
            vscode,
            executor,
            authManagerFake
        );

        expect(result).toBeNull();
        expect(mockWithOrgContext).not.toHaveBeenCalled();
    });

    // ADR-011 D3 Step 09: reset preserves ALL keyed deployables. The mesh entry
    // is refreshed through the updateMeshState writer chokepoint; keyed
    // integration siblings must survive the reset untouched (reset re-clones
    // their folders but never discards their deploy records).
    describe('keyed deployables through reset (D3 Step 09)', () => {
        function createKeyedProject(): Project {
            const project = createProject();
            project.appBuilderComponents = {
                mesh: {
                    kind: 'mesh',
                    status: 'deployed',
                    source: { owner: '', repo: '' },
                    endpoint: 'https://stale-mesh/graphql',
                },
                'acme-widget': {
                    kind: 'integration',
                    status: 'deployed',
                    source: { owner: 'acme', repo: 'widget' },
                    url: 'https://acme.adobeio-static.net',
                },
                'beta-widget': {
                    kind: 'integration',
                    status: 'deployed',
                    source: { owner: 'beta', repo: 'widget' },
                    url: 'https://beta.adobeio-static.net',
                },
            };
            return project;
        }

        it('refreshes the keyed mesh entry via the updateMeshState chokepoint', async () => {
            const { updateMeshState } = require('@/features/mesh/services/stalenessDetector');
            const {
                recordDeployOutcome,
            } = require('@/features/app-builder/services/appBuilderDeployOutcome');
            // Mirror the real chokepoint: land the outcome on the keyed entry.
            (updateMeshState as jest.Mock).mockImplementation(
                async (p: Project, endpoint?: string) => {
                    recordDeployOutcome(p, 'mesh', 'commerce-mesh', {
                        status: 'deployed',
                        endpoint,
                        lastDeployed: new Date().toISOString(),
                    });
                }
            );

            const project = createKeyedProject();
            const result = await handleMeshRedeployment(
                project,
                createContext(),
                '[ProjectReset]',
                progress,
                vscode,
                executor,
                authManagerFake
            );

            expect(result).toEqual({ redeployed: true });
            expect(updateMeshState).toHaveBeenCalledWith(
                project,
                'https://mesh.example.com/graphql'
            );
            expect(project.appBuilderComponents?.mesh?.endpoint).toBe(
                'https://mesh.example.com/graphql'
            );
        });

        it('leaves keyed integration siblings untouched by the mesh redeploy', async () => {
            const project = createKeyedProject();

            await handleMeshRedeployment(
                project,
                createContext(),
                '[ProjectReset]',
                progress,
                vscode,
                executor,
                authManagerFake
            );

            expect(project.appBuilderComponents?.['acme-widget']).toEqual(
                expect.objectContaining({
                    url: 'https://acme.adobeio-static.net',
                    status: 'deployed',
                })
            );
            expect(project.appBuilderComponents?.['beta-widget']).toEqual(
                expect.objectContaining({
                    url: 'https://beta.adobeio-static.net',
                    status: 'deployed',
                })
            );
        });
    });
});
