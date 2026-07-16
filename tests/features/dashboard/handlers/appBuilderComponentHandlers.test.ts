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
 * The guard order is auth → org-mismatch → App Builder permission; a failing guard surfaces the message and NEVER calls the runner.
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

// ---- runner deps factory + context builder (both now live in runnerDeps) ---
const mockBuildDefaultRunnerDeps = jest.fn(() => ({ catalog: [], _deps: true }));
const mockBuildRunnerDepsContext = jest.fn(async () => ({
    subscriberClient: { _client: true },
    getCachedOrganization: () => undefined,
    secrets: { _secrets: true },
}));
jest.mock('@/features/app-builder/services/appBuilderComponentRunnerDeps', () => ({
    buildDefaultRunnerDeps: (...a: unknown[]) => mockBuildDefaultRunnerDeps(...a),
    buildRunnerDepsContext: (...a: unknown[]) => mockBuildRunnerDepsContext(...a),
}));

// ---- catalog loader --------------------------------------------------------
const mockGetAppBuilderComponentEntry = jest.fn();
const mockBuildCustomIntegrationEntry = jest.fn((source: { owner: string; repo: string; branch?: string }) => ({
    id: `${source.owner}-${source.repo}`,
    name: source.repo,
    description: `Custom App Builder component from ${source.owner}/${source.repo}`,
    kind: 'integration' as const,
    source: { owner: source.owner, repo: source.repo, branch: source.branch ?? 'main' },
}));
jest.mock('@/features/project-creation/services/appBuilderComponentCatalogLoader', () => ({
    getAppBuilderComponentEntry: (...a: unknown[]) => mockGetAppBuilderComponentEntry(...a),
    buildCustomIntegrationEntry: (...a: unknown[]) => mockBuildCustomIntegrationEntry(...a),
}));

// ---- guards (auth → org-mismatch → permission) ------------------------------
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
    handleRenameAppBuilderComponent,
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
        expect(mockBuildRunnerDepsContext).toHaveBeenCalledWith(mockContext, mockProject);
        expect(mockBuildDefaultRunnerDeps).toHaveBeenCalledWith(
            expect.objectContaining({
                subscriberClient: expect.anything(),
                getCachedOrganization: expect.any(Function),
                secrets: expect.anything(),
            }),
        );
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
        // Trailing undefined = the optional display-name slot (rename channel);
        // deploy-path pushes never carry a name.
        expect(mockSendAppBuilderComponentStatusUpdate).toHaveBeenCalledWith(
            'erp-sync', 'error', expect.stringContaining('clone failed'), undefined,
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

describe('handleRenameAppBuilderComponent (display name only — shell instancing Step 10)', () => {
    /** The keyed integration entry under rename (deployed, already named). */
    const KEYED_ENTRY = {
        kind: 'integration' as const,
        status: 'deployed' as const,
        name: 'Firefly Image Gen',
        source: { owner: 'skukla', repo: 'app-builder-shell', branch: 'main' },
        url: 'https://firefly.example.com',
    };

    function setupRename(entryOverrides: Partial<typeof KEYED_ENTRY> | null = {}) {
        const mocks = setupMocks({
            appBuilderComponents:
                entryOverrides === null
                    ? {}
                    : { 'firefly-image-gen': { ...KEYED_ENTRY, ...entryOverrides } },
        } as never);
        // An AI-built instance id never resolves in the catalog (the beforeEach
        // default returns ERP_ENTRY for the add path — rename must see undefined).
        mockGetAppBuilderComponentEntry.mockReturnValue(undefined);
        const vscode = require('vscode');
        vscode.window.showInputBox = jest.fn().mockResolvedValue(undefined);
        return { ...mocks, showInputBox: vscode.window.showInputBox as jest.Mock };
    }

    it('persists the trimmed new name on the keyed entry and saves the project', async () => {
        const { mockContext, showInputBox } = setupRename();
        showInputBox.mockResolvedValue('  Firefly Video Gen  ');

        const result = await handleRenameAppBuilderComponent(mockContext, {
            id: 'firefly-image-gen',
        });

        expect(result.success).toBe(true);
        const saved = (mockContext.stateManager.saveProject as jest.Mock).mock.calls[0][0];
        // The name changes IN PLACE on the keyed entry — id (map key), kind,
        // status, source, and url are untouched.
        expect(saved.appBuilderComponents['firefly-image-gen']).toEqual({
            ...KEYED_ENTRY,
            name: 'Firefly Video Gen',
        });
    });

    it('pushes the row-status refresh with the CURRENT status and the new name (label update)', async () => {
        const { mockContext, showInputBox } = setupRename();
        showInputBox.mockResolvedValue('Firefly Video Gen');

        await handleRenameAppBuilderComponent(mockContext, { id: 'firefly-image-gen' });

        expect(mockSendAppBuilderComponentStatusUpdate).toHaveBeenCalledWith(
            'firefly-image-gen',
            'deployed',
            undefined,
            'Firefly Video Gen',
        );
    });

    it('prefills the input with the current display name (falls back to the id when unnamed)', async () => {
        const { mockContext, showInputBox } = setupRename();
        await handleRenameAppBuilderComponent(mockContext, { id: 'firefly-image-gen' });
        expect(showInputBox).toHaveBeenCalledWith(
            expect.objectContaining({ value: 'Firefly Image Gen' }),
        );

        const unnamed = setupRename({ name: undefined });
        await handleRenameAppBuilderComponent(unnamed.mockContext, { id: 'firefly-image-gen' });
        expect(unnamed.showInputBox).toHaveBeenCalledWith(
            expect.objectContaining({ value: 'firefly-image-gen' }),
        );
    });

    it('rejects whitespace-only input via the validateInput fn (tested directly)', async () => {
        const { mockContext, showInputBox } = setupRename();
        await handleRenameAppBuilderComponent(mockContext, { id: 'firefly-image-gen' });

        const { validateInput } = showInputBox.mock.calls[0][0];
        expect(validateInput('   ')).toEqual(expect.any(String)); // rejected with a message
        expect(validateInput('')).toEqual(expect.any(String));
        expect(validateInput('Firefly Video Gen')).toBeUndefined(); // accepted
    });

    it('cancel (input box dismissed) writes NOTHING and pushes nothing', async () => {
        const { mockContext, showInputBox } = setupRename();
        showInputBox.mockResolvedValue(undefined);

        const result = await handleRenameAppBuilderComponent(mockContext, {
            id: 'firefly-image-gen',
        });

        expect(result.success).toBe(true); // cancel is not an error
        expect(mockContext.stateManager.saveProject).not.toHaveBeenCalled();
        expect(mockSendAppBuilderComponentStatusUpdate).not.toHaveBeenCalled();
    });

    it('rejects a rename when the id is a pre-built CATALOG integration (redeploy reverts it)', async () => {
        // The runner resolves catalog-first and rewrites `name: entry.name` on
        // every redeploy, so a catalog-id rename would be silently reverted.
        // Same exclusion the settings serializer applies (deriveAppBuilderComponentSources).
        const { mockContext, showInputBox } = setupRename();
        mockGetAppBuilderComponentEntry.mockReturnValue({
            ...ERP_ENTRY,
            id: 'firefly-image-gen',
        });

        const result = await handleRenameAppBuilderComponent(mockContext, {
            id: 'firefly-image-gen',
        });

        expect(result.success).toBe(false);
        expect(showInputBox).not.toHaveBeenCalled();
        expect(mockContext.stateManager.saveProject).not.toHaveBeenCalled();
        expect(mockSendAppBuilderComponentStatusUpdate).not.toHaveBeenCalled();
    });

    it('still renames a custom-import entry (id not in the catalog)', async () => {
        const { mockContext, showInputBox } = setupRename({
            name: undefined,
            source: { owner: 'acme', repo: 'erp-sync', branch: 'main' },
        });
        showInputBox.mockResolvedValue('Acme ERP');

        const result = await handleRenameAppBuilderComponent(mockContext, {
            id: 'firefly-image-gen',
        });

        expect(result.success).toBe(true);
        expect(mockGetAppBuilderComponentEntry).toHaveBeenCalledWith('firefly-image-gen');
        const saved = (mockContext.stateManager.saveProject as jest.Mock).mock.calls[0][0];
        expect(saved.appBuilderComponents['firefly-image-gen'].name).toBe('Acme ERP');
    });

    it('rejects a duplicate of ANOTHER integration display name via validateInput (wizard parity)', async () => {
        // Same case-insensitive, trimmed duplicate rule RenameIntegrationModal
        // applies in the wizard — against the OTHER entries' `name ?? id`.
        const mocks = setupMocks({
            appBuilderComponents: {
                'firefly-image-gen': { ...KEYED_ENTRY },
                'order-sync': {
                    kind: 'integration',
                    status: 'deployed',
                    name: 'Order Sync',
                    source: { owner: 'skukla', repo: 'app-builder-shell', branch: 'main' },
                },
                'unnamed-import': {
                    kind: 'integration',
                    status: 'deployed',
                    source: { owner: 'acme', repo: 'unnamed-import', branch: 'main' },
                },
            },
        } as never);
        mockGetAppBuilderComponentEntry.mockReturnValue(undefined);
        const vscode = require('vscode');
        vscode.window.showInputBox = jest.fn().mockResolvedValue(undefined);

        await handleRenameAppBuilderComponent(mocks.mockContext, { id: 'firefly-image-gen' });

        const { validateInput } = (vscode.window.showInputBox as jest.Mock).mock.calls[0][0];
        expect(validateInput('Order Sync')).toEqual(expect.any(String)); // exact duplicate
        expect(validateInput('  order sync  ')).toEqual(expect.any(String)); // case/trim variant
        expect(validateInput('unnamed-import')).toEqual(expect.any(String)); // other row's id fallback
        expect(validateInput('Firefly Image Gen')).toBeUndefined(); // own current name allowed
        expect(validateInput('Fresh Name')).toBeUndefined(); // new unique name allowed
    });

    it('never prompts for a mesh-kind entry (fixed "API Mesh" identity)', async () => {
        const { mockContext, showInputBox } = setupRename({ kind: 'mesh' as never });

        const result = await handleRenameAppBuilderComponent(mockContext, {
            id: 'firefly-image-gen',
        });

        expect(result.success).toBe(false);
        expect(showInputBox).not.toHaveBeenCalled();
        expect(mockContext.stateManager.saveProject).not.toHaveBeenCalled();
    });

    it('fails for an unknown id and for a missing id', async () => {
        const { mockContext, showInputBox } = setupRename(null);

        const unknown = await handleRenameAppBuilderComponent(mockContext, { id: 'nope' });
        expect(unknown.success).toBe(false);

        const missing = await handleRenameAppBuilderComponent(mockContext, {});
        expect(missing.success).toBe(false);
        expect(showInputBox).not.toHaveBeenCalled();
    });

    it('runs NO Adobe guards — rename is a local metadata write (works offline)', async () => {
        const { mockContext, showInputBox } = setupRename();
        showInputBox.mockResolvedValue('Renamed');

        await handleRenameAppBuilderComponent(mockContext, { id: 'firefly-image-gen' });

        expect(mockEnsureAdobeIOAuth).not.toHaveBeenCalled();
        expect(mockDetectProjectOrgMismatch).not.toHaveBeenCalled();
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
        // Trailing undefined = the optional display-name slot (rename channel).
        expect(mockSendAppBuilderComponentStatusUpdate).toHaveBeenCalledWith(
            'erp-sync', 'deployed', undefined, undefined,
        );
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
        // Trailing undefined = the optional display-name slot (rename channel).
        expect(mockSendAppBuilderComponentStatusUpdate).toHaveBeenCalledWith(
            'erp-sync', 'error', expect.any(String), undefined,
        );
    });
});
