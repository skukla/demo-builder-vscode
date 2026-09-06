/**
 * appManagementInstallHandlers — the AB-5 pair.
 *
 * `getAppBuilderInstallStatus` (persisted record + the app's LIVE state) and
 * `installAppBuilderComponent` (re-run the install pass without a redeploy).
 * The client, the runner deps, the catalog loader, and the guards are mocked;
 * assertions pin the ARGUMENTS each collaborator receives and the persisted
 * outcome — a mock cannot see a malformed call.
 */

import type { AppBuilderComponentState, Project } from '@/types/base';

// ---- the progress notification, RECORDED rather than mocked away -----------
// `vscode` is walled twice in this suite's import chain: the shared testUtils
// registers its own factory, but only AFTER the subject has bound the file mock
// (this suite is on mock-wall-import-order's ledger). So the vscode a test can
// reach is not the one the handler reports progress to. Recording here — above
// every import — is what makes the notification observable at all. Plain
// functions, not jest.fn, so no mock reset can quietly empty them.
const mockProgressTitles: string[] = [];
const mockProgressSteps: unknown[] = [];
jest.mock('vscode', () => {
    const vscode = jest.requireActual('../../../__mocks__/vscode') as {
        window: Record<string, unknown>;
    };
    vscode.window.withProgress = async (
        options: { title: string },
        task: (p: { report: (value: { message?: string }) => void }) => unknown,
    ) => {
        mockProgressTitles.push(options.title);
        return task({ report: (value) => mockProgressSteps.push(value?.message) });
    };
    return vscode;
});

// ---- runner deps + auth resolver (all mocked) ------------------------------
const mockInstallAppManagement = jest.fn();
// Declared with its arguments, not as a bare `jest.fn(() => ...)`: the second
// one is the progress adapter, and a zero-arity signature makes it unreadable.
const mockBuildDefaultRunnerDeps = jest.fn((..._args: unknown[]) => ({
    installAppManagement: mockInstallAppManagement,
}));
const mockBuildRunnerDepsContext = jest.fn(async () => ({}));
const mockResolveAppManagementAuth = jest.fn();
jest.mock('@/features/project-creation/services/appBuilderComponentRunnerDeps', () => ({
    buildDefaultRunnerDeps: (...a: unknown[]) => mockBuildDefaultRunnerDeps(...(a as [])),
    buildRunnerDepsContext: (...a: unknown[]) => mockBuildRunnerDepsContext(...(a as [])),
    resolveAppManagementAuth: (...a: unknown[]) => mockResolveAppManagementAuth(...a),
}));

// ---- the App Management client (status read constructs it directly) --------
const mockGetInstallationState = jest.fn();
const mockClientCtor = jest.fn();
jest.mock('@/features/app-builder/services/appManagementClient', () => ({
    AppManagementClient: class {
        constructor(...args: unknown[]) {
            mockClientCtor(...args);
        }
        getInstallationState = (...a: unknown[]) => mockGetInstallationState(...a);
    },
}));

// ---- catalog loader (lifecycle resolution) ---------------------------------
const mockGetAppBuilderComponentEntry = jest.fn();
const mockBuildCustomIntegrationEntry = jest.fn();
jest.mock('@/features/components/services/appBuilderComponentCatalogLoader', () => ({
    getAppBuilderComponentEntry: (...a: unknown[]) => mockGetAppBuilderComponentEntry(...a),
    buildCustomIntegrationEntry: (...a: unknown[]) => mockBuildCustomIntegrationEntry(...(a as [])),
    entryFitsProjectAxes: jest.fn().mockReturnValue(true),
}));

// ---- DI (runGuards resolves the auth service through it) -------------------
// Mocked HERE, not only via dashboardHandlers.testUtils: that module's own
// jest.mock('@/core/di/serviceLocator') registers after this spec's SUT import chain has
// already required the real ServiceLocator.
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(() => ({
            getTokenManager: () => ({ inspectToken: jest.fn(async () => ({ valid: false })) }),
            getCachedOrganization: jest.fn(),
            getS2SDeployCredentials: jest.fn(),
        })),
        // ADR-015 (2026-08-28): the handler resolves these when assembling
        // runner deps, so the module mock must answer them.
        getCommandExecutor: jest.fn(() => ({ execute: jest.fn() })),
    },
}));

// ---- guards ----------------------------------------------------------------
const mockEnsureAdobeIOAuth = jest.fn();
jest.mock('@/core/auth/adobeAuthGuard', () => ({
    ensureAdobeIOAuth: (...a: unknown[]) => mockEnsureAdobeIOAuth(...a),
}));
const mockDetectProjectOrgMismatch = jest.fn();
jest.mock('@/features/authentication/services/detectProjectOrgMismatch', () => ({
    detectProjectOrgMismatch: (...a: unknown[]) => mockDetectProjectOrgMismatch(...a),
}));

// ---- dashboard channels (imported by the shared handler module) ------------
jest.mock('@/features/dashboard/handlers/dashboardHandlers', () => ({
    handleRequestStatus: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock('@/features/dashboard/commands/showDashboard', () => ({
    ProjectDashboardWebviewCommand: {
        sendAppBuilderComponentStatusUpdate: jest.fn(),
        sendAppBuilderComponentsSnapshot: jest.fn(),
        refreshStatus: jest.fn(),
    },
}));

import {
    handleGetAppBuilderInstallStatus,
    handleInstallAppBuilderComponent,
} from '@/features/dashboard/handlers/appManagementInstallHandlers';
import { setupMocks } from './dashboardHandlers.testUtils';
import { ErrorCode } from '@/types/errorCodes';

const APP_URLS = {
    'app-management/installation':
        'https://ns.adobeioruntime.net/api/v1/web/app-management/installation',
};

const KIT_STATE: AppBuilderComponentState = {
    kind: 'integration',
    status: 'deployed',
    name: 'Kit App',
    source: { owner: 'adobe', repo: 'commerce-integration-starter-kit', branch: 'main' },
    deployedUrls: APP_URLS,
    installation: { status: 'failed', detail: 'earlier failure', at: '2026-08-27T00:00:00Z' },
};

function kitProject(): Partial<Project> {
    return { appBuilderComponents: { 'kit-app': { ...KIT_STATE } } };
}

function mockDeveloperPermissions(): void {
    const { ServiceLocator } = require('@/core/di/serviceLocator');
    ServiceLocator.getAuthenticationService().testDeveloperPermissions = jest
        .fn()
        .mockResolvedValue({ hasPermissions: true });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockProgressTitles.length = 0;
    mockProgressSteps.length = 0;
    mockGetAppBuilderComponentEntry.mockReturnValue({
        id: 'kit-app',
        lifecycle: 'app-management',
    });
    mockResolveAppManagementAuth.mockResolvedValue({
        accessToken: 'fake-test-pw-not-a-secret',
        imsOrgId: 'ABC@AdobeOrg',
    });
    mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
    mockDetectProjectOrgMismatch.mockResolvedValue({ reachable: true });
    mockInstallAppManagement.mockResolvedValue({ status: 'installed' });
    mockGetInstallationState.mockResolvedValue({
        id: 'i-1',
        status: 'succeeded',
        startedAt: '2026-08-27T01:00:00Z',
        completedAt: '2026-08-27T01:02:00Z',
    });
});



describe('handleGetAppBuilderInstallStatus', () => {
    it('reads the LIVE state from the app base URL and returns it with the persisted record', async () => {
        const { mockContext } = setupMocks(kitProject());

        const result = (await handleGetAppBuilderInstallStatus(mockContext, {
            id: 'kit-app',
        })) as { success: boolean; data: Record<string, unknown> };

        expect(result.success).toBe(true);
        expect(mockClientCtor).toHaveBeenCalledWith(
            'https://ns.adobeioruntime.net/api/v1/web/app-management',
            expect.objectContaining({ imsOrgId: 'ABC@AdobeOrg' })
        );
        expect(result.data).toEqual({
            id: 'kit-app',
            persisted: KIT_STATE.installation,
            live: {
                status: 'succeeded',
                startedAt: '2026-08-27T01:00:00Z',
                completedAt: '2026-08-27T01:02:00Z',
            },
        });
    });

    it('flattens the step tree to FAILED step names', async () => {
        const { mockContext } = setupMocks(kitProject());
        mockGetInstallationState.mockResolvedValue({
            id: 'i-2',
            status: 'failed',
            startedAt: '2026-08-27T01:00:00Z',
            step: {
                name: 'root',
                id: 'r',
                path: [],
                status: 'failed',
                children: [
                    { name: 'create providers', id: 'a', path: [], status: 'succeeded' },
                    {
                        name: 'registrations',
                        id: 'b',
                        path: [],
                        status: 'failed',
                        children: [
                            { name: 'subscribe events', id: 'c', path: [], status: 'failed' },
                        ],
                    },
                ],
            },
        });

        const result = (await handleGetAppBuilderInstallStatus(mockContext, {
            id: 'kit-app',
        })) as { data: { live: { failedSteps: string[] } } };

        expect(result.data.live.failedSteps).toEqual(['root', 'registrations', 'subscribe events']);
    });

    it('reports never-installed for the API 204', async () => {
        const { mockContext } = setupMocks(kitProject());
        mockGetInstallationState.mockResolvedValue(undefined);

        const result = (await handleGetAppBuilderInstallStatus(mockContext, {
            id: 'kit-app',
        })) as { data: { live: { status: string } } };

        expect(result.data.live.status).toBe('never-installed');
    });

    it('refuses a non-App-Management integration (no install API deployed)', async () => {
        const { mockContext } = setupMocks({
            appBuilderComponents: {
                plain: {
                    kind: 'integration',
                    status: 'deployed',
                    name: 'Plain',
                    source: { owner: 'acme', repo: 'plain' },
                    deployedUrls: { 'web/x': 'https://ns.adobeioruntime.net/api/v1/web/x' },
                },
            },
        });

        const result = await handleGetAppBuilderInstallStatus(mockContext, { id: 'plain' });

        expect(result.success).toBe(false);
        expect(result.code).toBe(ErrorCode.INVALID_OPERATION);
        expect(mockClientCtor).not.toHaveBeenCalled();
    });

    it('answers AUTH_REQUIRED typed — never a dialog — with no sign-in', async () => {
        const { mockContext } = setupMocks(kitProject());
        mockResolveAppManagementAuth.mockResolvedValue(undefined);

        const result = await handleGetAppBuilderInstallStatus(mockContext, { id: 'kit-app' });

        expect(result.success).toBe(false);
        expect(result.code).toBe(ErrorCode.AUTH_REQUIRED);
    });
});

describe('handleInstallAppBuilderComponent', () => {
    it('guards, re-runs the install pass with the persisted URLs, and persists the outcome', async () => {
        const { mockContext, mockProject } = setupMocks(kitProject());
        mockDeveloperPermissions();
        mockInstallAppManagement.mockResolvedValue({ status: 'installed' });

        const result = (await handleInstallAppBuilderComponent(mockContext, {
            id: 'kit-app',
        })) as { success: boolean; installation: { status: string } };

        expect(result.success).toBe(true);
        expect(mockInstallAppManagement).toHaveBeenCalledWith(
            mockProject,
            APP_URLS,
            expect.any(Function)
        );
        // The persisted record is what the drawer and the status read serve.
        expect(result.installation.status).toBe('installed');
        expect(mockContext.stateManager.saveProject).toHaveBeenCalled();
        const saved = (mockContext.stateManager.saveProject as jest.Mock).mock.calls.at(-1)![0];
        expect(saved.appBuilderComponents['kit-app'].installation.status).toBe('installed');
    });

    it('a failed install answers failure with the detail, and still persists it', async () => {
        const { mockContext } = setupMocks(kitProject());
        mockDeveloperPermissions();
        mockInstallAppManagement.mockResolvedValue({
            status: 'failed',
            detail: 'The install call failed (HTTP 500).',
        });

        const result = await handleInstallAppBuilderComponent(mockContext, { id: 'kit-app' });

        expect(result.success).toBe(false);
        expect(result.error).toContain('HTTP 500');
        const saved = (mockContext.stateManager.saveProject as jest.Mock).mock.calls.at(-1)![0];
        expect(saved.appBuilderComponents['kit-app'].installation.status).toBe('failed');
    });

    it('refuses an integration that does not install into Commerce', async () => {
        const { mockContext } = setupMocks(kitProject());
        mockGetAppBuilderComponentEntry.mockReturnValue(undefined);
        mockBuildCustomIntegrationEntry.mockReturnValue({ id: 'kit-app', lifecycle: undefined });

        const result = await handleInstallAppBuilderComponent(mockContext, { id: 'kit-app' });

        expect(result.success).toBe(false);
        expect(result.code).toBe(ErrorCode.INVALID_OPERATION);
        expect(mockInstallAppManagement).not.toHaveBeenCalled();
    });

    it('refuses an undeployed integration — the deploy runs the install itself', async () => {
        const { mockContext } = setupMocks({
            appBuilderComponents: {
                'kit-app': { ...KIT_STATE, status: 'error' },
            },
        });

        const result = await handleInstallAppBuilderComponent(mockContext, { id: 'kit-app' });

        expect(result.success).toBe(false);
        expect(result.error).toContain('not deployed');
        expect(mockInstallAppManagement).not.toHaveBeenCalled();
    });

    it('a failed guard blocks before the installer runs', async () => {
        const { mockContext } = setupMocks(kitProject());
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false });

        const result = await handleInstallAppBuilderComponent(mockContext, { id: 'kit-app' });

        expect(result.success).toBe(false);
        expect(result.code).toBe(ErrorCode.AUTH_REQUIRED);
        expect(mockInstallAppManagement).not.toHaveBeenCalled();
    });
});

/**
 * The decisions the first pass left unconstrained: the two entry guards both
 * handlers share, the failure paths, and the ARGUMENTS the collaborators receive
 * — the lifecycle resolver's source shape, the runner-deps services, and the
 * step text the progress notification carries.
 */

describe('both handlers refuse before they touch anything', () => {
    it('the status read needs an id, even with no payload at all', async () => {
        // The MCP surface can call a handler with nothing. Reaching for
        // `payload.id` there throws before the typed refusal is ever built.
        const { mockContext } = setupMocks(kitProject());

        const result = await handleGetAppBuilderInstallStatus(mockContext);

        expect(result.success).toBe(false);
        expect(result.code).toBe(ErrorCode.CONFIG_INVALID);
        expect(mockClientCtor).not.toHaveBeenCalled();
    });

    it('the install needs an id, even with no payload at all', async () => {
        const { mockContext } = setupMocks(kitProject());

        const result = await handleInstallAppBuilderComponent(mockContext);

        expect(result.success).toBe(false);
        expect(result.code).toBe(ErrorCode.CONFIG_INVALID);
        expect(mockInstallAppManagement).not.toHaveBeenCalled();
    });

    it('the status read names an integration the project does not have', async () => {
        const { mockContext } = setupMocks({ appBuilderComponents: {} });

        const result = await handleGetAppBuilderInstallStatus(mockContext, { id: 'ghost' });

        expect(result.success).toBe(false);
        expect(result.code).toBe(ErrorCode.PROJECT_NOT_FOUND);
        expect(mockClientCtor).not.toHaveBeenCalled();
    });

    it('the install names an integration the project does not have', async () => {
        const { mockContext } = setupMocks({ appBuilderComponents: {} });

        const result = await handleInstallAppBuilderComponent(mockContext, { id: 'ghost' });

        expect(result.success).toBe(false);
        expect(result.code).toBe(ErrorCode.PROJECT_NOT_FOUND);
        expect(mockInstallAppManagement).not.toHaveBeenCalled();
    });

    it('the install refuses a MESH — this pass is for integrations only', async () => {
        // The keyed map holds both kinds under one shape, so the kind check is
        // the only thing standing between a mesh id and the Commerce installer.
        const { mockContext } = setupMocks({
            appBuilderComponents: {
                mesh: {
                    kind: 'mesh',
                    status: 'deployed',
                    name: 'API Mesh',
                    source: { owner: 'adobe', repo: 'mesh' },
                    deployedUrls: APP_URLS,
                },
            },
        });

        const result = await handleInstallAppBuilderComponent(mockContext, { id: 'mesh' });

        expect(result.success).toBe(false);
        expect(result.code).toBe(ErrorCode.PROJECT_NOT_FOUND);
        expect(mockInstallAppManagement).not.toHaveBeenCalled();
    });
});

describe('the status read when the app itself errors', () => {
    it('answers with the reason rather than a bare failure', async () => {
        const { mockContext } = setupMocks(kitProject());
        mockGetInstallationState.mockRejectedValue(new Error('gateway timeout'));

        const result = await handleGetAppBuilderInstallStatus(mockContext, { id: 'kit-app' });

        expect(result.success).toBe(false);
        expect(result.error).toContain('gateway timeout');
    });

    it('answers with a non-Error rejection rather than [object Object]', async () => {
        const { mockContext } = setupMocks(kitProject());
        mockGetInstallationState.mockRejectedValue('socket closed');

        const result = await handleGetAppBuilderInstallStatus(mockContext, { id: 'kit-app' });

        expect(result.success).toBe(false);
        expect(result.error).toContain('socket closed');
    });
});

describe('the install pass and what it hands its collaborators', () => {
    it('identifies a seeded kit under a custom id from its PERSISTED source', async () => {
        // A kit installed under a custom id has no catalog row, so the lifecycle
        // comes from recognising the repo it was seeded from. Handing the
        // recogniser an empty object, or the slug instead of the display name,
        // silently makes it a plain integration that cannot install.
        const { mockContext } = setupMocks(kitProject());
        mockDeveloperPermissions();
        mockGetAppBuilderComponentEntry.mockReturnValue(undefined);
        mockBuildCustomIntegrationEntry.mockReturnValue({
            id: 'kit-app',
            lifecycle: 'app-management',
        });

        const result = await handleInstallAppBuilderComponent(mockContext, { id: 'kit-app' });

        expect(mockBuildCustomIntegrationEntry).toHaveBeenCalledWith(
            {
                owner: 'adobe',
                repo: 'commerce-integration-starter-kit',
                branch: 'main',
                name: 'Kit App',
            },
            'kit-app',
        );
        expect(result.success).toBe(true);
    });

    it('names the integration the way a user would recognise it, not by its slug', async () => {
        const { mockContext } = setupMocks(kitProject());
        mockDeveloperPermissions();

        await handleInstallAppBuilderComponent(mockContext, { id: 'kit-app' });

        expect(mockProgressTitles.join(' ')).toContain('Kit App');
    });

    it('hands the runner-deps builder the auth and command services', async () => {
        // ADR-015: these are fetched at the handler boundary and passed down. An
        // empty context object typechecks and fails at the first deploy step.
        const { mockContext, mockProject } = setupMocks(kitProject());
        mockDeveloperPermissions();

        await handleInstallAppBuilderComponent(mockContext, { id: 'kit-app' });

        expect(mockBuildRunnerDepsContext).toHaveBeenCalledWith(
            expect.anything(),
            mockProject,
            expect.objectContaining({
                authManager: expect.anything(),
                commandManager: expect.anything(),
            }),
        );
    });

    it('refuses when the install pass is not wired into the deps', async () => {
        const { mockContext } = setupMocks(kitProject());
        mockDeveloperPermissions();
        mockBuildDefaultRunnerDeps.mockReturnValue(
            {} as unknown as ReturnType<typeof mockBuildDefaultRunnerDeps>,
        );

        const result = await handleInstallAppBuilderComponent(mockContext, { id: 'kit-app' });

        expect(result.success).toBe(false);
        expect(result.error).toContain('install pass is not available');
        expect(mockInstallAppManagement).not.toHaveBeenCalled();
    });

    it('forwards the runner’s step text, preferring the sub-step when there is one', async () => {
        // The runner reports a coarse step and a fine one. The notification is
        // the only surface with room for the fine one, so that is the one it
        // gets — dropping to the coarse text makes a three-minute install look
        // frozen on one line.
        const { mockContext } = setupMocks(kitProject());
        mockDeveloperPermissions();

        await handleInstallAppBuilderComponent(mockContext, { id: 'kit-app' });
        const forward = mockBuildDefaultRunnerDeps.mock.calls[0][1] as (
            message: string,
            subMessage?: string,
        ) => void;
        // The guard's own first step has already been reported by now.
        mockProgressSteps.length = 0;
        forward('Registering events', 'provider 2 of 3');
        forward('Creating providers');

        expect(mockProgressSteps).toStrictEqual(['provider 2 of 3', 'Creating providers']);
    });
});
