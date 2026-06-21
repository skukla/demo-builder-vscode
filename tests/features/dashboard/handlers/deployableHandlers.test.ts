/**
 * deployableHandlers Tests (D2 Track B — Step 05)
 *
 * The dashboard message handlers that drive the live D1 runner from the
 * integrations list:
 *   - handleAddDeployable     — resolve catalog entry / custom source → guards →
 *                               assemble RunnerDepsContext → addDeployable
 *   - handleDeployDeployable  — deployDeployable {id}
 *   - handleRedeployDeployable— deployDeployable {id}
 *   - handleRemoveDeployable  — removeDeployable {id}
 *   - handleVerifyDeployable  — on-demand, non-interactive SDK-only probe
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
const mockAddDeployable = jest.fn();
const mockDeployDeployable = jest.fn();
const mockRemoveDeployable = jest.fn();
jest.mock('@/features/app-builder/services/deployableRunner', () => ({
    addDeployable: (...a: unknown[]) => mockAddDeployable(...a),
    deployDeployable: (...a: unknown[]) => mockDeployDeployable(...a),
    removeDeployable: (...a: unknown[]) => mockRemoveDeployable(...a),
}));

// ---- runner deps factory + subscriber adapter (Track A) --------------------
const mockBuildDefaultRunnerDeps = jest.fn(() => ({ catalog: [], _deps: true }));
jest.mock('@/features/app-builder/services/deployableRunnerDeps', () => ({
    buildDefaultRunnerDeps: (...a: unknown[]) => mockBuildDefaultRunnerDeps(...a),
}));
const mockCreateApiSubscriberClient = jest.fn(() => ({ _client: true }));
jest.mock('@/features/app-builder/services/apiSubscriberClientAdapter', () => ({
    createApiSubscriberClient: (...a: unknown[]) => mockCreateApiSubscriberClient(...a),
}));

// ---- catalog loader --------------------------------------------------------
const mockGetDeployableEntry = jest.fn();
const mockGetAvailableDeployables = jest.fn(() => []);
jest.mock('@/features/project-creation/services/deployableCatalogLoader', () => ({
    getDeployableEntry: (...a: unknown[]) => mockGetDeployableEntry(...a),
    getAvailableDeployables: (...a: unknown[]) => mockGetAvailableDeployables(...a),
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
const mockSendDeployableStatusUpdate = jest.fn();
jest.mock('@/features/dashboard/commands/showDashboard', () => ({
    ProjectDashboardWebviewCommand: {
        sendDeployableStatusUpdate: (...a: unknown[]) => mockSendDeployableStatusUpdate(...a),
        refreshStatus: jest.fn(),
    },
}));

import {
    handleAddDeployable,
    handleDeployDeployable,
    handleRedeployDeployable,
    handleRemoveDeployable,
    handleVerifyDeployable,
} from '@/features/dashboard/handlers/deployableHandlers';

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
    mockAddDeployable.mockResolvedValue({ success: true });
    mockDeployDeployable.mockResolvedValue({ success: true });
    mockRemoveDeployable.mockResolvedValue({ success: true });
    mockGetDeployableEntry.mockReturnValue(ERP_ENTRY);
    mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
    mockDetectProjectOrgMismatch.mockResolvedValue({ reachable: true });
});

describe('handleAddDeployable', () => {
    it('resolves the catalog entry, assembles deps, and calls addDeployable', async () => {
        const { mockContext, mockProject } = setupMocks();
        mockTestDeveloperPermissions(true);

        const result = await handleAddDeployable(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(true);
        expect(mockBuildDefaultRunnerDeps).toHaveBeenCalledWith(
            expect.objectContaining({
                subscriberClient: expect.anything(),
                getCachedOrganization: expect.any(Function),
                secrets: expect.anything(),
            }),
        );
        expect(mockCreateApiSubscriberClient).toHaveBeenCalled();
        expect(mockAddDeployable).toHaveBeenCalledWith(mockProject, ERP_ENTRY, expect.anything());
    });

    it('runs guards BEFORE deploying — auth failure does NOT call the runner', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false, cancelled: true });

        const result = await handleAddDeployable(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(false);
        expect(mockAddDeployable).not.toHaveBeenCalled();
    });

    it('aborts on org mismatch and does NOT call the runner', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        mockDetectProjectOrgMismatch.mockResolvedValue({ reachable: false, currentOrg: 'Other Org' });

        const result = await handleAddDeployable(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(false);
        expect(mockAddDeployable).not.toHaveBeenCalled();
    });

    it('aborts when the App Builder permission gate fails (no runner call)', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(false, 'Developer access required');

        const result = await handleAddDeployable(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(false);
        expect(mockAddDeployable).not.toHaveBeenCalled();
    });

    it('rejects an unknown catalog id without calling the runner', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        mockGetDeployableEntry.mockReturnValue(undefined);

        const result = await handleAddDeployable(mockContext, { id: 'nope' });

        expect(result.success).toBe(false);
        expect(mockAddDeployable).not.toHaveBeenCalled();
    });

    it('routes a custom GitHub URL into an integration entry and deploys it', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);

        const result = await handleAddDeployable(mockContext, {
            source: { owner: 'owner', repo: 'custom-app' },
        });

        expect(result.success).toBe(true);
        expect(mockAddDeployable).toHaveBeenCalledWith(
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
        mockGetDeployableEntry.mockReturnValue({
            ...ERP_ENTRY,
            envSchema: [{ name: 'ERP_API_KEY', type: 'secret', label: 'ERP API Key' }],
        });

        const result = await handleAddDeployable(mockContext, { id: 'erp-sync' });

        // Routed to Configure, not silently deployed with a missing secret.
        const vscode = require('vscode');
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.configureProject');
        expect(mockAddDeployable).not.toHaveBeenCalled();
        expect(result.success).toBe(true);
    });

    it('posts an error row status when the runner returns failure (no throw)', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        mockAddDeployable.mockResolvedValue({ success: false, error: 'clone failed' });

        const result = await handleAddDeployable(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(false);
        expect(result.error).toBe('clone failed');
        expect(mockSendDeployableStatusUpdate).toHaveBeenCalledWith(
            'erp-sync', 'error', expect.stringContaining('clone failed'),
        );
    });
});

describe('handleDeployDeployable / handleRedeployDeployable', () => {
    it('deploy routes to the runner deployDeployable with the id', async () => {
        const { mockContext, mockProject } = setupMocks();
        mockTestDeveloperPermissions(true);

        const result = await handleDeployDeployable(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(true);
        expect(mockDeployDeployable).toHaveBeenCalledWith(mockProject, 'erp-sync', expect.anything());
    });

    it('redeploy routes to the runner deployDeployable with the id', async () => {
        const { mockContext, mockProject } = setupMocks();
        mockTestDeveloperPermissions(true);

        const result = await handleRedeployDeployable(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(true);
        expect(mockDeployDeployable).toHaveBeenCalledWith(mockProject, 'erp-sync', expect.anything());
    });

    it('does not call the runner when a guard fails', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false });

        const result = await handleDeployDeployable(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(false);
        expect(mockDeployDeployable).not.toHaveBeenCalled();
    });
});

describe('handleRemoveDeployable', () => {
    it('routes to the runner removeDeployable with the id', async () => {
        const { mockContext, mockProject } = setupMocks();
        mockTestDeveloperPermissions(true);

        const result = await handleRemoveDeployable(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(true);
        expect(mockRemoveDeployable).toHaveBeenCalledWith(mockProject, 'erp-sync', expect.anything());
    });

    it('surfaces the runner error', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        mockRemoveDeployable.mockResolvedValue({ success: false, error: 'undeploy failed' });

        const result = await handleRemoveDeployable(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(false);
        expect(result.error).toBe('undeploy failed');
    });
});

describe('handleVerifyDeployable (on-demand, non-interactive)', () => {
    it('posts a deployed outcome when the SDK-only probe reaches the org', async () => {
        const { mockContext } = setupMocks({
            deployables: {
                'erp-sync': { kind: 'integration', status: 'deployed', source: { owner: 'acme', repo: 'erp-sync' } },
            },
        } as never);
        const svc = require('@/core/di').ServiceLocator.getAuthenticationService();
        svc.getOrganizationsSdkOnly = jest.fn().mockResolvedValue([{ id: 'org123' }]);

        const result = await handleVerifyDeployable(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(true);
        expect(mockSendDeployableStatusUpdate).toHaveBeenCalledWith('erp-sync', 'deployed', undefined);
    });

    it('never performs an aio/CLI write or a deploy on verify', async () => {
        const { mockContext } = setupMocks({
            deployables: {
                'erp-sync': { kind: 'integration', status: 'deployed', source: { owner: 'acme', repo: 'erp-sync' } },
            },
        } as never);
        const svc = require('@/core/di').ServiceLocator.getAuthenticationService();
        svc.getOrganizationsSdkOnly = jest.fn().mockResolvedValue([{ id: 'org123' }]);

        await handleVerifyDeployable(mockContext, { id: 'erp-sync' });

        expect(mockDeployDeployable).not.toHaveBeenCalled();
        expect(mockAddDeployable).not.toHaveBeenCalled();
    });

    it('posts an error outcome when the probe cannot reach the org', async () => {
        const { mockContext } = setupMocks({
            deployables: {
                'erp-sync': { kind: 'integration', status: 'deployed', source: { owner: 'acme', repo: 'erp-sync' } },
            },
        } as never);
        const svc = require('@/core/di').ServiceLocator.getAuthenticationService();
        svc.getOrganizationsSdkOnly = jest.fn().mockResolvedValue([]);

        const result = await handleVerifyDeployable(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(true); // handler resolved (P2: typed outcome, no throw)
        expect(mockSendDeployableStatusUpdate).toHaveBeenCalledWith(
            'erp-sync', 'error', expect.any(String),
        );
    });
});
