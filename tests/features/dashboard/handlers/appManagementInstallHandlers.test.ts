/**
 * appManagementInstallHandlers — the AB-5 pair.
 *
 * `getAppBuilderInstallStatus` (persisted record + the app's LIVE state) and
 * `installAppBuilderComponent` (re-run the install pass without a redeploy).
 * The client, the runner deps, the catalog loader, and the guards are mocked;
 * assertions pin the ARGUMENTS each collaborator receives and the persisted
 * outcome — a mock cannot see a malformed call.
 */

import type { Project } from '@/types/base';

// ---- runner deps + auth resolver (all mocked) ------------------------------
const mockInstallAppManagement = jest.fn();
const mockBuildDefaultRunnerDeps = jest.fn(() => ({
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
// jest.mock('@/core/di') registers after this spec's SUT import chain has
// already required the real ServiceLocator.
jest.mock('@/core/di', () => ({
    ServiceLocator: { getAuthenticationService: jest.fn() },
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

const KIT_STATE = {
    kind: 'integration',
    status: 'deployed',
    name: 'Kit App',
    source: { owner: 'adobe', repo: 'commerce-integration-starter-kit', branch: 'main' },
    deployedUrls: APP_URLS,
    installation: { status: 'failed', detail: 'earlier failure', at: '2026-08-27T00:00:00Z' },
};

function kitProject(): Partial<Project> {
    return { appBuilderComponents: { 'kit-app': { ...KIT_STATE } } } as never;
}

function mockDeveloperPermissions(): void {
    const { ServiceLocator } = require('@/core/di');
    ServiceLocator.getAuthenticationService().testDeveloperPermissions = jest
        .fn()
        .mockResolvedValue({ hasPermissions: true });
}

beforeEach(() => {
    jest.clearAllMocks();
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
        } as never);

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
        } as never);

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
