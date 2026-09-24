/**
 * erpIntegrationHandlers — the ERP pair's verbs (plan step 05) and the Admin page's two reads.
 *
 * The ERP client, the auth resolver, the catalog loader and the guards are
 * mocked; assertions pin the ARGUMENTS each collaborator receives and the shape
 * each handler answers — a mock cannot see a malformed call.
 */

import type { AppBuilderComponentState, Project } from '@/types/base';

const mockResolveAppManagementAuth = jest.fn();
jest.mock('@/features/project-creation/services/appBuilderComponentRunnerDeps', () => ({
    buildDefaultRunnerDeps: jest.fn(),
    buildRunnerDepsContext: jest.fn(async () => ({})),
    resolveAppManagementAuth: (...a: unknown[]) => mockResolveAppManagementAuth(...a),
}));

const mockStatus = jest.fn();
const mockReset = jest.fn();
const mockLookup = jest.fn();
const mockTraceOrder = jest.fn();
const mockCallErpApi = jest.fn();
const mockClientCtor = jest.fn();
jest.mock('@/features/app-builder/services/erpIntegrationClient', () => ({
    ...jest.requireActual('@/features/app-builder/services/erpIntegrationClient'),
    callErpApi: (...args: unknown[]) => mockCallErpApi(...args),
    ErpIntegrationClient: class {
        constructor(...args: unknown[]) {
            mockClientCtor(...args);
        }
        status = () => mockStatus();
        reset = () => mockReset();
        lookup = (query: unknown) => mockLookup(query);
        traceOrder = (orderNumber: string) => mockTraceOrder(orderNumber);
    },
}));

jest.mock('@/features/components/services/appBuilderComponentCatalogLoader', () => ({
    getAppBuilderComponentCatalog: jest.fn(() => [{ id: 'demo-erp', kind: 'system', boundTo: 'erp-integration' }]),
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

import { setupMocks } from './dashboardHandlers.testUtils';
import * as vscode from 'vscode';
import {
    handleFollowErpOrder,
    handleGetErpStatus,
    handleLookupErpRecord,
    handleReadErpApi,
    handleResetErpRecords,
    handleWriteErpApi,
} from '@/features/dashboard/handlers/erpIntegrationHandlers';
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
const ERP_URLS = {
    'runtime/demo-erp/partners': 'https://ns.adobeioruntime.net/api/v1/web/demo-erp/partners',
    'runtime/demo-erp/orders': 'https://ns.adobeioruntime.net/api/v1/web/demo-erp/orders',
};
const ERP: AppBuilderComponentState = {
    kind: 'system',
    status: 'deployed',
    name: 'Nordwind',
    source: { owner: 'skukla', repo: 'demo-erp' },
    deployedUrls: ERP_URLS,
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
        const titles = (vscode.window.withProgress as jest.Mock).mock.calls.map(
            ([options]: [{ title: string }]) => options.title,
        );
        expect(titles).toEqual(['Resetting Nordwind records']);
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

describe('handleLookupErpRecord', () => {
    // Shapes from the integration's lib/lookup.js (read 2026-09-24).
    const LOOKUP = { kind: 'company', key: '3', found: { commerce: true, erp: true }, rows: [], erpHash: '#partners?open=C000102' };

    it('asks the integration for the company by its Commerce id and answers the lookup beside the ERP row', async () => {
        mockLookup.mockResolvedValue(LOOKUP);
        const { mockContext } = setupMocks(pairProject());

        const result = await handleLookupErpRecord(mockContext, { id: 'erp-integration', company: ' 3 ' });

        expect(mockClientCtor).toHaveBeenCalledWith(INT_URLS, expect.objectContaining({ imsOrgId: 'ABC@AdobeOrg' }));
        expect(mockLookup).toHaveBeenCalledWith({ company: '3' });
        expect(result).toEqual({
            success: true,
            data: { id: 'erp-integration', erp: expect.objectContaining({ id: 'demo-erp' }), lookup: LOOKUP },
        });
        expect(mockEnsureAdobeIOAuth).not.toHaveBeenCalled();
    });

    it('asks by SKU when a sku is named', async () => {
        mockLookup.mockResolvedValue({ ...LOOKUP, kind: 'product', key: 'P-1' });
        const { mockContext } = setupMocks(pairProject());

        await handleLookupErpRecord(mockContext, { id: 'erp-integration', sku: 'P-1' });

        expect(mockLookup).toHaveBeenCalledWith({ sku: 'P-1' });
    });

    it('refuses none, both, a malformed SKU and a non-numeric company id before any call', async () => {
        const { mockContext } = setupMocks(pairProject());
        const bad = [
            { id: 'erp-integration' },
            { id: 'erp-integration', sku: 'P-1', company: '3' },
            { id: 'erp-integration', sku: 'a"b' },
            { id: 'erp-integration', company: 'C000102' },
        ];
        for (const payload of bad) {
            const result = await handleLookupErpRecord(mockContext, payload);
            expect(result).toMatchObject({ success: false, code: ErrorCode.CONFIG_INVALID });
        }
        expect(mockClientCtor).not.toHaveBeenCalled();
    });

    it('a failed read is reported, not thrown', async () => {
        mockLookup.mockRejectedValue(new Error('ERP lookup answered 500: the ERP answered 503 for partners'));
        const { mockContext } = setupMocks(pairProject());

        const result = await handleLookupErpRecord(mockContext, { id: 'erp-integration', sku: 'P-1' });

        expect(result).toEqual({ success: false, error: expect.stringContaining('the ERP answered 503') });
    });
});

describe('handleFollowErpOrder', () => {
    // Shape from the integration's lib/order-trace.js buildOrderTrace (read 2026-09-24).
    const TRACE = {
        summary: { incrementId: '000000123', commerceStatus: 'processing', erpNumber: '0000001003', erpStatus: 'confirmed', reachedErp: true },
        steps: [{ at: '2026-09-24T10:00:00Z', where: 'commerce', what: 'Order 000000123 placed' }],
    };

    it('asks the integration to trace the order and answers the trace beside the ERP row', async () => {
        mockTraceOrder.mockResolvedValue(TRACE);
        const { mockContext } = setupMocks(pairProject());

        const result = await handleFollowErpOrder(mockContext, { id: 'erp-integration', orderNumber: '000000123' });

        expect(mockTraceOrder).toHaveBeenCalledWith('000000123');
        expect(result).toEqual({
            success: true,
            data: { id: 'erp-integration', erp: expect.objectContaining({ id: 'demo-erp' }), orderNumber: '000000123', trace: TRACE },
        });
    });

    it('refuses a missing or malformed order number before any call', async () => {
        const { mockContext } = setupMocks(pairProject());
        for (const payload of [{ id: 'erp-integration' }, { id: 'erp-integration', orderNumber: '12 3' }]) {
            const result = await handleFollowErpOrder(mockContext, payload);
            expect(result).toMatchObject({ success: false, code: ErrorCode.CONFIG_INVALID });
        }
        expect(mockClientCtor).not.toHaveBeenCalled();
    });

    it('answers AUTH_REQUIRED typed, never a dialog, with no sign-in', async () => {
        mockResolveAppManagementAuth.mockResolvedValue(undefined);
        const { mockContext } = setupMocks(pairProject());

        const result = await handleFollowErpOrder(mockContext, { id: 'erp-integration', orderNumber: '000000123' });

        expect(result).toMatchObject({ success: false, code: ErrorCode.AUTH_REQUIRED });
        expect(mockTraceOrder).not.toHaveBeenCalled();
    });
});

describe("the ERP's own API (readErpApi / writeErpApi)", () => {
    it("GETs the route against the ERP's deployed URLs with the sign-in and answers the body", async () => {
        mockCallErpApi.mockResolvedValue({ ok: true, status: 200, body: { items: [{ id: 'C21' }] }, detail: '' });
        const { mockContext } = setupMocks(pairProject());

        const result = await handleReadErpApi(mockContext, { id: 'erp-integration', path: 'partners' });

        expect(mockCallErpApi).toHaveBeenCalledWith(
            ERP_URLS,
            expect.objectContaining({ imsOrgId: 'ABC@AdobeOrg' }),
            'GET',
            'partners',
            undefined,
        );
        expect(result).toEqual({
            success: true,
            data: {
                id: 'erp-integration',
                erp: expect.objectContaining({ id: 'demo-erp' }),
                method: 'GET',
                path: 'partners',
                answer: { items: [{ id: 'C21' }] },
            },
        });
        expect(mockEnsureAdobeIOAuth).not.toHaveBeenCalled();
    });

    it('a write passes the method and body through, and answers what the ERP answered', async () => {
        mockCallErpApi.mockResolvedValue({ ok: true, status: 200, body: { number: '0000001003', status: 'confirmed' }, detail: '' });
        const { mockContext } = setupMocks(pairProject());

        const result = await handleWriteErpApi(mockContext, {
            id: 'erp-integration',
            method: 'post',
            path: 'orders/0000001003/confirm',
            body: { reason: 'demo' },
        });

        expect(mockCallErpApi).toHaveBeenCalledWith(ERP_URLS, expect.anything(), 'POST', 'orders/0000001003/confirm', { reason: 'demo' });
        expect(result).toMatchObject({ success: true, data: { method: 'POST', answer: { status: 'confirmed' } } });
    });

    it('refuses a missing route, a GET on the write verb, and a malformed route the client refuses', async () => {
        const { mockContext } = setupMocks(pairProject());

        expect(await handleReadErpApi(mockContext, { id: 'erp-integration' })).toMatchObject({ success: false, code: ErrorCode.CONFIG_INVALID });
        expect(await handleWriteErpApi(mockContext, { id: 'erp-integration', method: 'GET', path: 'partners' })).toMatchObject({
            success: false,
            code: ErrorCode.CONFIG_INVALID,
        });
        mockCallErpApi.mockResolvedValue({ refusal: 'An ERP route is <action>[/<rest>]' });
        expect(await handleReadErpApi(mockContext, { id: 'erp-integration', path: '../x' })).toMatchObject({
            success: false,
            code: ErrorCode.CONFIG_INVALID,
        });
    });

    it("an ERP error is answered with its status and words, and a long answer is cut and declared", async () => {
        mockCallErpApi.mockResolvedValue({ ok: false, status: 409, body: {}, detail: 'order already confirmed' });
        const { mockContext } = setupMocks(pairProject());
        expect(await handleWriteErpApi(mockContext, { id: 'erp-integration', method: 'POST', path: 'orders/1/confirm' })).toEqual({
            success: false,
            error: 'The ERP answered 409 for POST orders/1/confirm: order already confirmed',
        });

        mockCallErpApi.mockResolvedValue({ ok: true, status: 200, body: { items: 'x'.repeat(40_000) }, detail: '' });
        const result = await handleReadErpApi(mockContext, { id: 'erp-integration', path: 'orders' });
        expect(result).toMatchObject({ success: true, data: { answer: { truncated: true, chars: expect.any(Number) } } });
    });
});
