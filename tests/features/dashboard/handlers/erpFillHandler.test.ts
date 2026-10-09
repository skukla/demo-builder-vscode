/**
 * erpFillHandler — `loadErpDemoData`, Demo Builder filling the ERP (AB-26y step 1).
 *
 * The fill itself is `erpFill`'s suite; here the handler is driven with the fill mocked,
 * and the assertions are on what the fill is HANDED: the Commerce read over the signed
 * target, the integration's settings call, and the ERP import at the ERP's own URLs.
 */

import {
    AUTH,
    ERP_URLS,
    ErrorCode,
    TARGET,
    handedDeps,
    handleLoadErpDemoData,
    mockCallErpApi,
    mockFillErp,
    mockKeepsErpList,
    mockListErps,
    mockPublishPrices,
    mockReadKeyMap,
    mockReplaceKeyMap,
    mockRequestRest,
    mockResolveRestTarget,
    mockResolvedSettings,
    mockUpdateErpSettings,
    pairProject,
    resetFillMocks,
    setup,
    type ErpFillDeps,
} from './erpFillHandler.testUtils';
import type { Project } from '@/types/base';

beforeEach(() => {
    resetFillMocks();
});

describe('handleLoadErpDemoData', () => {
    it("fills the ERP for the project and answers what went in beside the ERP's row", async () => {
        const { mockContext } = setup();

        const result = await handleLoadErpDemoData(mockContext, { id: 'erp-integration' });

        expect(mockFillErp).toHaveBeenCalledWith(expect.any(Object), 'bodea');
        expect(result).toMatchObject({
            success: true,
            data: {
                id: 'erp-integration',
                erp: { id: 'demo-erp', name: 'Northwind ERP' },
                loaded: { partners: 4, products: 182, skipped: 0 },
            },
        });
    });

    it("hands the fill an import that POSTs admin/import at the ERP's own URLs with the sign-in", async () => {
        mockCallErpApi.mockResolvedValue({ ok: true, status: 200, body: {}, detail: '' });
        const { mockContext } = setup();
        await handleLoadErpDemoData(mockContext, { id: 'erp-integration' });

        await handedDeps().importRecords({ products: [] });
        expect(mockCallErpApi).toHaveBeenCalledWith(
            ERP_URLS,
            AUTH,
            'POST',
            'admin/import',
            { products: [] },
            expect.any(Function)
        );
    });

    it("hands the fill an import that throws the ERP's own words when it refuses", async () => {
        mockCallErpApi.mockResolvedValue({
            ok: false,
            status: 400,
            body: {},
            detail: 'import needs a products array',
        });
        const { mockContext } = setup();
        await handleLoadErpDemoData(mockContext, { id: 'erp-integration' });

        await expect(handedDeps().importRecords({})).rejects.toThrow(
            "The ERP's import answered 400: import needs a products array"
        );
    });

    it("hands the fill a Commerce read over the signed target, and the integration's settings", async () => {
        mockRequestRest.mockResolvedValue({
            ok: true,
            status: 200,
            text: '[{"id":1,"code":"bodea","name":"Bodea"}]',
        });
        mockResolvedSettings.mockResolvedValue({ default: {}, websites: {} });
        const { mockContext } = setup();
        await handleLoadErpDemoData(mockContext, { id: 'erp-integration' });

        await expect(handedDeps().get('store/websites')).resolves.toStrictEqual([
            { id: 1, code: 'bodea', name: 'Bodea' },
        ]);
        expect(mockRequestRest).toHaveBeenCalledWith(
            'GET',
            TARGET,
            'store/websites',
            undefined,
            expect.any(Function)
        );
        await handedDeps().settings(['bodea']);
        // The integration's own ERP, by its list id (AB-16).
        expect(mockResolvedSettings).toHaveBeenCalledWith(['bodea'], 'northwind');
    });

    it('hands the fill a Commerce read that carries the status when Commerce refuses', async () => {
        mockRequestRest.mockResolvedValue({ ok: false, status: 404, text: 'no route' });
        const { mockContext } = setup();
        await handleLoadErpDemoData(mockContext, { id: 'erp-integration' });

        await expect(handedDeps().get('inventory/sources?x=1')).rejects.toMatchObject({
            status: 404,
        });
    });

    it('refuses before any call when the ERP is not deployed', async () => {
        const { mockContext } = setup(pairProject('error'));
        const result = await handleLoadErpDemoData(mockContext, { id: 'erp-integration' });
        expect(result).toMatchObject({ success: false, code: ErrorCode.INVALID_OPERATION });
        expect(mockFillErp).not.toHaveBeenCalled();
    });

    it('stops with the Commerce refusal when the project cannot sign a Commerce call', async () => {
        mockResolveRestTarget.mockResolvedValue({ refusal: 'Error: Adobe sign-in required.' });
        const { mockContext } = setup();
        const result = await handleLoadErpDemoData(mockContext, { id: 'erp-integration' });
        expect(result).toStrictEqual({
            success: false,
            error: 'Loading demo data into Northwind ERP did not finish: Adobe sign-in required.',
        });
        expect(mockFillErp).not.toHaveBeenCalled();
    });

    it("answers a fill that stops as a failure in the fill's words", async () => {
        mockFillErp.mockRejectedValue(new Error('Commerce answered 401 for products'));
        const { mockContext } = setup();
        const result = await handleLoadErpDemoData(mockContext, { id: 'erp-integration' });
        expect(result).toStrictEqual({
            success: false,
            error: 'Loading demo data into Northwind ERP did not finish: Commerce answered 401 for products',
        });
    });
});

/*
 * Several ERPs (AB-16): an ERP added from the integration's card (`demo-erp-2`, linked to it).
 * Load demo data on the integration fills every ERP; on one ERP's card, only that one. Each
 * fill reads its own ERP's settings and replaces only its own rows in the key map.
 */
describe('handleLoadErpDemoData — several ERPs', () => {
    function twoErps(): Partial<Project> {
        const base = pairProject();
        const components = base.appBuilderComponents!;
        return {
            ...base,
            appBuilderComponents: {
                'erp-integration': {
                    ...components['erp-integration'],
                    systems: ['demo-erp', 'demo-erp-2'],
                },
                'demo-erp': { ...components['demo-erp'], usedBy: 'erp-integration' },
                'demo-erp-2': {
                    ...components['demo-erp'],
                    name: 'Brand B ERP',
                    catalogId: 'demo-erp',
                    usedBy: 'erp-integration',
                    deployedUrls: {
                        'runtime/demo-erp-2/admin':
                            'https://ns.adobeioruntime.net/api/v1/web/demo-erp-2/admin',
                    },
                },
            },
        };
    }

    it('fills every ERP the integration serves, each with its own settings', async () => {
        mockResolvedSettings.mockResolvedValue({ default: {}, websites: {} });
        const { mockContext } = setup(twoErps());

        const result = await handleLoadErpDemoData(mockContext, { id: 'erp-integration' });

        expect(mockFillErp).toHaveBeenCalledTimes(2);
        await (mockFillErp.mock.calls[1][0] as ErpFillDeps).settings(['bodea']);
        expect(mockResolvedSettings).toHaveBeenCalledWith(['bodea'], 'brand-b');
        // Each ERP publishes its own prices, by its own list id.
        expect(mockPublishPrices.mock.calls.map(([erpId]) => erpId)).toEqual(['northwind', 'brand-b']);
        expect(result).toMatchObject({
            success: true,
            data: {
                loaded: [
                    { erp: 'demo-erp', name: 'Northwind ERP' },
                    { erp: 'demo-erp-2', name: 'Brand B ERP' },
                ],
            },
        });
    });

    // Since 2026-10-09 (AB-70) a load from one ERP's card applies ownership across every ERP:
    // one left alone was how a first ERP kept products its rule no longer gave it.
    it("a load from one ERP's card fills every ERP, and answers that ERP first", async () => {
        mockResolvedSettings.mockResolvedValue({ default: {}, websites: {} });
        const { mockContext } = setup(twoErps());

        const result = await handleLoadErpDemoData(mockContext, { id: 'erp-integration', erp: 'demo-erp-2' });

        expect(mockFillErp).toHaveBeenCalledTimes(2);
        expect(result).toMatchObject({
            success: true,
            data: { erp: { id: 'demo-erp-2' }, loaded: [{ erp: 'demo-erp-2' }, { erp: 'demo-erp' }] },
        });
    });

    it('names the ERP whose prices were not published when there are several', async () => {
        mockPublishPrices.mockImplementation(async (erpId?: string) => {
            if (erpId === 'brand-b') throw new Error('ERP prices answered 502: bad gateway');
            return {
                erps: ['northwind'],
                written: 1,
                removed: 0,
                unchanged: 0,
                skipped: [],
                failed: [],
            };
        });
        const { mockContext } = setup(twoErps());

        const result = await handleLoadErpDemoData(mockContext, { id: 'erp-integration' });

        expect(result).toMatchObject({
            success: true,
            data: {
                warning:
                    'Brand B ERP: Demo data loaded; prices were not published: ERP prices answered 502: bad gateway. Load demo data again to retry.',
            },
        });
    });

    it("replaces only that ERP's rows in the key map the integration holds", async () => {
        const first = { kind: 'customer', commerce: '1', erp: 'C1' };
        mockReadKeyMap.mockResolvedValue([
            first,
            { kind: 'customer', commerce: '1', erp: 'OLD', erpId: 'brand-b' },
        ]);
        const { mockContext } = setup(twoErps());
        await handleLoadErpDemoData(mockContext, { id: 'erp-integration', erp: 'demo-erp-2' });

        // Every ERP fills, in link order: the second fill is Brand B's.
        await (mockFillErp.mock.calls[1][0] as ErpFillDeps).saveKeyMap([{ kind: 'customer', commerce: '1', erp: 'B1' }]);

        expect(mockReplaceKeyMap).toHaveBeenCalledWith([
            first,
            { kind: 'customer', commerce: '1', erp: 'B1', erpId: 'brand-b' },
        ]);
    });

    it('refuses an ERP the integration does not serve', async () => {
        const { mockContext } = setup(twoErps());

        const result = await handleLoadErpDemoData(mockContext, {
            id: 'erp-integration',
            erp: 'demo-erp-9',
        });

        expect(result).toMatchObject({ success: false, code: ErrorCode.CONFIG_INVALID });
        expect(mockFillErp).not.toHaveBeenCalled();
    });
});

/**
 * The mapping (AB-26y): once an ERP is filled, each website the ERP's own sales
 * organizations name gets that sales organization on the ERP's entry in the integration's
 * list, where none is set, before the prices are published.
 */
describe('handleLoadErpDemoData — mapping', () => {
    const SETUP = {
        salesOrganizations: [
            { code: '1000', name: 'Online US', currency: 'USD', websiteCode: 'bodea' },
        ],
    };

    beforeEach(() => {
        mockKeepsErpList.mockReturnValue(true);
        mockCallErpApi.mockResolvedValue({ ok: true, status: 200, body: SETUP, detail: '' });
        mockRequestRest.mockResolvedValue({
            ok: true,
            status: 200,
            text: '[{"id":1,"code":"bodea","name":"Bodea"}]',
        });
        mockListErps.mockResolvedValue([{ id: 'northwind', name: 'Northwind ERP' }]);
        mockUpdateErpSettings.mockResolvedValue({ entry: {} });
    });

    it("fills the unset website from the ERP's own sales organizations and answers what it did", async () => {
        const { mockContext } = setup();

        const result = await handleLoadErpDemoData(mockContext, { id: 'erp-integration' });

        expect(mockCallErpApi).toHaveBeenCalledWith(
            ERP_URLS,
            AUTH,
            'GET',
            'settings/setup',
            undefined,
            expect.any(Function),
        );
        expect(mockUpdateErpSettings.mock.calls).toStrictEqual([
            [
                'northwind',
                'bodea',
                { structure_sales_org: '1000', structure_sales_org_name: 'Online US' },
            ],
        ]);
        expect(result).toMatchObject({
            success: true,
            data: {
                loaded: { partners: 4, products: 182 },
                mapping: {
                    filled: [{ erp: 'demo-erp', website: 'bodea', salesOrg: '1000' }],
                    kept: [],
                },
            },
        });
        expect(result.data).not.toHaveProperty('warning');
        expect(result.data).not.toHaveProperty('loaded.mapping');
    });

    it('saves the mapping before the prices are published', async () => {
        const { mockContext } = setup();

        await handleLoadErpDemoData(mockContext, { id: 'erp-integration' });

        expect(mockUpdateErpSettings.mock.invocationCallOrder[0]).toBeLessThan(
            mockPublishPrices.mock.invocationCallOrder[0],
        );
    });

    it('leaves a website someone already mapped, and reports it kept', async () => {
        mockListErps.mockResolvedValue([
            { id: 'northwind', settings: { websites: { bodea: { structure_sales_org: '3000' } } } },
        ]);
        const { mockContext } = setup();

        const result = await handleLoadErpDemoData(mockContext, { id: 'erp-integration' });

        expect(mockUpdateErpSettings).not.toHaveBeenCalled();
        expect(result.data).toMatchObject({
            mapping: {
                filled: [],
                kept: [{ erp: 'demo-erp', website: 'bodea', salesOrg: '3000', erpSalesOrg: '1000' }],
            },
        });
    });

    it('still answers the fill as done when the mapping is not saved, beside any prices warning', async () => {
        mockUpdateErpSettings.mockRejectedValue(new Error('ERP erps answered 500: store unavailable'));
        mockPublishPrices.mockRejectedValue(new Error('ERP prices answered 500: down'));
        const { mockContext } = setup();

        const result = await handleLoadErpDemoData(mockContext, {
            id: 'erp-integration',
            progress: 'modal',
        });

        const warning =
            'Demo data loaded; the mapping for website bodea was not saved: ERP erps answered 500: store unavailable. Load demo data again to retry. ' +
            'Demo data loaded; prices were not published: ERP prices answered 500: down. Load demo data again to retry.';
        expect(result).toMatchObject({ success: true, data: { warning } });
        expect(mockContext.sendMessage).toHaveBeenLastCalledWith('operationProgress', {
            id: 'erp-integration',
            state: 'succeeded',
            warning,
        });
    });

    it('answers no mapping for an integration deployed before it kept per-ERP settings', async () => {
        mockKeepsErpList.mockReturnValue(false);
        const { mockContext } = setup();

        const result = await handleLoadErpDemoData(mockContext, { id: 'erp-integration' });

        expect(result.success).toBe(true);
        expect(result.data).not.toHaveProperty('mapping');
        expect(result.data).not.toHaveProperty('warning');
        expect(mockUpdateErpSettings).not.toHaveBeenCalled();
    });

    it("answers each ERP's rows in one block when there are two", async () => {
        mockListErps.mockResolvedValue([
            { id: 'northwind' },
            { id: 'brand-b', settings: { websites: { bodea: { structure_sales_org: '2000' } } } },
        ]);
        const base = pairProject();
        const components = base.appBuilderComponents!;
        const { mockContext } = setup({
            ...base,
            appBuilderComponents: {
                'erp-integration': {
                    ...components['erp-integration'],
                    systems: ['demo-erp', 'demo-erp-2'],
                },
                'demo-erp': { ...components['demo-erp'], usedBy: 'erp-integration' },
                'demo-erp-2': {
                    ...components['demo-erp'],
                    name: 'Brand B ERP',
                    catalogId: 'demo-erp',
                    usedBy: 'erp-integration',
                },
            },
        });

        const result = await handleLoadErpDemoData(mockContext, { id: 'erp-integration' });

        expect(mockUpdateErpSettings).toHaveBeenCalledTimes(1);
        expect(result.data).toMatchObject({
            mapping: {
                filled: [{ erp: 'demo-erp', website: 'bodea', salesOrg: '1000' }],
                kept: [
                    { erp: 'demo-erp-2', website: 'bodea', salesOrg: '2000', erpSalesOrg: '1000' },
                ],
            },
        });
    });
});
