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
    handleFollowErpOrder,
    handleGetErpSettings,
    handleGetErpStatus,
    handleLookupErpRecord,
    handleReadErpApi,
    handleSetErpSettings,
    handleWriteErpApi,
    mockCallErpApi,
    mockClientCtor,
    mockEnsureAdobeIOAuth,
    mockLookup,
    mockResolveAppManagementAuth,
    mockResolvedSettings,
    mockStatus,
    mockTraceOrder,
    mockUpdateErpSettings,
    pairProject,
    resetErpHandlerMocks,
    setupMocks,
} from './erpIntegrationHandlers.testUtils';
import { ErrorCode } from '@/types/errorCodes';

const mockApplyOwnership = jest.fn();
jest.mock('@/features/project-creation/services/erpOwnershipReconcile', () => ({
    applyErpOwnership: (...a: unknown[]) => mockApplyOwnership(...a),
}));

beforeEach(() => {
    resetErpHandlerMocks();
});

describe('handleGetErpStatus', () => {
    it("builds the client from the integration's URLs and the sign-in, and answers both rows plus the live status", async () => {
        const { mockContext } = setupMocks(pairProject());

        const result = await handleGetErpStatus(mockContext, { id: 'erp-integration' });

        expect(mockClientCtor).toHaveBeenCalledWith(
            INT_URLS,
            expect.objectContaining({ imsOrgId: 'ABC@AdobeOrg' })
        );
        expect(result).toEqual({
            success: true,
            data: {
                id: 'erp-integration',
                integration: { name: 'Nordwind integration', status: 'deployed' },
                erp: {
                    id: 'demo-erp',
                    name: 'Nordwind',
                    status: 'deployed',
                    url: ERP.url,
                    lastDeployed: ERP.lastDeployed,
                },
                // Every ERP the integration serves (AB-16); one here.
                erps: [
                    {
                        id: 'demo-erp',
                        name: 'Nordwind',
                        status: 'deployed',
                        url: ERP.url,
                        lastDeployed: ERP.lastDeployed,
                    },
                ],
                live: LIVE,
            },
        });
        // A read: no guard ran.
        expect(mockEnsureAdobeIOAuth).not.toHaveBeenCalled();
    });

    it("carries each ERP's list id, the value a product's erp_owner takes (AB-51)", async () => {
        // Nothing else showed it: the setup checklist told the SC to set erp_owner
        // and no surface said to what (2026-09-30).
        const project = pairProject();
        project.appBuilderComponents!['demo-erp'] = { ...ERP, listId: 'nordwind' };
        const { mockContext } = setupMocks(project);

        const result = await handleGetErpStatus(mockContext, { id: 'erp-integration' });

        const data = result.data as { erp: { listId?: string }; erps: Array<{ listId?: string }> };
        expect(data.erp.listId).toBe('nordwind');
        expect(data.erps.map((row) => row.listId)).toEqual(['nordwind']);
    });

    it("with an added ERP named, asks the integration for that ERP's health by its list id", async () => {
        const project = pairProject({ systems: ['demo-erp', 'demo-erp-2'] });
        project.appBuilderComponents!['demo-erp-2'] = {
            ...ERP,
            catalogId: 'demo-erp',
            name: 'Contoso',
            usedBy: 'erp-integration',
        };
        const { mockContext } = setupMocks(project);

        const result = await handleGetErpStatus(mockContext, {
            id: 'erp-integration',
            erp: 'demo-erp-2',
        });

        expect(mockStatus).toHaveBeenCalledWith('contoso');
        expect(result).toMatchObject({
            success: true,
            data: { erp: { id: 'demo-erp-2', name: 'Contoso' } },
        });
    });

    it('with no ERP named, asks for the first ERP as before', async () => {
        const { mockContext } = setupMocks(pairProject());
        await handleGetErpStatus(mockContext, { id: 'erp-integration' });
        expect(mockStatus).toHaveBeenCalledWith(undefined);
    });

    it('refuses an integration that deploys no erp actions', async () => {
        const { mockContext } = setupMocks({
            appBuilderComponents: {
                kit: {
                    ...INTEGRATION,
                    deployedUrls: { 'web/x': 'https://x/api/v1/web/app-management/installation' },
                },
            },
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
        expect(result).toEqual({
            success: false,
            error: 'Could not read the ERP status: ERP status answered 502: bad gateway',
        });
    });
});

describe('handleGetErpSettings (AB-16j)', () => {
    function twoErp() {
        const project = pairProject({ systems: ['demo-erp', 'demo-erp-2'] });
        project.appBuilderComponents!['demo-erp-2'] = {
            ...ERP,
            catalogId: 'demo-erp',
            name: 'Contoso',
            usedBy: 'erp-integration',
        };
        return project;
    }

    it("reads a named ERP's settings for a website, and answers them without a guard", async () => {
        const settings = {
            default: { structure_owns: 'attribute' },
            websites: { bodea: { structure_sales_org: '2000' } },
        };
        mockResolvedSettings.mockResolvedValue(settings);
        const { mockContext } = setupMocks(twoErp());

        const result = await handleGetErpSettings(mockContext, {
            id: 'erp-integration',
            erp: 'demo-erp-2',
            website: 'bodea',
        });

        expect(mockResolvedSettings).toHaveBeenCalledWith(['bodea'], 'contoso');
        expect(result).toEqual({
            success: true,
            data: {
                id: 'erp-integration',
                erp: {
                    id: 'demo-erp-2',
                    name: 'Contoso',
                    status: 'deployed',
                    url: ERP.url,
                    lastDeployed: ERP.lastDeployed,
                },
                website: 'bodea',
                settings,
            },
        });
        expect(mockEnsureAdobeIOAuth).not.toHaveBeenCalled();
    });

    it('with no website, reads the Default-Config settings (no website codes)', async () => {
        mockResolvedSettings.mockResolvedValue({ default: {}, websites: {} });
        const { mockContext } = setupMocks(twoErp());

        await handleGetErpSettings(mockContext, { id: 'erp-integration', erp: 'demo-erp-2' });

        expect(mockResolvedSettings).toHaveBeenCalledWith([], 'contoso');
    });
});

describe('handleSetErpSettings (AB-16j)', () => {
    function twoErp() {
        const project = pairProject({ systems: ['demo-erp', 'demo-erp-2'] });
        project.appBuilderComponents!['demo-erp-2'] = {
            ...ERP,
            catalogId: 'demo-erp',
            name: 'Contoso',
            usedBy: 'erp-integration',
        };
        return project;
    }

    it("saves the named ERP's values at a website scope and answers its entry", async () => {
        const entry = { id: 'demo-erp-2', name: 'Contoso' };
        mockUpdateErpSettings.mockResolvedValue({ entry });
        const { mockContext } = setupMocks(twoErp());

        const result = await handleSetErpSettings(mockContext, {
            id: 'erp-integration',
            erp: 'demo-erp-2',
            website: 'bodea',
            values: { structure_sales_org: '2000' },
        });

        expect(mockUpdateErpSettings).toHaveBeenCalledWith('contoso', 'bodea', {
            structure_sales_org: '2000',
        });
        // `erp` is the ERP as every ERP tool answers it; `entry.id` is the integration's
        // list id, which is the ERP's name slugged, not its component id (AB-51).
        expect(result).toEqual({
            success: true,
            data: {
                id: 'erp-integration',
                erp: {
                    id: 'demo-erp-2',
                    name: 'Contoso',
                    status: 'deployed',
                    url: ERP.url,
                    lastDeployed: ERP.lastDeployed,
                },
                website: 'bodea',
                entry,
            },
        });
    });

    // A rule changed: ownership applied across every ERP (AB-70); a sales organisation is not a rule.
    it('applies ownership across the ERPs after a rule change, and answers what the pass did', async () => {
        mockUpdateErpSettings.mockResolvedValue({ entry: { id: 'contoso', name: 'Contoso' } });
        mockApplyOwnership.mockResolvedValue({
            status: 'applied',
            erps: [{ erp: 'demo-erp-2', listId: 'contoso', name: 'Contoso', owns: { mode: 'websites', websites: ['bodea'] }, ownsNow: 4, discontinued: 2, restored: 0 }],
            fills: [],
            unowned: 1,
            notes: ['1 product belongs to no ERP.'],
        });
        const { mockContext } = setupMocks(twoErp());

        const result = await handleSetErpSettings(mockContext, {
            id: 'erp-integration',
            erp: 'demo-erp-2',
            values: { structure_owns: 'websites', structure_owns_websites: 'bodea' },
        });

        expect(mockApplyOwnership).toHaveBeenCalledWith(expect.objectContaining({ appBuilderComponents: expect.any(Object) }), 'erp-integration', expect.any(Object), 'settings');
        expect(result).toMatchObject({
            success: true,
            data: {
                ownership: { applied: true, erps: [{ erp: 'demo-erp-2', name: 'Contoso', owns: 4, discontinued: 2, restored: 0 }], unowned: 1, notes: ['1 product belongs to no ERP.'] },
            },
        });
    });

    it('names the ERP by its list id too, as get_erp_status answers it', async () => {
        mockUpdateErpSettings.mockResolvedValue({ entry: { id: 'contoso', name: 'Contoso' } });
        const { mockContext } = setupMocks(twoErp());

        const result = await handleSetErpSettings(mockContext, { id: 'erp-integration', erp: 'contoso', values: { structure_sales_org: '2000' } });

        expect(mockUpdateErpSettings).toHaveBeenCalledWith('contoso', undefined, { structure_sales_org: '2000' });
        expect(result).toMatchObject({ success: true, data: { erp: { id: 'demo-erp-2' } } });
        expect(mockApplyOwnership).not.toHaveBeenCalled();
    });

    it('refuses when no ERP is named', async () => {
        const { mockContext } = setupMocks(twoErp());
        const result = await handleSetErpSettings(mockContext, {
            id: 'erp-integration',
            values: { structure_owns: 'all' },
        });
        expect(result).toMatchObject({ success: false, code: ErrorCode.INVALID_OPERATION });
        expect(mockUpdateErpSettings).not.toHaveBeenCalled();
    });

    it('refuses when values is missing', async () => {
        const { mockContext } = setupMocks(twoErp());
        const result = await handleSetErpSettings(mockContext, {
            id: 'erp-integration',
            erp: 'demo-erp-2',
        });
        expect(result).toMatchObject({ success: false, code: ErrorCode.INVALID_OPERATION });
        expect(mockUpdateErpSettings).not.toHaveBeenCalled();
    });
});

describe('handleLookupErpRecord', () => {
    // Shapes from the integration's lib/lookup.js (read 2026-09-24).
    const LOOKUP = {
        kind: 'company',
        key: '3',
        found: { commerce: true, erp: true },
        rows: [],
        erpHash: '#partners?open=C000102',
    };

    it('asks the integration for the company by its Commerce id and answers the lookup beside the ERP row', async () => {
        mockLookup.mockResolvedValue(LOOKUP);
        const { mockContext } = setupMocks(pairProject());

        const result = await handleLookupErpRecord(mockContext, {
            id: 'erp-integration',
            company: ' 3 ',
        });

        expect(mockClientCtor).toHaveBeenCalledWith(
            INT_URLS,
            expect.objectContaining({ imsOrgId: 'ABC@AdobeOrg' })
        );
        expect(mockLookup).toHaveBeenCalledWith({ company: '3' });
        expect(result).toEqual({
            success: true,
            data: {
                id: 'erp-integration',
                erp: expect.objectContaining({ id: 'demo-erp' }),
                lookup: LOOKUP,
            },
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
        mockLookup.mockRejectedValue(
            new Error('ERP lookup answered 500: the ERP answered 503 for partners')
        );
        const { mockContext } = setupMocks(pairProject());

        const result = await handleLookupErpRecord(mockContext, {
            id: 'erp-integration',
            sku: 'P-1',
        });

        expect(result).toEqual({
            success: false,
            error: expect.stringContaining('the ERP answered 503'),
        });
    });
});

describe('handleFollowErpOrder', () => {
    // Shape from the integration's lib/order-trace.js buildOrderTrace (read 2026-09-24).
    const TRACE = {
        summary: {
            incrementId: '000000123',
            commerceStatus: 'processing',
            erpNumber: '0000001003',
            erpStatus: 'confirmed',
            reachedErp: true,
        },
        steps: [{ at: '2026-09-24T10:00:00Z', where: 'commerce', what: 'Order 000000123 placed' }],
    };

    it('asks the integration to trace the order and answers the trace beside the ERP row', async () => {
        mockTraceOrder.mockResolvedValue(TRACE);
        const { mockContext } = setupMocks(pairProject());

        const result = await handleFollowErpOrder(mockContext, {
            id: 'erp-integration',
            orderNumber: '000000123',
        });

        expect(mockTraceOrder).toHaveBeenCalledWith('000000123');
        expect(result).toEqual({
            success: true,
            data: {
                id: 'erp-integration',
                erp: expect.objectContaining({ id: 'demo-erp' }),
                orderNumber: '000000123',
                trace: TRACE,
            },
        });
    });

    it('refuses a missing or malformed order number before any call', async () => {
        const { mockContext } = setupMocks(pairProject());
        for (const payload of [
            { id: 'erp-integration' },
            { id: 'erp-integration', orderNumber: '12 3' },
        ]) {
            const result = await handleFollowErpOrder(mockContext, payload);
            expect(result).toMatchObject({ success: false, code: ErrorCode.CONFIG_INVALID });
        }
        expect(mockClientCtor).not.toHaveBeenCalled();
    });

    it('answers AUTH_REQUIRED typed, never a dialog, with no sign-in', async () => {
        mockResolveAppManagementAuth.mockResolvedValue(undefined);
        const { mockContext } = setupMocks(pairProject());

        const result = await handleFollowErpOrder(mockContext, {
            id: 'erp-integration',
            orderNumber: '000000123',
        });

        expect(result).toMatchObject({ success: false, code: ErrorCode.AUTH_REQUIRED });
        expect(mockTraceOrder).not.toHaveBeenCalled();
    });
});

describe("the ERP's own API (readErpApi / writeErpApi)", () => {
    it("GETs the route against the ERP's deployed URLs with the sign-in and answers the body", async () => {
        mockCallErpApi.mockResolvedValue({
            ok: true,
            status: 200,
            body: { items: [{ id: 'C21' }] },
            detail: '',
        });
        const { mockContext } = setupMocks(pairProject());

        const result = await handleReadErpApi(mockContext, {
            id: 'erp-integration',
            path: 'partners',
        });

        expect(mockCallErpApi).toHaveBeenCalledWith(
            ERP_URLS,
            expect.objectContaining({ imsOrgId: 'ABC@AdobeOrg' }),
            'GET',
            'partners',
            undefined
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
        mockCallErpApi.mockResolvedValue({
            ok: true,
            status: 200,
            body: { number: '0000001003', status: 'confirmed' },
            detail: '',
        });
        const { mockContext } = setupMocks(pairProject());

        const result = await handleWriteErpApi(mockContext, {
            id: 'erp-integration',
            method: 'post',
            path: 'orders/0000001003/confirm',
            body: { reason: 'demo' },
        });

        expect(mockCallErpApi).toHaveBeenCalledWith(
            ERP_URLS,
            expect.anything(),
            'POST',
            'orders/0000001003/confirm',
            { reason: 'demo' }
        );
        expect(result).toMatchObject({
            success: true,
            data: { method: 'POST', answer: { status: 'confirmed' } },
        });
    });

    it('refuses a missing route, a GET on the write verb, and a malformed route the client refuses', async () => {
        const { mockContext } = setupMocks(pairProject());

        expect(await handleReadErpApi(mockContext, { id: 'erp-integration' })).toMatchObject({
            success: false,
            code: ErrorCode.CONFIG_INVALID,
        });
        expect(
            await handleWriteErpApi(mockContext, {
                id: 'erp-integration',
                method: 'GET',
                path: 'partners',
            })
        ).toMatchObject({
            success: false,
            code: ErrorCode.CONFIG_INVALID,
        });
        mockCallErpApi.mockResolvedValue({ refusal: 'An ERP route is <action>[/<rest>]' });
        expect(
            await handleReadErpApi(mockContext, { id: 'erp-integration', path: '../x' })
        ).toMatchObject({
            success: false,
            code: ErrorCode.CONFIG_INVALID,
        });
    });

    it('an ERP error is answered with its status and words, and a long answer is cut and declared', async () => {
        mockCallErpApi.mockResolvedValue({
            ok: false,
            status: 409,
            body: {},
            detail: 'order already confirmed',
        });
        const { mockContext } = setupMocks(pairProject());
        expect(
            await handleWriteErpApi(mockContext, {
                id: 'erp-integration',
                method: 'POST',
                path: 'orders/1/confirm',
            })
        ).toEqual({
            success: false,
            error: 'The ERP answered 409 for POST orders/1/confirm: order already confirmed',
        });

        mockCallErpApi.mockResolvedValue({
            ok: true,
            status: 200,
            body: { items: 'x'.repeat(40_000) },
            detail: '',
        });
        const result = await handleReadErpApi(mockContext, {
            id: 'erp-integration',
            path: 'orders',
        });
        expect(result).toMatchObject({
            success: true,
            data: { answer: { truncated: true, chars: expect.any(Number) } },
        });
    });
});
