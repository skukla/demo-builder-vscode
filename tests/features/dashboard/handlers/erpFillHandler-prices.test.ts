/**
 * erpFillHandler — the prices step that ends every fill (AB-26z): the integration publishes
 * the filled ERP's customer prices into the companies' shared catalogs. What the handler
 * answers when that succeeds, fails, fails for some companies, or is still running.
 */

import {
    ErpIntegrationApiError,
    handleLoadErpDemoData,
    mockFillErp,
    mockPublishPrices,
    mockPublishesPrices,
    resetFillMocks,
    setup,
} from './erpFillHandler.testUtils';

beforeEach(() => {
    resetFillMocks();
});

/*
 * Prices (AB-26z): after a fill, the integration publishes that ERP's customer prices into the
 * companies' shared catalogs. A publish that fails never fails the fill; a deployment made
 * before `erp/prices` existed is silent.
 */
describe('handleLoadErpDemoData — prices', () => {
    it("publishes the filled ERP's prices by its list id and answers the counts with the fill", async () => {
        const { mockContext } = setup();

        const result = await handleLoadErpDemoData(mockContext, { id: 'erp-integration' });

        // By its list id, with the fill's progress for a publish that has to be followed.
        expect(mockPublishPrices).toHaveBeenCalledWith('northwind', expect.any(Function));
        expect(result).toStrictEqual({
            success: true,
            data: expect.objectContaining({
                loaded: {
                    partners: 4,
                    products: 182,
                    skipped: 0,
                    prices: { written: 6, removed: 1, unchanged: 2, skipped: 0 },
                },
            }),
        });
        expect(result.data).not.toHaveProperty('warning');
    });

    it('does not publish when the fill stops', async () => {
        mockFillErp.mockRejectedValue(new Error('Commerce answered 401 for products'));
        const { mockContext } = setup();

        await handleLoadErpDemoData(mockContext, { id: 'erp-integration' });

        expect(mockPublishPrices).not.toHaveBeenCalled();
    });

    it('still answers the fill as done when the publish fails, and says so in plain words', async () => {
        mockPublishPrices.mockRejectedValue(
            new Error('ERP prices answered 500: Commerce did not answer')
        );
        const { mockContext } = setup();

        const result = await handleLoadErpDemoData(mockContext, { id: 'erp-integration' });

        expect(result).toMatchObject({
            success: true,
            data: {
                loaded: { partners: 4, products: 182, skipped: 0 },
                warning:
                    'Demo data loaded; prices were not published: ERP prices answered 500: Commerce did not answer. Load demo data again to retry.',
            },
        });
        expect(result.data).not.toHaveProperty('loaded.prices');
    });

    // The SC pressing the button reads the progress window, not the answer (AB-26z).
    it('ends the progress window on the same warning when the fill was started from a screen', async () => {
        mockPublishPrices.mockRejectedValue(
            new Error('ERP prices answered 500: Commerce did not answer')
        );
        const { mockContext } = setup();

        await handleLoadErpDemoData(mockContext, { id: 'erp-integration', progress: 'modal' });

        expect(mockContext.sendMessage).toHaveBeenLastCalledWith('operationProgress', {
            id: 'erp-integration',
            state: 'succeeded',
            warning:
                'Demo data loaded; prices were not published: ERP prices answered 500: Commerce did not answer. Load demo data again to retry.',
        });
    });

    /*
     * A publish cut off at 60 s against a deployment that does not record price runs (the
     * client answers the 504 as it is). The action runs on and the writes land (measured
     * 2026-10-01: 72 prices, ledger full minutes later), so it is a plain sentence the SC
     * need not act on — a `note`, not a `warning` — with nothing about Runtime, seconds or
     * ledgers (owner, 2026-10-09: "This is a bad experience").
     */
    const STILL_PUBLISHING =
        'Demo data loaded. Prices are still being published and will finish by themselves in a few minutes.';

    it('a publish that outran the call is a plain note, not a warning, and asks no retry', async () => {
        mockPublishPrices.mockRejectedValue(
            new ErpIntegrationApiError('prices', 504, 'Response not yet ready.')
        );
        const { mockContext } = setup();

        const result = await handleLoadErpDemoData(mockContext, { id: 'erp-integration' });

        expect(result).toMatchObject({ success: true, data: { note: STILL_PUBLISHING } });
        expect(result.data).not.toHaveProperty('warning');
    });

    it('ends the progress window on that note, as a plain success, when started from a screen', async () => {
        mockPublishPrices.mockRejectedValue(
            new ErpIntegrationApiError('prices', 504, 'Response not yet ready.')
        );
        const { mockContext } = setup();

        await handleLoadErpDemoData(mockContext, { id: 'erp-integration', progress: 'modal' });

        expect(mockContext.sendMessage).toHaveBeenLastCalledWith('operationProgress', {
            id: 'erp-integration',
            state: 'succeeded',
            note: STILL_PUBLISHING,
        });
    });

    it('a followed run that failed is a warning with the retry, like any failed publish', async () => {
        // What the client throws once it followed the run to a `failed` record.
        mockPublishPrices.mockRejectedValue(new Error('ERP prices failed: Commerce answered 503'));
        const { mockContext } = setup();

        const result = await handleLoadErpDemoData(mockContext, { id: 'erp-integration' });

        expect(result).toMatchObject({
            success: true,
            data: {
                warning:
                    'Demo data loaded; prices were not published: ERP prices failed: Commerce answered 503. Load demo data again to retry.',
            },
        });
        expect(result.data).not.toHaveProperty('note');
    });

    it("hands the client the fill's progress, so a followed publish can say it is still running", async () => {
        mockPublishPrices.mockImplementation(async (_erpId: string, onProgress?: (line: string) => void) => {
            onProgress?.('Publishing prices, still running');
            return { erps: ['northwind'], written: 6, removed: 1, unchanged: 2, skipped: [], failed: [] };
        });
        const { mockContext } = setup();

        await handleLoadErpDemoData(mockContext, { id: 'erp-integration', progress: 'modal' });

        const steps = jest
            .mocked(mockContext.sendMessage)
            .mock.calls.filter(([type]) => type === 'operationProgress')
            .map(([, payload]) => (payload as { step?: string }).step);
        expect(steps).toContain('Publishing prices, still running');
        expect(mockContext.sendMessage).toHaveBeenLastCalledWith('operationProgress', {
            id: 'erp-integration',
            state: 'succeeded',
        });
    });

    it('says which companies it could not price when some writes failed', async () => {
        mockPublishPrices.mockResolvedValue({
            erps: ['northwind'],
            written: 2,
            removed: 0,
            unchanged: 0,
            skipped: [],
            failed: [
                { erpId: 'northwind', partnerId: 'C1', error: 'Commerce answered 400' },
                { erpId: 'northwind', partnerId: 'C2', error: 'Commerce answered 400' },
            ],
        });
        const { mockContext } = setup();

        const result = await handleLoadErpDemoData(mockContext, { id: 'erp-integration' });

        expect(result).toMatchObject({
            success: true,
            data: {
                warning:
                    'Demo data loaded; prices for 2 companies were not published: Commerce answered 400. Load demo data again to retry.',
            },
        });
    });

    it('is silent for a deployment without the prices action', async () => {
        mockPublishesPrices.mockReturnValue(false);
        const { mockContext } = setup();

        const result = await handleLoadErpDemoData(mockContext, { id: 'erp-integration' });

        expect(mockPublishPrices).not.toHaveBeenCalled();
        expect(result).toStrictEqual({
            success: true,
            data: expect.objectContaining({ loaded: { partners: 4, products: 182, skipped: 0 } }),
        });
    });
});
