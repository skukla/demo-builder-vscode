/**
 * erpIntegrationHandlers — the ERP pair's verbs (plan step 05) and the Admin page's two reads.
 *
 * The ERP client, the auth resolver, the catalog loader and the guards are
 * mocked (erpIntegrationHandlers.testUtils); assertions pin the ARGUMENTS each collaborator
 * receives and the shape each handler answers — a mock cannot see a malformed call.
 */

import {
    ERP,
    ERP_URLS,
    INTEGRATION,
    INT_URLS,
    LIVE,
    allowDeveloperRole,
    handleFollowErpOrder,
    handleGetErpStatus,
    handleLookupErpRecord,
    handleReadErpApi,
    handleResetErpRecords,
    handleWriteErpApi,
    mockCallErpApi,
    mockClientCtor,
    mockDetach,
    mockEnsureAdobeIOAuth,
    mockFillErpForProject,
    mockLookup,
    mockResolveAppManagementAuth,
    mockStatus,
    mockTraceOrder,
    pairProject,
    resetErpHandlerMocks,
    setupMocks,
    vscode,
} from './erpIntegrationHandlers.testUtils';
import { ErrorCode } from '@/types/errorCodes';

beforeEach(() => {
    resetErpHandlerMocks();
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
                // Every ERP the integration serves (AB-16); one here.
                erps: [{ id: 'demo-erp', name: 'Nordwind', status: 'deployed', url: ERP.url, lastDeployed: ERP.lastDeployed }],
                live: LIVE,
            },
        });
        // A read: no guard ran.
        expect(mockEnsureAdobeIOAuth).not.toHaveBeenCalled();
    });

    it("with an added ERP named, asks the integration for that ERP's health by its list id", async () => {
        const project = pairProject({ systems: ['demo-erp', 'demo-erp-2'] });
        project.appBuilderComponents!['demo-erp-2'] = { ...ERP, catalogId: 'demo-erp', name: 'Contoso', usedBy: 'erp-integration' };
        const { mockContext } = setupMocks(project);

        const result = await handleGetErpStatus(mockContext, { id: 'erp-integration', erp: 'demo-erp-2' });

        expect(mockStatus).toHaveBeenCalledWith('demo-erp-2');
        expect(result).toMatchObject({ success: true, data: { erp: { id: 'demo-erp-2', name: 'Contoso' } } });
    });

    it('with no ERP named, asks for the first ERP as before', async () => {
        const { mockContext } = setupMocks(pairProject());
        await handleGetErpStatus(mockContext, { id: 'erp-integration' });
        expect(mockStatus).toHaveBeenCalledWith(undefined);
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
    it('guards, then undoes, wipes and fills under one progress notification, and answers what each did', async () => {
        const { mockContext } = setupMocks(pairProject());
        allowDeveloperRole();

        const result = await handleResetErpRecords(mockContext, { id: 'erp-integration' });

        expect(mockEnsureAdobeIOAuth).toHaveBeenCalledTimes(1);
        const titles = (vscode.window.withProgress as jest.Mock).mock.calls.map(
            ([options]: [{ title: string }]) => options.title,
        );
        expect(titles).toEqual(['Resetting Nordwind records']);
        expect(mockDetach).toHaveBeenCalledTimes(1);
        // The ERP's own wipe, at its own URLs, with the sign-in.
        expect(mockCallErpApi).toHaveBeenCalledWith(ERP_URLS, expect.objectContaining({ imsOrgId: 'ABC@AdobeOrg' }), 'POST', 'admin/wipe', undefined);
        // Each ERP by its own id: an integration can serve several (AB-16).
        expect(mockFillErpForProject).toHaveBeenCalledWith(expect.any(Object), 'erp-integration', expect.any(Object), 'demo-erp');
        expect(result).toEqual({
            success: true,
            data: {
                id: 'erp-integration',
                erp: { id: 'demo-erp', name: 'Nordwind', status: 'deployed', url: ERP.url, lastDeployed: ERP.lastDeployed },
                report: {
                    undone: { reverted: { reverted: 2, failed: [] }, orders: { cleared: 1, failed: [] } },
                    erps: [
                        { id: 'demo-erp', name: 'Nordwind', wiped: { products: 40 }, loaded: { partners: 3, products: 40, skipped: 0 } },
                    ],
                },
            },
        });
    });

    it('refuses an undeployed integration before any call', async () => {
        const { mockContext } = setupMocks(pairProject({ status: 'error' }));
        const result = await handleResetErpRecords(mockContext, { id: 'erp-integration' });
        expect(result).toMatchObject({ success: false, code: ErrorCode.INVALID_OPERATION });
        expect(mockDetach).not.toHaveBeenCalled();
    });

    it('a failed guard blocks before the reset runs', async () => {
        const { mockContext } = setupMocks(pairProject());
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false, error: 'Sign in first' });
        const result = await handleResetErpRecords(mockContext, { id: 'erp-integration' });
        expect(result.success).toBe(false);
        expect(mockDetach).not.toHaveBeenCalled();
    });

    it("a wipe the ERP refuses stops the reset before the fill, in the ERP's words", async () => {
        const { mockContext } = setupMocks(pairProject());
        allowDeveloperRole();
        mockCallErpApi.mockResolvedValue({ ok: false, status: 503, body: {}, detail: 'database unavailable' });
        const result = await handleResetErpRecords(mockContext, { id: 'erp-integration' });
        expect(result).toEqual({
            success: false,
            error: "The ERP reset did not finish: Nordwind's wipe answered 503: database unavailable",
        });
        expect(mockFillErpForProject).not.toHaveBeenCalled();
    });

    it('a fill that stops after the wipe says the ERP was wiped but not filled', async () => {
        const { mockContext } = setupMocks(pairProject());
        allowDeveloperRole();
        mockFillErpForProject.mockResolvedValue({ status: 'failed', detail: 'Commerce answered 401 for products' });
        const result = await handleResetErpRecords(mockContext, { id: 'erp-integration' });
        expect(result).toEqual({
            success: false,
            error: 'The ERP reset did not finish: Nordwind was wiped but not filled again: Commerce answered 401 for products',
        });
    });

    it('answers a reset whose prices were not published as done, with the note as its warning (AB-26z)', async () => {
        const { mockContext } = setupMocks(pairProject());
        allowDeveloperRole();
        const note = 'Demo data loaded; prices were not published: ERP prices answered 500: boom. Load demo data again to retry.';
        mockFillErpForProject.mockResolvedValue({
            status: 'filled',
            erpId: 'demo-erp',
            result: { partners: 3, products: 40, skipped: 0 },
            note,
        });

        const result = await handleResetErpRecords(mockContext, { id: 'erp-integration' });

        expect(result).toMatchObject({ success: true, data: { warning: note } });
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
