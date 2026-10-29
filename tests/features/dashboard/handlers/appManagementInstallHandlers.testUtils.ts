/**
 * Shared setup for the appManagementInstallHandlers suites.
 *
 * The client, the runner deps, the catalog loader and the guards are mocked HERE,
 * and this file owns the import of the handlers: a `jest.mock` factory hoists only
 * above the imports of the module it is written in, so a suite that imported the
 * handlers itself would bind them to the real collaborators. Suites import the
 * handlers, the mocks and the fixtures from this file and nowhere else.
 *
 * No assertions live here — only arranging.
 */

import type { AppBuilderComponentState, Project } from '@/types/base';

// ---- the progress notification, RECORDED rather than mocked away -----------
// `vscode` is walled twice in this import chain: dashboardHandlers.testUtils
// registers its own factory, but only AFTER the subject has bound the file mock —
// which is why the handlers are exported ABOVE `setupMocks` below, and must stay
// there. So the vscode a test can reach is not the one the handler reports
// progress to. Recording here — above every import — is what makes the
// notification observable at all. Plain functions, not jest.fn, so no mock reset
// can quietly empty them.
export const mockProgressTitles: string[] = [];
export const mockProgressSteps: unknown[] = [];
jest.mock('vscode', () => {
    const vscode = jest.requireActual('../../../__mocks__/vscode') as {
        window: Record<string, unknown>;
    };
    vscode.window.withProgress = async (
        options: { title: string },
        task: (p: { report: (value: { message?: string }) => void }) => unknown
    ) => {
        mockProgressTitles.push(options.title);
        return task({ report: (value) => mockProgressSteps.push(value?.message) });
    };
    return vscode;
});

// ---- runner deps + auth resolver (all mocked) ------------------------------
export const mockInstallAppManagement = jest.fn();
export const mockUninstallAppManagement = jest.fn();
export const mockReadAppVersion = jest.fn();
// Declared with its arguments, not as a bare `jest.fn(() => ...)`: the second
// one is the progress adapter, and a zero-arity signature makes it unreadable.
export const mockBuildDefaultRunnerDeps = jest.fn(
    (..._args: unknown[]): Record<string, unknown> => ({})
);
/** The `saveProject` of the context `buildRunnerDepsContext` answers with. */
export const mockCtxSaveProject = jest.fn();
export const mockBuildRunnerDepsContext = jest.fn(async (..._args: unknown[]) => ({
    saveProject: mockCtxSaveProject,
    marker: 'the built context',
}));
export const mockResolveAppManagementAuth = jest.fn();
jest.mock('@/features/project-creation/services/appBuilderComponentRunnerDeps', () => ({
    buildDefaultRunnerDeps: (...a: unknown[]) => mockBuildDefaultRunnerDeps(...a),
    buildRunnerDepsContext: (...a: unknown[]) => mockBuildRunnerDepsContext(...a),
    resolveAppManagementAuth: (...a: unknown[]) => mockResolveAppManagementAuth(...a),
}));

// ---- the App Management client (status read constructs it directly) --------
export const mockGetInstallationState = jest.fn();
export const mockClientCtor = jest.fn();
jest.mock('@/features/app-builder/services/appManagementClient', () => ({
    AppManagementClient: class {
        constructor(...args: unknown[]) {
            mockClientCtor(...args);
        }
        getInstallationState = (...a: unknown[]) => mockGetInstallationState(...a);
    },
}));

// ---- catalog loader (lifecycle resolution) ---------------------------------
export const mockGetAppBuilderComponentEntry = jest.fn();
export const mockBuildCustomIntegrationEntry = jest.fn();
jest.mock('@/features/components/services/appBuilderComponentCatalogLoader', () => ({
    getAppBuilderComponentEntry: (...a: unknown[]) => mockGetAppBuilderComponentEntry(...a),
    buildCustomIntegrationEntry: (...a: unknown[]) => mockBuildCustomIntegrationEntry(...a),
    entryFitsProjectAxes: jest.fn().mockReturnValue(true),
}));

// ---- DI (runGuards resolves the auth service through it) -------------------
// Mocked HERE, not only via dashboardHandlers.testUtils: that module's own
// jest.mock('@/core/di/serviceLocator') registers after the SUT import chain has
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
export const mockEnsureAdobeIOAuth = jest.fn();
jest.mock('@/core/auth/adobeAuthGuard', () => ({
    ensureAdobeIOAuth: (...a: unknown[]) => mockEnsureAdobeIOAuth(...a),
}));
export const mockDetectProjectOrgMismatch = jest.fn();
jest.mock('@/features/authentication/services/detectProjectOrgMismatch', () => ({
    detectProjectOrgMismatch: (...a: unknown[]) => mockDetectProjectOrgMismatch(...a),
}));

// ---- dashboard channels (imported by the shared handler module) ------------
jest.mock('@/features/dashboard/handlers/statusHandlers', () => ({
    handleRequestStatus: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock('@/features/dashboard/commands/showDashboard', () => ({
    ProjectDashboardWebviewCommand: {
        refreshStatus: jest.fn(),
    },
}));
/** The card's in-flight line: `(id, status, label)`. */
export const mockSendStatusUpdate = jest.fn();
jest.mock('@/features/dashboard/services/projectPanelPushes', () => ({
    sendAppBuilderComponentStatusUpdate: (...a: unknown[]) => mockSendStatusUpdate(...a),
    sendAppBuilderComponentsSnapshot: jest.fn(),
}));

export {
    handleGetAppBuilderInstallStatus,
    handleInstallAppBuilderComponent,
    handleReinstallAppBuilderComponent,
    handlerRunnerDeps,
} from '@/features/dashboard/handlers/appManagementInstallHandlers';
export { setupMocks } from './dashboardHandlers.testUtils';

export const APP_URLS = {
    'app-management/installation':
        'https://ns.adobeioruntime.net/api/v1/web/app-management/installation',
};

export const KIT_STATE: AppBuilderComponentState = {
    kind: 'integration',
    status: 'deployed',
    name: 'Kit App',
    source: { owner: 'adobe', repo: 'commerce-integration-starter-kit', branch: 'main' },
    deployedUrls: APP_URLS,
    installation: { status: 'failed', detail: 'earlier failure', at: '2026-08-27T00:00:00Z' },
};

export function kitProject(): Partial<Project> {
    return { appBuilderComponents: { 'kit-app': { ...KIT_STATE } } };
}

export function mockDeveloperPermissions(): void {
    const { ServiceLocator } = require('@/core/di/serviceLocator');
    ServiceLocator.getAuthenticationService().testDeveloperPermissions = jest
        .fn()
        .mockResolvedValue({ hasPermissions: true });
}

/** Every mock back to its default answer. Call from each suite's `beforeEach`. */
export function resetInstallHandlerMocks(): void {
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
    mockUninstallAppManagement.mockResolvedValue({ status: 'uninstalled' });
    mockReadAppVersion.mockResolvedValue('0.3.1');
    // clearAllMocks keeps a mockReturnValue; the "not wired" tests set one.
    mockBuildDefaultRunnerDeps.mockReturnValue({
        installAppManagement: mockInstallAppManagement,
        uninstallAppManagement: mockUninstallAppManagement,
        readAppVersion: mockReadAppVersion,
    });
    mockGetInstallationState.mockResolvedValue({
        id: 'i-1',
        status: 'succeeded',
        startedAt: '2026-08-27T01:00:00Z',
        completedAt: '2026-08-27T01:02:00Z',
    });
}
