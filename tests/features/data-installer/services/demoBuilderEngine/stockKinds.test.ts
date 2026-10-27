/**
 * The sources, stocks and stock_source_links kinds: use what the store has, make and record
 * what it lacks, and take back exactly that, putting a website back on the stock it sold from
 * (DI-5).
 *
 * The rows are Carvello `main`'s own, trimmed, as the Data Installer service answered them on
 * 2026-10-27 (`batch-get-data-items`, read-only). Its stock sells to `auto`, the website of the
 * store it came from; the install target's website replaces it.
 */

import {
    LINK_KIND,
    SOURCE_KIND,
    STOCK_KIND,
    installSources,
    installStockSourceLinks,
    installStocks,
    parseSources,
    parseStockSourceLinks,
    parseStocks,
    removeSource,
    removeStock,
    removeStockSourceLink,
} from '@/features/data-installer/services/demoBuilderEngine/stockKinds';
import { type SentCall, fakeContext } from './demoBuilderEngine.testUtils';

const SOURCES = 'inventory/sources?searchCriteria[pageSize]=200';
const STOCKS = 'inventory/stocks?searchCriteria[pageSize]=200';
const LINKS = 'inventory/stock-source-links?searchCriteria[pageSize]=200';

const BROADWAY = {
    source_code: 'carvelo_broadway',
    name: 'Carvelo - Broadway',
    enabled: true,
    country_id: 'US',
    region_id: 43,
    city: 'New York',
    postcode: '10036',
    extension_attributes: { is_pickup_location_active: true, frontend_name: 'Broadway Service Center' },
};
const DEFAULT_STOCK = {
    stock_id: 1,
    name: 'Default Stock',
    extension_attributes: { sales_channels: [{ type: 'website', code: 'base' }] },
};

/** The store's inventory, as the three list reads answer it. */
function inventory(parts: { sources?: unknown[]; stocks?: unknown[]; links?: unknown[] }): Record<string, unknown> {
    return {
        [SOURCES]: { items: parts.sources ?? [{ source_code: 'default', name: 'Default Source', enabled: true }] },
        [STOCKS]: { items: parts.stocks ?? [DEFAULT_STOCK] },
        [LINKS]: { items: parts.links ?? [{ stock_id: 1, source_code: 'default', priority: 1 }] },
    };
}

describe('installSources', () => {
    it('makes a source the store lacks, sent as the pack has it, and records it', async () => {
        const ctx = await fakeContext(inventory({}));

        await installSources(ctx, parseSources({ sources: [{ source: BROADWAY }] }));

        expect(ctx.sent).toEqual([{ method: 'POST', path: 'inventory/sources', body: { source: BROADWAY } }]);
        expect(ctx.recorder.created).toEqual([{ kind: SOURCE_KIND, id: 'carvelo_broadway' }]);
    });

    it('leaves a source the store has and uses alone', async () => {
        const ctx = await fakeContext(inventory({ sources: [{ ...BROADWAY }] }));

        await installSources(ctx, parseSources({ sources: [{ source: BROADWAY }] }));

        expect(ctx.sent).toStrictEqual([]);
        expect(ctx.recorder.created).toStrictEqual([]);
    });

    it('switches on a source the store has switched off, and records that it was off', async () => {
        const off = { ...BROADWAY, enabled: false };
        const ctx = await fakeContext({ ...inventory({ sources: [off] }), 'inventory/sources/carvelo_broadway': off });

        await installSources(ctx, parseSources({ sources: [{ source: BROADWAY }] }));

        expect(ctx.sent).toEqual([
            { method: 'PUT', path: 'inventory/sources/carvelo_broadway', body: { source: { ...off, enabled: true } } },
        ]);
        expect(ctx.recorder.created).toEqual([{ kind: SOURCE_KIND, id: 'carvelo_broadway', previous: { enabled: false } }]);
    });
});

describe('installStocks', () => {
    const CARVELO = { stocks: [{ stock: { name: 'Carvelo Inventory', extension_attributes: { sales_channels: [{ type: 'website', code: 'auto' }] } } }] };

    it('makes a stock selling to the install target\'s website, recording the stock that website sold from', async () => {
        const ctx = await fakeContext(inventory({}), () => 7);
        ctx.session.websiteCode = 'base';

        await installStocks(ctx, parseStocks(CARVELO));

        expect(ctx.sent).toEqual([
            {
                method: 'POST',
                path: 'inventory/stocks',
                body: { stock: { name: 'Carvelo Inventory', extension_attributes: { sales_channels: [{ type: 'website', code: 'base' }] } } },
            },
        ]);
        expect(ctx.recorder.created).toEqual([
            { kind: STOCK_KIND, id: '7', previous: { websiteCode: 'base', stockId: 1 } },
        ]);
    });

    it('leaves a stock the store has by that name alone', async () => {
        const ctx = await fakeContext(inventory({ stocks: [DEFAULT_STOCK, { stock_id: 3, name: 'Carvelo Inventory' }] }));
        ctx.session.websiteCode = 'base';

        await installStocks(ctx, parseStocks(CARVELO));

        expect(ctx.sent).toStrictEqual([]);
    });

    it('refuses when the install target names no website', async () => {
        const ctx = await fakeContext(inventory({}));

        await expect(installStocks(ctx, parseStocks(CARVELO))).rejects.toThrow(/names no website/);
    });

    it('fails when Commerce answers no stock id', async () => {
        const ctx = await fakeContext(inventory({}), () => ({}));
        ctx.session.websiteCode = 'base';

        await expect(installStocks(ctx, parseStocks(CARVELO))).rejects.toThrow(/did not answer the new stock Carvelo Inventory's id/);
    });
});

describe('installStockSourceLinks', () => {
    const LINKS_PACK = {
        stockSourceLinks: [
            { stockSourceLink: { stock_id: 'Default Stock', source_code: 'default', priority: 1, extension_attributes: {} } },
            { stockSourceLink: { stock_id: 'Carvelo Inventory', source_code: 'carvelo_broadway', priority: 3, extension_attributes: {} } },
        ],
    };

    it('links each source to its stock by name, skipping a link the store has, and records what it added', async () => {
        const ctx = await fakeContext(inventory({ stocks: [DEFAULT_STOCK, { stock_id: 7, name: 'Carvelo Inventory' }] }));

        await installStockSourceLinks(ctx, parseStockSourceLinks(LINKS_PACK));

        expect(ctx.sent).toEqual([
            {
                method: 'POST',
                path: 'inventory/stock-source-links',
                body: { links: [{ stock_id: 7, source_code: 'carvelo_broadway', priority: 3 }] },
            },
        ]);
        expect(ctx.recorder.created).toEqual([{ kind: LINK_KIND, id: '7/carvelo_broadway' }]);
    });

    it('fails on a stock the store does not have', async () => {
        const ctx = await fakeContext(inventory({}));

        await expect(installStockSourceLinks(ctx, parseStockSourceLinks(LINKS_PACK))).rejects.toThrow(
            'The store has no stock named Carvelo Inventory.',
        );
    });
});

describe('removal', () => {
    it('switches a source off, since Commerce cannot delete one', async () => {
        const ctx = await fakeContext({ 'inventory/sources/carvelo_broadway': BROADWAY });

        await removeSource(ctx, 'carvelo_broadway');

        expect(ctx.sent).toEqual([
            { method: 'PUT', path: 'inventory/sources/carvelo_broadway', body: { source: { ...BROADWAY, enabled: false } } },
        ]);
    });

    it('deletes a stock, then puts the website back on the stock it sold from', async () => {
        const without = { ...DEFAULT_STOCK, extension_attributes: { sales_channels: [] } };
        const ctx = await fakeContext({ 'inventory/stocks/1': without });

        await removeStock(ctx, { kind: STOCK_KIND, id: '7', previous: { websiteCode: 'base', stockId: 1 } });

        expect(ctx.sent).toEqual<SentCall[]>([
            { method: 'DELETE', path: 'inventory/stocks/7', body: undefined },
            {
                method: 'PUT',
                path: 'inventory/stocks/1',
                body: { stock: { ...without, extension_attributes: { sales_channels: [{ type: 'website', code: 'base' }] } } },
            },
        ]);
    });

    it('leaves the earlier stock alone when it already sells to the website again', async () => {
        const ctx = await fakeContext({ 'inventory/stocks/1': DEFAULT_STOCK });

        await removeStock(ctx, { kind: STOCK_KIND, id: '7', previous: { websiteCode: 'base', stockId: 1 } });

        expect(ctx.sent.map((c) => c.method)).toEqual(['DELETE']);
    });

    it('carries on when the earlier stock has since gone', async () => {
        const ctx = await fakeContext({});

        await expect(
            removeStock(ctx, { kind: STOCK_KIND, id: '7', previous: { websiteCode: 'base', stockId: 4 } }),
        ).resolves.toBeUndefined();
    });

    it('takes a link it made back out', async () => {
        const ctx = await fakeContext();

        await removeStockSourceLink(ctx.send, '7/carvelo_broadway');

        expect(ctx.sent).toEqual([
            { method: 'POST', path: 'inventory/stock-source-links-delete', body: { links: [{ stock_id: 7, source_code: 'carvelo_broadway' }] } },
        ]);
    });
});
