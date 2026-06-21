/**
 * appBuilderComponentHandlers Tests (D2 Track B — Step 05)
 *
 * The dashboard message handlers that drive the live D1 runner from the
 * integrations list:
 *   - handleAddAppBuilderComponent     — resolve catalog entry / custom source → guards →
 *                               assemble RunnerDepsContext → addAppBuilderComponent
 *   - handleDeployAppBuilderComponent  — deployAppBuilderComponent {id}
 *   - handleRedeployAppBuilderComponent— deployAppBuilderComponent {id}
 *   - handleRemoveAppBuilderComponent  — removeAppBuilderComponent {id}
 *   - handleVerifyAppBuilderComponent  — on-demand, non-interactive SDK-only probe
 *
 * The guard order MIRRORS DeployAppCommand (auth → org-mismatch → App Builder
 * permission); a failing guard surfaces the message and NEVER calls the runner.
 *
 * Strict TDD: written BEFORE the handlers exist. The runner, the subscriber
 * adapter, the SDK/auth service, and the guards are ALL mocked — no live
 * Adobe/aio calls.
 */

import { setupMocks } from './dashboardHandlers.testUtils';

// ---- D1 runner (the live engine — fully mocked) ----------------------------
const mockAddAppBuilderComponent = jest.fn();
const mockDeployAppBuilderComponent = jest.fn();
const mockRemoveAppBuilderComponent = jest.fn();
jest.mock('@/features/app-builder/services/appBuilderComponentRunner', () => ({
    addAppBuilderComponent: (...a: unknown[]) => mockAddAppBuilderComponent(...a),
    deployAppBuilderComponent: (...a: unknown[]) => mockDeployAppBuilderComponent(...a),
    removeAppBuilderComponent: (...a: unknown[]) => mockRemoveAppBuilderComponent(...a),
}));

// ---- runner deps factory + subscriber adapter (Track A) --------------------
const mockBuildDefaultRunnerDeps = jest.fn(() => ({ catalog: [], _deps: true }));
jest.mock('@/features/app-builder/services/appBuilderComponentRunnerDeps', () => ({
    buildDefaultRunnerDeps: (...a: unknown[]) => mockBuildDefaultRunnerDeps(...a),
}));
const mockCreateApiSubscriberClient = jest.fn(() => ({ _client: true }));
jest.mock('@/features/app-builder/services/apiSubscriberClientAdapter', () => ({
    createApiSubscriberClient: (...a: unknown[]) => mockCreateApiSubscriberClient(...a),
}));

// ---- catalog loader --------------------------------------------------------
const mockGetAppBuilderComponentEntry = jest.fn();
const mockGetAvailableAppBuilderComponents = jest.fn(() => []);
jest.mock('@/features/project-creation/services/appBuilderComponentCatalogLoader', () => ({
    getAppBuilderComponentEntry: (...a: unknown[]) => mockGetAppBuilderComponentEntry(...a),
    getAvailableAppBuilderComponents: (...a: unknown[]) => mockGetAvailableAppBuilderComponents(...a),
}));

// ---- guards (mirror DeployAppCommand) --------------------------------------
const mockEnsureAdobeIOAuth = jest.fn();
jest.mock('@/core/auth/adobeAuthGuard', () => ({
    ensureAdobeIOAuth: (...a: unknown[]) => mockEnsureAdobeIOAuth(...a),
}));
const mockDetectProjectOrgMismatch = jest.fn();
jest.mock('@/features/authentication/services/detectProjectOrgMismatch', () => ({
    detectProjectOrgMismatch: (...a: unknown[]) => mockDetectProjectOrgMismatch(...a),
}));

// ---- dashboard status channel (mocked — no live webview) -------------------
const mockSendAppBuilderComponentStatusUpdate = jest.fn();
jest.mock('@/features/dashboard/commands/showDashboard', () => ({
    ProjectDashboardWebviewCommand: {
        sendAppBuilderComponentStatusUpdate: (...a: unknown[]) => mockSendAppBuilderComponentStatusUpdate(...a),
        refreshStatus: jest.fn(),
    },
}));

import {
    handleAddAppBuilderComponent,
    handleDeployAppBuilderComponent,
    handleRedeployAppBuilderComponent,
    handleRemoveAppBuilderComponent,
    handleVerifyAppBuilderComponent,
} from '@/features/dashboard/handlers/appBuilderComponentHandlers';

const ERP_ENTRY = {
    id: 'erp-sync',
    name: 'ERP Sync',
    description: 'Sync ERP',
    kind: 'integration' as const,
    source: { owner: 'acme', repo: 'erp-sync' },
};

function mockTestDeveloperPermissions(hasPermissions: boolean, error?: string) {
    const { ServiceLocator } = require('@/core/di');
    const svc = ServiceLocator.getAuthenticationService();
    svc.testDeveloperPermissions = jest.fn().mockResolvedValue({ hasPermissions, error });
    return svc;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockAddAppBuilderComponent.mockResolvedValue({ success: true });
    mockDeployAppBuilderComponent.mockResolvedValue({ success: true });
    mockRemoveAppBuilderComponent.mockResolvedValue({ success: true });
    mockGetAppBuilderComponentEntry.mockReturnValue(ERP_ENTRY);
    mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
    mockDetectProjectOrgMismatch.mockResolvedValue({ reachable: true });
});

describe('handleAddAppBuilderComponent', () => {
    it('resolves the catalog entry, assembles deps, and calls addAppBuilderComponent', async () => {
        const { mockContext, mockProject } = setupMocks();
        mockTestDeveloperPermissions(true);

        const result = await handleAddAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(true);
        expect(mockBuildDefaultRunnerDeps).toHaveBeenCalledWith(
            expect.objectContaining({
                subscriberClient: expect.anything(),
                getCachedOrganization: expect.any(Function),
                secrets: expect.anything(),
            }),
        );
        expect(mockCreateApiSubscriberClient).toHaveBeenCalled();
        expect(mockAddAppBuilderComponent).toHaveBeenCalledWith(mockProject, ERP_ENTRY, expect.anything());
    });

    it('runs guards BEFORE deploying — auth failure does NOT call the runner', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false, cancelled: true });

        const result = await handleAddAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(false);
        expect(mockAddAppBuilderComponent).not.toHaveBeenCalled();
    });

    it('aborts on org mismatch and does NOT call the runner', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        mockDetectProjectOrgMismatch.mockResolvedValue({ reachable: false, currentOrg: 'Other Org' });

        const result = await handleAddAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(false);
        expect(mockAddAppBuilderComponent).not.toHaveBeenCalled();
    });

    it('aborts when the App Builder permission gate fails (no runner call)', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(false, 'Developer access required');

        const result = await handleAddAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(false);
        expect(mockAddAppBuilderComponent).not.toHaveBeenCalled();
    });

    it('rejects an unknown catalog id without calling the runner', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        mockGetAppBuilderComponentEntry.mockReturnValue(undefined);

        const result = await handleAddAppBuilderComponent(mockContext, { id: 'nope' });

        expect(result.success).toBe(false);
        expect(mockAddAppBuilderComponent).not.toHaveBeenCalled();
    });

    it('routes a custom GitHub URL into an integration entry and deploys it', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);

        const result = await handleAddAppBuilderComponent(mockContext, {
            source: { owner: 'owner', repo: 'custom-app' },
        });

        expect(result.success).toBe(true);
        expect(mockAddAppBuilderComponent).toHaveBeenCalledWith(
            mockContext.stateManager.getCurrentProject.mock
                ? expect.anything()
                : expect.anything(),
            expect.objectContaining({
                kind: 'integration',
                source: expect.objectContaining({ owner: 'owner', repo: 'custom-app' }),
            }),
            expect.anything(),
        );
    });

    it('routes to Configure FIRST when the entry needs bucket-3 user inputs', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        mockGetAppBuilderComponentEntry.mockReturnValue({
            ...ERP_ENTRY,
            envSchema: [{ name: 'ERP_API_KEY', type: 'secret', label: 'ERP API Key' }],
        });

        const result = await handleAddAppBuilderComponent(mockContext, { id: 'erp-sync' });

        // Routed to Configure, not silently deployed with a missing secret.
        const vscode = require('vscode');
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.configureProject');
        expect(mockAddAppBuilderComponent).not.toHaveBeenCalled();
        expect(result.success).toBe(true);
    });

    it('posts an error row status when the runner returns failure (no throw)', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        mockAddAppBuilderComponent.mockResolvedValue({ success: false, error: 'clone failed' });

        const result = await handleAddAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(false);
        expect(result.error).toBe('clone failed');
        expect(mockSendAppBuilderComponentStatusUpdate).toHaveBeenCalledWith(
            'erp-sync', 'error', expect.stringContaining('clone failed'),
        );
    });
});

describe('handleDeployAppBuilderComponent / handleRedeployAppBuilderComponent', () => {
    it('deploy routes to the runner deployAppBuilderComponent with the id', async () => {
        const { mockContext, mockProject } = setupMocks();
        mockTestDeveloperPermissions(true);

        const result = await handleDeployAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(true);
        expect(mockDeployAppBuilderComponent).toHaveBeenCalledWith(mockProject, 'erp-sync', expect.anything());
    });

    it('redeploy routes to the runner deployAppBuilderComponent with the id', async () => {
        const { mockContext, mockProject } = setupMocks();
        mockTestDeveloperPermissions(true);

        const result = await handleRedeployAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(true);
        expect(mockDeployAppBuilderComponent).toHaveBeenCalledWith(mockProject, 'erp-sync', expect.anything());
    });

    it('does not call the runner when a guard fails', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false });

        const result = await handleDeployAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(false);
        expect(mockDeployAppBuilderComponent).not.toHaveBeenCalled();
    });
});

describe('handleRemoveAppBuilderComponent', () => {
    it('routes to the runner removeAppBuilderComponent with the id', async () => {
        const { mockContext, mockProject } = setupMocks();
        mockTestDeveloperPermissions(true);

        const result = await handleRemoveAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(true);
        expect(mockRemoveAppBuilderComponent).toHaveBeenCalledWith(mockProject, 'erp-sync', expect.anything());
    });

    it('surfaces the runner error', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        mockRemoveAppBuilderComponent.mockResolvedValue({ success: false, error: 'undeploy failed' });

        const result = await handleRemoveAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(false);
        expect(result.error).toBe('undeploy failed');
    });
});

describe('handleVerifyAppBuilderComponent (on-demand, non-interactive)', () => {
    it('posts a deployed outcome when the SDK-only probe reaches the org', async () => {
        const { mockContext } = setupMocks({
            appBuilderComponents: {
                'erp-sync': { kind: 'integration', status: 'deployed', source: { owner: 'acme', repo: 'erp-sync' } },
            },
        } as never);
        const svc = require('@/core/di').ServiceLocator.getAuthenticationService();
        svc.getOrganizationsSdkOnly = jest.fn().mockResolvedValue([{ id: 'org123' }]);

        const result = await handleVerifyAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(true);
        expect(mockSendAppBuilderComponentStatusUpdate).toHaveBeenCalledWith('erp-sync', 'deployed', undefined);
    });

    it('never performs an aio/CLI write or a deploy on verify', async () => {
        const { mockContext } = setupMocks({
            appBuilderComponents: {
                'erp-sync': { kind: 'integration', status: 'deployed', source: { owner: 'acme', repo: 'erp-sync' } },
            },
        } as never);
        const svc = require('@/core/di').ServiceLocator.getAuthenticationService();
        svc.getOrganizationsSdkOnly = jest.fn().mockResolvedValue([{ id: 'org123' }]);

        await handleVerifyAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(mockDeployAppBuilderComponent).not.toHaveBeenCalled();
        expect(mockAddAppBuilderComponent).not.toHaveBeenCalled();
    });

    it('posts an error outcome when the probe cannot reach the org', async () => {
        const { mockContext } = setupMocks({
            appBuilderComponents: {
                'erp-sync': { kind: 'integration', status: 'deployed', source: { owner: 'acme', repo: 'erp-sync' } },
            },
        } as never);
        const svc = require('@/core/di').ServiceLocator.getAuthenticationService();
        svc.getOrganizationsSdkOnly = jest.fn().mockResolvedValue([]);

        const result = await handleVerifyAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(true); // handler resolved (P2: typed outcome, no throw)
        expect(mockSendAppBuilderComponentStatusUpdate).toHaveBeenCalledWith(
            'erp-sync', 'error', expect.any(String),
        );
    });
});
