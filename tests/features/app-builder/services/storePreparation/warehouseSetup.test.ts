/**
 * warehouseSetup — a source per ERP, a stock for the website, linked (AB-77). Asserted on the
 * Commerce fake: the bodies of the three POSTs, that an existing source or stock is reused,
 * what is recorded, and that the undo unlinks, deletes the stock and DISABLES the source.
 */

import { commerceFake, LINKS_DEFAULT_ONLY, SOURCES_DEFAULT_ONLY, STOCKS_DEFAULT_ONLY } from '../../../../helpers/commercePreparationFixtures';
import { MOVE_STOCK_MANUAL, warehouseSetup, warehouseFor } from '@/features/app-builder/services/storePreparation/warehouseSetup';
import { fingerprintRow } from '@/features/data-installer/services/demoBuilderEngine/fingerprint';
import type { CommerceInventorySource, CommerceInventorySourceList, CommerceInventoryStockList, CommerceStockSourceLinkList } from '@/types/commerceWire';

const DEPS = { websiteCode: 'acme', erpNames: ['Tailspin ERP', 'Accuform ERP'] };

function store(sources: CommerceInventorySourceList = SOURCES_DEFAULT_ONLY, stocks: CommerceInventoryStockList = STOCKS_DEFAULT_ONLY, links: CommerceStockSourceLinkList = LINKS_DEFAULT_ONLY) {
    return commerceFake(
        {
            'inventory/sources?': sources,
            'inventory/stocks?': stocks,
            'inventory/stock-source-links?': links,
            'inventory/sources/': (p: string) => ({ source_code: p.split('/').pop(), name: 'Tailspin Warehouse', enabled: true, country_id: 'US', postcode: '00000' }),
        },
        (_m, path) => (path === 'inventory/stocks' ? 7 : null),
    );
}

describe('warehouseFor', () => {
    it('names the warehouse after the ERP without the word ERP', () => {
        expect(warehouseFor('Tailspin ERP')).toEqual({ code: 'tailspin_warehouse', name: 'Tailspin Warehouse' });
        expect(warehouseFor('Bodea & Co')).toEqual({ code: 'bodea_co_warehouse', name: 'Bodea & Co Warehouse' });
    });
});

// A new stock is named after the website as the Admin shows it, not its code (owner, 2026-11-15);
// the code only when the store's website list cannot be read (as every other case here).
describe('the stock a website sells from, by name', () => {
    it("names a new stock after the website's name", async () => {
        const commerce = commerceFake(
            {
                'inventory/sources?': SOURCES_DEFAULT_ONLY,
                'inventory/stocks?': STOCKS_DEFAULT_ONLY,
                'inventory/stock-source-links?': LINKS_DEFAULT_ONLY,
                'store/websites': [{ id: 2, code: 'acme', name: 'Acme Demo' }],
            },
            (_m, path) => (path === 'inventory/stocks' ? 7 : null),
        );

        const preview = await warehouseSetup.preview({ commerce, ...DEPS });
        await warehouseSetup.apply({ commerce, ...DEPS });

        expect(preview.changes).toContain('Create Acme Demo Stock, a stock the website sells from');
        expect(commerce.writes()).toContainEqual([
            'POST',
            'inventory/stocks',
            { stock: { name: 'Acme Demo Stock', extension_attributes: { sales_channels: [{ type: 'website', code: 'acme' }] } } },
        ]);
    });
});

describe('preview', () => {
    it('plans a source per ERP, a stock for the website and the links, and says stock moves stay by hand', async () => {
        const commerce = store();
        expect(await warehouseSetup.preview({ commerce, ...DEPS })).toEqual({
            changes: [
                'Create Tailspin Warehouse',
                'Create Accuform Warehouse',
                'Create acme Stock, a stock the website sells from',
                'Add Tailspin Warehouse to acme Stock',
                'Add Accuform Warehouse to acme Stock',
            ],
            // The preview's one plain sentence: the screen shows it, not the lines above.
            summary: 'Add Tailspin Warehouse and Accuform Warehouse to a new stock, acme Stock',
            manual: MOVE_STOCK_MANUAL,
        });
    });

    it('reuses an existing source and a stock that already sells to the website', async () => {
        const commerce = store(
            { items: [...(SOURCES_DEFAULT_ONLY.items ?? []), { source_code: 'tailspin_warehouse', name: 'Tailspin Warehouse', enabled: true }] },
            { items: [...(STOCKS_DEFAULT_ONLY.items ?? []), { stock_id: 3, name: 'Acme Stock', extension_attributes: { sales_channels: [{ type: 'website', code: 'acme' }] } }] },
            { items: [...(LINKS_DEFAULT_ONLY.items ?? []), { stock_id: 3, source_code: 'tailspin_warehouse', priority: 1 }] },
        );
        expect((await warehouseSetup.preview({ commerce, ...DEPS })).changes).toEqual([
            'Create Accuform Warehouse',
            'Add Accuform Warehouse to Acme Stock',
        ]);
    });

    it('has nothing to make without an ERP, and refuses without a website', async () => {
        const commerce = store();
        expect((await warehouseSetup.preview({ commerce, websiteCode: 'acme', erpNames: [] })).changes).toStrictEqual([]);
        await expect(warehouseSetup.preview({ commerce, erpNames: ['Tailspin ERP'] })).rejects.toThrow('names no Commerce website');
    });
});

describe('apply', () => {
    it('POSTs the source, the stock with the website as its sales channel, and the links, and records them', async () => {
        const commerce = store();
        const applied = await warehouseSetup.apply({ commerce, websiteCode: 'acme', erpNames: ['Tailspin ERP'] });
        expect(commerce.writes()).toEqual([
            ['POST', 'inventory/sources', { source: { source_code: 'tailspin_warehouse', name: 'Tailspin Warehouse', enabled: true, country_id: 'US', postcode: '00000' } }],
            ['POST', 'inventory/stocks', { stock: { name: 'acme Stock', extension_attributes: { sales_channels: [{ type: 'website', code: 'acme' }] } } }],
            ['POST', 'inventory/stock-source-links', { links: [{ stock_id: 7, source_code: 'tailspin_warehouse', priority: 1 }] }],
        ]);
        expect(applied.record).toEqual({
            kind: 'warehouse',
            createdSources: ['tailspin_warehouse'],
            createdStock: { id: 7, name: 'acme Stock' },
            links: [{ stockId: 7, sourceCode: 'tailspin_warehouse' }],
        });
        expect(applied.manual).toBe(MOVE_STOCK_MANUAL);
    });

    it('a refused stock is named and no link is made, while the created source is recorded', async () => {
        const commerce = store();
        commerce.send.mockImplementation(async (_m, path) => {
            if (path === 'inventory/stocks') throw new Error('Commerce answered 400 for inventory/stocks: no');
            return null;
        });
        const applied = await warehouseSetup.apply({ commerce, websiteCode: 'acme', erpNames: ['Tailspin ERP'] });
        expect(applied.rejected).toEqual(['Create acme Stock: Commerce answered 400 for inventory/stocks: no']);
        expect(applied.record).toEqual({ kind: 'warehouse', createdSources: ['tailspin_warehouse'], links: [] });
    });
});

// Tailspin, 2026-10-26: undo switched Test Warehouse off (Commerce cannot delete a source),
// and applying again linked it without switching it on, so the step could never read Done.
// The same apply put it at priority 1 beside tailspin, which already held 1.
describe('applying again after an undo (AB-82)', () => {
    const TAILSPIN_STOCK = { stock_id: 3, name: 'Tailspin Stock', extension_attributes: { sales_channels: [{ type: 'website' as const, code: 'acme' }] } };
    const afterUndo = () =>
        store(
            {
                items: [
                    ...(SOURCES_DEFAULT_ONLY.items ?? []),
                    { source_code: 'tailspin_warehouse', name: 'Tailspin Warehouse', enabled: true },
                    { source_code: 'test_warehouse', name: 'Test Warehouse', enabled: false },
                ],
            },
            { items: [...(STOCKS_DEFAULT_ONLY.items ?? []), TAILSPIN_STOCK] },
            { items: [...(LINKS_DEFAULT_ONLY.items ?? []), { stock_id: 3, source_code: 'tailspin_warehouse', priority: 1 }] },
        );
    const DEPS_TEST = { websiteCode: 'acme', erpNames: ['Tailspin ERP', 'Test ERP'] };

    it('says it will switch the warehouse back on, in the plain sentence and the lines', async () => {
        const preview = await warehouseSetup.preview({ commerce: afterUndo(), ...DEPS_TEST });
        expect(preview.summary).toBe('Add Test Warehouse to Tailspin Stock, and switch Test Warehouse back on');
        expect(preview.changes).toEqual(['Switch Test Warehouse back on', 'Add Test Warehouse to Tailspin Stock']);
    });

    it('switches it on, links it after the stock\'s highest priority, and records both', async () => {
        const commerce = afterUndo();
        const applied = await warehouseSetup.apply({ commerce, ...DEPS_TEST });
        expect(commerce.writes()).toEqual([
            ['PUT', 'inventory/sources/test_warehouse', { source: { source_code: 'test_warehouse', name: 'Tailspin Warehouse', enabled: true, country_id: 'US', postcode: '00000' } }],
            ['POST', 'inventory/stock-source-links', { links: [{ stock_id: 3, source_code: 'test_warehouse', priority: 2 }] }],
        ]);
        expect(applied.record).toEqual({
            kind: 'warehouse',
            createdSources: [],
            links: [{ stockId: 3, sourceCode: 'test_warehouse' }],
            enabledSources: ['test_warehouse'],
            // The fake's list does not move; what is hashed is the list's row, read after the writes.
            sourceFingerprints: { test_warehouse: expect.any(String) },
        });
        expect(applied.changes).toEqual(['Switched Test Warehouse back on', 'Added Test Warehouse to Tailspin Stock']);
    });

    it('switches off again, on undo, a warehouse it switched back on', async () => {
        const on: CommerceInventorySource = { source_code: 'test_warehouse', name: 'Test Warehouse', enabled: true };
        const commerce = store({ items: [...(SOURCES_DEFAULT_ONLY.items ?? []), on] });
        await warehouseSetup.undo(
            { commerce, ...DEPS_TEST },
            { kind: 'warehouse', createdSources: [], links: [], enabledSources: ['test_warehouse'], sourceFingerprints: { test_warehouse: fingerprintRow(on) } },
        );
        expect(commerce.writes().map(([m, p, body]) => [m, p, (body as { source?: { enabled?: boolean } } | undefined)?.source?.enabled])).toEqual([
            ['PUT', 'inventory/sources/test_warehouse', false],
        ]);
    });
});

/** The warehouse the apply made, as the sources list answers it once made. */
const MADE: CommerceInventorySource = { source_code: 'tailspin_warehouse', name: 'Tailspin Warehouse', enabled: true, country_id: 'US', postcode: '00000' };
const ACME_STOCK = { stock_id: 7, name: 'acme Stock', extension_attributes: { sales_channels: [{ type: 'website' as const, code: 'acme' }] } };
const MADE_RECORD = {
    kind: 'warehouse' as const,
    createdSources: ['tailspin_warehouse'],
    createdStock: { id: 7, name: 'acme Stock' },
    links: [{ stockId: 7, sourceCode: 'tailspin_warehouse' }],
    sourceFingerprints: { tailspin_warehouse: fingerprintRow(MADE) },
};
/** The store as the apply left it, plus whatever a test adds since. */
const asLeft = (more: { sources?: CommerceInventorySource[]; links?: Array<{ stock_id: number; source_code: string; priority: number }> } = {}) =>
    store(
        { items: [...(SOURCES_DEFAULT_ONLY.items ?? []), ...(more.sources ?? [MADE])] },
        { items: [...(STOCKS_DEFAULT_ONLY.items ?? []), ACME_STOCK] },
        { items: [...(LINKS_DEFAULT_ONLY.items ?? []), { stock_id: 7, source_code: 'tailspin_warehouse', priority: 1 }, ...(more.links ?? [])] },
    );

describe('apply records each source as it left it', () => {
    it('hashes the sources list row of each source it made, read after its writes', async () => {
        let reads = 0;
        const commerce = commerceFake(
            {
                // The list before the writes, then after: the made warehouse is in it.
                'inventory/sources?': () => (reads++ === 0 ? SOURCES_DEFAULT_ONLY : { items: [...(SOURCES_DEFAULT_ONLY.items ?? []), MADE] }),
                'inventory/stocks?': STOCKS_DEFAULT_ONLY,
                'inventory/stock-source-links?': LINKS_DEFAULT_ONLY,
            },
            (_m, path) => (path === 'inventory/stocks' ? 7 : null),
        );
        const applied = await warehouseSetup.apply({ commerce, websiteCode: 'acme', erpNames: ['Tailspin ERP'] });
        expect(applied.record).toEqual(MADE_RECORD);
        expect(commerce.get).toHaveBeenLastCalledWith('inventory/sources?searchCriteria[pageSize]=200');
    });
});

describe('undo', () => {
    it('unlinks, deletes the stock it created, and disables (never deletes) the source it created', async () => {
        const commerce = asLeft();
        const undone = await warehouseSetup.undo({ commerce, ...DEPS }, MADE_RECORD);
        expect(commerce.writes()).toEqual([
            ['POST', 'inventory/stock-source-links-delete', { links: [{ stock_id: 7, source_code: 'tailspin_warehouse' }] }],
            ['DELETE', 'inventory/stocks/7', undefined],
            ['PUT', 'inventory/sources/tailspin_warehouse', { source: { source_code: 'tailspin_warehouse', name: 'Tailspin Warehouse', enabled: false, country_id: 'US', postcode: '00000' } }],
        ]);
        // By name, never by code (owner, release test row 4.19, 2026-10-26).
        expect(undone).toEqual({
            changes: ['Took Tailspin Warehouse out of acme Stock', 'Deleted acme Stock', "Switched off Tailspin Warehouse (Commerce can't delete a warehouse)"],
            rejected: [],
        });
    });

    it('leaves a reused stock and a pre-existing source alone', async () => {
        const commerce = store(undefined, undefined, { items: [...(LINKS_DEFAULT_ONLY.items ?? []), { stock_id: 3, source_code: 'tailspin_warehouse', priority: 1 }] });
        await warehouseSetup.undo({ commerce, ...DEPS }, { kind: 'warehouse', createdSources: [], links: [{ stockId: 3, sourceCode: 'tailspin_warehouse' }] });
        expect(commerce.writes().map(([m, p]) => `${m} ${p}`)).toEqual(['POST inventory/stock-source-links-delete']);
    });

    // Step 06 (AB-83, owner 2026-10-27): a stock holding a source the fix did not link is kept,
    // with the fix's own links taken out; a source is switched off only if still as the fix left it.
    it('keeps a stock holding a source the fix did not link, taking out only the fix\'s own link', async () => {
        const commerce = asLeft({ links: [{ stock_id: 7, source_code: 'default', priority: 2 }] });
        const undone = await warehouseSetup.undo({ commerce, ...DEPS }, MADE_RECORD);
        expect(commerce.writes().map(([m, p]) => `${m} ${p}`)).toEqual(['POST inventory/stock-source-links-delete', 'PUT inventory/sources/tailspin_warehouse']);
        expect(undone.kept).toBe('Kept acme Stock: it holds Default Source, which Demo Builder did not add to it.');
        // Owner 2026-10-29: the kept stock stays recorded, its own links and sources gone from the record.
        expect(undone.remaining).toEqual({ kind: 'warehouse', createdSources: [], links: [], createdStock: { id: 7, name: 'acme Stock' } });
    });

    it('deletes a kept stock on a later undo, once it holds no source', async () => {
        const commerce = store(SOURCES_DEFAULT_ONLY, { items: [...(STOCKS_DEFAULT_ONLY.items ?? []), ACME_STOCK] }, LINKS_DEFAULT_ONLY);
        const undone = await warehouseSetup.undo({ commerce, ...DEPS }, { kind: 'warehouse', createdSources: [], links: [], createdStock: { id: 7, name: 'acme Stock' } });
        expect(commerce.writes()).toEqual([['DELETE', 'inventory/stocks/7', undefined]]);
        expect(undone).toEqual({ changes: ['Deleted acme Stock'], rejected: [] });
    });

    it('keeps nothing on the record for a source it left on: that source is the SC\'s now', async () => {
        const commerce = asLeft({ sources: [{ ...MADE, name: 'Tailspin Main DC' }] });
        const undone = await warehouseSetup.undo({ commerce, ...DEPS }, MADE_RECORD);
        expect(undone.remaining).toBeUndefined();
    });

    it('keeps a source switched on that was changed since the fix left it', async () => {
        const commerce = asLeft({ sources: [{ ...MADE, name: 'Tailspin Main DC' }] });
        const undone = await warehouseSetup.undo({ commerce, ...DEPS }, MADE_RECORD);
        expect(commerce.writes().map(([m, p]) => `${m} ${p}`)).toEqual(['POST inventory/stock-source-links-delete', 'DELETE inventory/stocks/7']);
        expect(undone.kept).toBe('Kept Tailspin Main DC switched on: it was changed after Demo Builder set it up.');
    });

    it('keeps a source on, saying why, when the record holds no hash of it (written before 2026-10-29)', async () => {
        const commerce = asLeft();
        const { sourceFingerprints: _hashes, ...old } = MADE_RECORD;
        const undone = await warehouseSetup.undo({ commerce, ...DEPS }, old);
        expect(commerce.writes().map(([m, p]) => `${m} ${p}`)).toEqual(['POST inventory/stock-source-links-delete', 'DELETE inventory/stocks/7']);
        expect(undone.kept).toBe('Kept Tailspin Warehouse switched on: Demo Builder cannot tell it is still as it left it.');
    });

    it('writes nothing for a source already off or a link already gone', async () => {
        const off = { ...MADE, enabled: false };
        const commerce = store(
            { items: [...(SOURCES_DEFAULT_ONLY.items ?? []), off] },
            { items: [...(STOCKS_DEFAULT_ONLY.items ?? []), ACME_STOCK] },
            LINKS_DEFAULT_ONLY,
        );
        const undone = await warehouseSetup.undo({ commerce, ...DEPS }, MADE_RECORD);
        expect(commerce.writes().map(([m, p]) => `${m} ${p}`)).toEqual(['DELETE inventory/stocks/7']);
        expect(undone).toEqual({ changes: ['Deleted acme Stock'], rejected: [] });
    });

    it('writes nothing, and says why, when the warehouses cannot be read', async () => {
        const commerce = asLeft();
        commerce.get.mockRejectedValue(new Error('Commerce answered 503 for inventory/sources'));
        const undone = await warehouseSetup.undo({ commerce, ...DEPS }, MADE_RECORD);
        expect(commerce.send).not.toHaveBeenCalled();
        expect(undone).toEqual({ changes: [], rejected: ["Read the store's warehouses: Commerce answered 503 for inventory/sources"] });
    });
});
