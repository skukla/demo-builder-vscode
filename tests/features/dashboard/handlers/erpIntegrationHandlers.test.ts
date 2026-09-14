/**
 * erpIntegrationHandlers — the ERP pair's two verbs (plan step 05).
 *
 * The ERP client, the auth resolver, the catalog loader and the guards are
 * mocked; assertions pin the ARGUMENTS each collaborator receives and the shape
 * each handler answers — a mock cannot see a malformed call.
 */

import type { AppBuilderComponentState, Project } from '@/types/base';

const mockProgressTitles: string[] = [];
jest.mock('vscode', () => {
    const vscode = jest.requireActual('../../../__mocks__/vscode') as { window: Record<string, unknown> };
    vscode.window.withProgress = async (
        options: { title: string },
        task: (p: { report: (value: { message?: string }) => void }) => unknown,
    ) => {
        mockProgressTitles.push(options.title);
        return task({ report: () => undefined });
    };
    return vscode;
});

const mockResolveAppManagementAuth = jest.fn();
jest.mock('@/features/project-creation/services/appBuilderComponentRunnerDeps', () => ({
    buildDefaultRunnerDeps: jest.fn(),
    buildRunnerDepsContext: jest.fn(async () => ({})),
    resolveAppManagementAuth: (...a: unknown[]) => mockResolveAppManagementAuth(...a),
}));

const mockStatus = jest.fn();
const mockReset = jest.fn();
const mockClientCtor = jest.fn();
jest.mock('@/features/app-builder/services/erpIntegrationClient', () => ({
    ...jest.requireActual('@/features/app-builder/services/erpIntegrationClient'),
    ErpIntegrationClient: class {
        constructor(...args: unknown[]) {
            mockClientCtor(...args);
        }
        status = () => mockStatus();
        reset = () => mockReset();
    },
}));

jest.mock('@/features/components/services/appBuilderComponentCatalogLoader', () => ({
    getBoundSystem: jest.fn((id: string) =>
        id === 'erp-integration' ? { id: 'demo-erp', kind: 'system', boundTo: 'erp-integration' } : undefined,
    ),
    getAppBuilderComponentEntry: jest.fn(),
    buildCustomIntegrationEntry: jest.fn(),
    entryFitsProjectAxes: jest.fn().mockReturnValue(true),
}));

jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(() => ({
            getTokenManager: () => ({ inspectToken: jest.fn(async () => ({ valid: false })) }),
            getCachedOrganization: jest.fn(),
            testDeveloperPermissions: jest.fn().mockResolvedValue({ hasPermissions: true }),
        })),
        getCommandExecutor: jest.fn(() => ({ execute: jest.fn() })),
    },
}));

const mockEnsureAdobeIOAuth = jest.fn();
jest.mock('@/core/auth/adobeAuthGuard', () => ({
    ensureAdobeIOAuth: (...a: unknown[]) => mockEnsureAdobeIOAuth(...a),
}));
const mockDetectProjectOrgMismatch = jest.fn();
jest.mock('@/features/authentication/services/detectProjectOrgMismatch', () => ({
    detectProjectOrgMismatch: (...a: unknown[]) => mockDetectProjectOrgMismatch(...a),
}));
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

import { handleGetErpStatus, handleResetErpRecords } from '@/features/dashboard/handlers/erpIntegrationHandlers';
import { setupMocks } from './dashboardHandlers.testUtils';
import { ErrorCode } from '@/types/errorCodes';

const INT_URLS = {
    'runtime/erp/status': 'https://ns.adobeioruntime.net/api/v1/web/erp/status',
    'runtime/erp/reset': 'https://ns.adobeioruntime.net/api/v1/web/erp/reset',
};
const INTEGRATION: AppBuilderComponentState = {
    kind: 'integration',
    status: 'deployed',
    name: 'Nordwind integration',
    source: { owner: 'skukla', repo: 'commerce-erp-integration' },
    deployedUrls: INT_URLS,
};
const ERP: AppBuilderComponentState = {
    kind: 'system',
    status: 'deployed',
    name: 'Nordwind',
    source: { owner: 'skukla', repo: 'demo-erp' },
    url: 'https://ns.adobeio-static.net/index.html',
    lastDeployed: '2026-09-14T00:00:00Z',
};
function pairProject(over: Partial<AppBuilderComponentState> = {}): Partial<Project> {
    return { appBuilderComponents: { 'erp-integration': { ...INTEGRATION, ...over }, 'demo-erp': { ...ERP } } };
}

/** setupMocks installs its own auth service; the guard chain's third step needs this on it. */
function allowDeveloperRole(): void {
    const { ServiceLocator } = require('@/core/di/serviceLocator');
    ServiceLocator.getAuthenticationService().testDeveloperPermissions = jest
        .fn()
        .mockResolvedValue({ hasPermissions: true });
}
const LIVE = { app: { id: 'erp', version: '1' }, erp: { reachable: true, ok: true }, erpBaseUrl: 'x', ledger: { entries: 3 } };

beforeEach(() => {
    jest.clearAllMocks();
    mockProgressTitles.length = 0;
    mockResolveAppManagementAuth.mockResolvedValue({ accessToken: 'fake-test-pw-not-a-secret', imsOrgId: 'ABC@AdobeOrg' });
    mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
    mockDetectProjectOrgMismatch.mockResolvedValue({ reachable: true });
    mockStatus.mockResolvedValue(LIVE);
    mockReset.mockResolvedValue({ reverted: { reverted: 2, failed: [] }, mirrored: { counts: { products: 40, companies: 3 } } });
});

describe('handleGetErpStatus', () => {
    it("builds the client from the integration's URLs and the sign-in, and answers both rows plus the live status", async () => {
        const { mockContext } = setupMocks(pairProject());

        const result = await handleGetErpStatus(mockContext, { id: 'erp-integration' });

        expect(mockClientCtor).toHaveBeenCalledWith(INT_URLS, expect.objectContaining({ imsOrgId: 'ABC@AdobeOrg' }));
        expect(result).toEqual({
            success: true,
            data: {
                id: 'erp-integration',
                integration: { name: 'Nordwind integration', status: 'deployed' },
                erp: { id: 'demo-erp', name: 'Nordwind', status: 'deployed', url: ERP.url, lastDeployed: ERP.lastDeployed },
                live: LIVE,
            },
        });
        // A read: no guard ran.
        expect(mockEnsureAdobeIOAuth).not.toHaveBeenCalled();
    });

    it('refuses an integration that deploys no erp actions', async () => {
        const { mockContext } = setupMocks({
            appBuilderComponents: { kit: { ...INTEGRATION, deployedUrls: { 'web/x': 'https://x/api/v1/web/app-management/installation' } } },
        });
        const result = await handleGetErpStatus(mockContext, { id: 'kit' });
        expect(result).toMatchObject({ success: false, code: ErrorCode.INVALID_OPERATION });
        expect(result.error).toMatch(/has no ERP/);
    });

    it('answers AUTH_REQUIRED typed, never a dialog, with no sign-in', async () => {
        const { mockContext } = setupMocks(pairProject());
        mockResolveAppManagementAuth.mockResolvedValue(undefined);
        const result = await handleGetErpStatus(mockContext, { id: 'erp-integration' });
        expect(result).toMatchObject({ success: false, code: ErrorCode.AUTH_REQUIRED });
        expect(mockClientCtor).not.toHaveBeenCalled();
    });

    it('a failed read is reported, not thrown', async () => {
        const { mockContext } = setupMocks(pairProject());
        mockStatus.mockRejectedValue(new Error('ERP status answered 502: bad gateway'));
        const result = await handleGetErpStatus(mockContext, { id: 'erp-integration' });
        expect(result).toEqual({ success: false, error: 'Could not read the ERP status: ERP status answered 502: bad gateway' });
    });
});

describe('handleResetErpRecords', () => {
    it('guards, runs the reset under a progress notification, and answers the report', async () => {
        const { mockContext } = setupMocks(pairProject());
        allowDeveloperRole();

        const result = await handleResetErpRecords(mockContext, { id: 'erp-integration' });

        expect(mockEnsureAdobeIOAuth).toHaveBeenCalledTimes(1);
        expect(mockProgressTitles).toEqual(['Resetting Nordwind records']);
        expect(mockReset).toHaveBeenCalledTimes(1);
        expect(result).toEqual({
            success: true,
            data: {
                id: 'erp-integration',
                erp: { id: 'demo-erp', name: 'Nordwind', status: 'deployed', url: ERP.url, lastDeployed: ERP.lastDeployed },
                report: { reverted: { reverted: 2, failed: [] }, mirrored: { counts: { products: 40, companies: 3 } } },
            },
        });
    });

    it('refuses an undeployed integration before any call', async () => {
        const { mockContext } = setupMocks(pairProject({ status: 'error' }));
        const result = await handleResetErpRecords(mockContext, { id: 'erp-integration' });
        expect(result).toMatchObject({ success: false, code: ErrorCode.INVALID_OPERATION });
        expect(mockReset).not.toHaveBeenCalled();
    });

    it('a failed guard blocks before the reset runs', async () => {
        const { mockContext } = setupMocks(pairProject());
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false, error: 'Sign in first' });
        const result = await handleResetErpRecords(mockContext, { id: 'erp-integration' });
        expect(result.success).toBe(false);
        expect(mockReset).not.toHaveBeenCalled();
    });

    it("a reset the action refuses is answered as a failure with the action's words", async () => {
        const { mockContext } = setupMocks(pairProject());
        allowDeveloperRole();
        mockReset.mockRejectedValue(new Error('ERP reset answered 500: ERP wipe answered 503'));
        const result = await handleResetErpRecords(mockContext, { id: 'erp-integration' });
        expect(result).toEqual({ success: false, error: 'The ERP reset did not finish: ERP reset answered 500: ERP wipe answered 503' });
    });

    it('needs an id, even with no payload at all', async () => {
        const { mockContext } = setupMocks(pairProject());
        const result = await handleResetErpRecords(mockContext, undefined);
        expect(result.success).toBe(false);
    });
});
