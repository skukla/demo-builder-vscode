/**
 * Shared harness for the appBuilderComponentHandlers suites.
 *
 * The handler scenarios split across two spec files to stay under the 500-line
 * limit — appBuilderComponentHandlers.test.ts (add/deploy/remove/verify + the
 * input-box rename) and appBuilderComponentHandlers-drawer.test.ts (the inline
 * payload rename and the appBuilderComponentsSnapshot channel) — so every mock,
 * spy handle, and fixture lives here.
 *
 * This module owns the SUT import and re-exports it (the aiHandlers.testUtils
 * precedent), which guarantees the jest.mock calls below are registered before
 * the handler module loads.
 *
 * The runner, the deps factory, the catalog loader, the guards, and the
 * dashboard status channel are ALL mocked — no live Adobe/aio calls.
 */

import { setupMocks } from './dashboardHandlers.testUtils';

// ---- D1 runner (the live engine — fully mocked) ----------------------------
export const mockAddAppBuilderComponent = jest.fn();
export const mockDeployAppBuilderComponent = jest.fn();
export const mockRemoveAppBuilderComponent = jest.fn();
jest.mock('@/features/app-builder/services/appBuilderComponentRunner', () => ({
    addAppBuilderComponent: (...a: unknown[]) => mockAddAppBuilderComponent(...a),
    deployAppBuilderComponent: (...a: unknown[]) => mockDeployAppBuilderComponent(...a),
    removeAppBuilderComponent: (...a: unknown[]) => mockRemoveAppBuilderComponent(...a),
}));

// ---- runner deps factory + context builder (both now live in runnerDeps) ---
export const mockBuildDefaultRunnerDeps = jest.fn(() => ({ catalog: [], _deps: true }));
export const mockBuildRunnerDepsContext = jest.fn(async () => ({
    subscriberClient: { _client: true },
    getCachedOrganization: () => undefined,
    secrets: { _secrets: true },
}));
jest.mock('@/features/project-creation/services/appBuilderComponentRunnerDeps', () => ({
    buildDefaultRunnerDeps: (...a: unknown[]) => mockBuildDefaultRunnerDeps(...(a as [])),
    buildRunnerDepsContext: (...a: unknown[]) => mockBuildRunnerDepsContext(...(a as [])),
}));

// ---- catalog loader --------------------------------------------------------
export const mockGetAppBuilderComponentEntry = jest.fn();
export const mockBuildCustomIntegrationEntry = jest.fn(
    (source: { owner: string; repo: string; branch?: string }) => ({
        id: `${source.owner}-${source.repo}`,
        name: source.repo,
        description: `Custom App Builder component from ${source.owner}/${source.repo}`,
        kind: 'integration' as const,
        source: { owner: source.owner, repo: source.repo, branch: source.branch ?? 'main' },
    }),
);
jest.mock('@/features/components/services/appBuilderComponentCatalogLoader', () => ({
    getAppBuilderComponentEntry: (...a: unknown[]) => mockGetAppBuilderComponentEntry(...a),
    buildCustomIntegrationEntry: (...a: unknown[]) => mockBuildCustomIntegrationEntry(...(a as [never])),
}));

// ---- guards (auth → org-mismatch → permission) ------------------------------
export const mockEnsureAdobeIOAuth = jest.fn();
jest.mock('@/core/auth/adobeAuthGuard', () => ({
    ensureAdobeIOAuth: (...a: unknown[]) => mockEnsureAdobeIOAuth(...a),
}));
export const mockDetectProjectOrgMismatch = jest.fn();
jest.mock('@/features/authentication/services/detectProjectOrgMismatch', () => ({
    detectProjectOrgMismatch: (...a: unknown[]) => mockDetectProjectOrgMismatch(...a),
}));

// ---- dashboard status channels (mocked — no live webview) ------------------
export const mockSendAppBuilderComponentStatusUpdate = jest.fn();
export const mockSendAppBuilderComponentsSnapshot = jest.fn();
/**
 * The status re-run after a set-changing op. Mocked because the real one is a
 * heavy handler (auth guard + mesh checks) and this suite only cares WHETHER the
 * refresh happens — and, for rename, that it does not.
 */
export const mockHandleRequestStatus = jest.fn().mockResolvedValue({ success: true });
jest.mock('@/features/dashboard/handlers/dashboardHandlers', () => ({
    handleRequestStatus: (...a: unknown[]) => mockHandleRequestStatus(...a),
}));

jest.mock('@/features/dashboard/commands/showDashboard', () => ({
    ProjectDashboardWebviewCommand: {
        sendAppBuilderComponentStatusUpdate: (...a: unknown[]) =>
            mockSendAppBuilderComponentStatusUpdate(...a),
        sendAppBuilderComponentsSnapshot: (...a: unknown[]) =>
            mockSendAppBuilderComponentsSnapshot(...a),
        refreshStatus: jest.fn(),
    },
}));

export {
    handleAddAppBuilderComponent,
    handleDeployAppBuilderComponent,
    handleRedeployAppBuilderComponent,
    handleRemoveAppBuilderComponent,
    handleRenameAppBuilderComponent,
} from '@/features/dashboard/handlers/appBuilderComponentHandlers';

export { setupMocks };

export const ERP_ENTRY = {
    id: 'erp-sync',
    name: 'ERP Sync',
    description: 'Sync ERP',
    kind: 'integration' as const,
    source: { owner: 'acme', repo: 'erp-sync' },
};

export function mockTestDeveloperPermissions(hasPermissions: boolean, error?: string) {
    const { ServiceLocator } = require('@/core/di');
    const svc = ServiceLocator.getAuthenticationService();
    svc.testDeveloperPermissions = jest.fn().mockResolvedValue({ hasPermissions, error });
    return svc;
}

/** Per-test mock reset + happy-path defaults — call from each spec's beforeEach. */
export function resetHandlerMocks(): void {
    jest.clearAllMocks();
    mockAddAppBuilderComponent.mockResolvedValue({ success: true });
    mockDeployAppBuilderComponent.mockResolvedValue({ success: true });
    mockRemoveAppBuilderComponent.mockResolvedValue({ success: true });
    mockGetAppBuilderComponentEntry.mockReturnValue(ERP_ENTRY);
    mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
    mockDetectProjectOrgMismatch.mockResolvedValue({ reachable: true });
    mockHandleRequestStatus.mockResolvedValue({ success: true });
}

/** Minimal fresh-project factory for snapshot freshness assertions. */
export function createFreshProject(components: Record<string, unknown>) {
    return {
        name: 'test-project',
        path: '/path/to/project',
        appBuilderComponents: components,
    } as never;
}
