/**
 * warehouseFix — a source per ERP, a stock for the website, linked (AB-77). Asserted on the
 * Commerce fake: the bodies of the three POSTs, that an existing source or stock is reused,
 * what is recorded, and that the undo unlinks, deletes the stock and DISABLES the source.
 */

import { commerceFake, LINKS_DEFAULT_ONLY, SOURCES_DEFAULT_ONLY, STOCKS_DEFAULT_ONLY } from '../../../../helpers/commercePreparationFixtures';
import { MOVE_STOCK_MANUAL, warehouseFix, warehouseFor } from '@/features/app-builder/services/storePreparation/warehouseFix';
import type { CommerceInventorySourceList, CommerceInventoryStockList, CommerceStockSourceLinkList } from '@/types/commerceWire';

const DEPS = { websiteCode: 'acme', erpNames: ['Justrite ERP', 'Accuform ERP'] };

function store(sources: CommerceInventorySourceList = SOURCES_DEFAULT_ONLY, stocks: CommerceInventoryStockList = STOCKS_DEFAULT_ONLY, links: CommerceStockSourceLinkList = LINKS_DEFAULT_ONLY) {
    return commerceFake(
        {
            'inventory/sources?': sources,
            'inventory/stocks?': stocks,
            'inventory/stock-source-links?': links,
            'inventory/sources/': (p: string) => ({ source_code: p.split('/').pop(), name: 'Justrite Warehouse', enabled: true, country_id: 'US', postcode: '00000' }),
        },
        (_m, path) => (path === 'inventory/stocks' ? 7 : null),
    );
}

describe('warehouseFor', () => {
    it('names the warehouse after the ERP without the word ERP', () => {
        expect(warehouseFor('Justrite ERP')).toEqual({ code: 'justrite_warehouse', name: 'Justrite Warehouse' });
        expect(warehouseFor('Bodea & Co')).toEqual({ code: 'bodea_co_warehouse', name: 'Bodea & Co Warehouse' });
    });
});

describe('preview', () => {
    it('plans a source per ERP, a stock for the website and the links, and says stock moves stay by hand', async () => {
        const commerce = store();
        expect(await warehouseFix.preview({ commerce, ...DEPS })).toEqual({
            changes: [
                'Create Justrite Warehouse',
                'Create Accuform Warehouse',
                'Create acme Stock, a stock the website sells from',
                'Add Justrite Warehouse to acme Stock',
                'Add Accuform Warehouse to acme Stock',
            ],
            // The preview's one plain sentence: the screen shows it, not the lines above.
            summary: 'Add Justrite Warehouse and Accuform Warehouse to a new stock, acme Stock',
            manual: MOVE_STOCK_MANUAL,
        });
    });

    it('reuses an existing source and a stock that already sells to the website', async () => {
        const commerce = store(
            { items: [...(SOURCES_DEFAULT_ONLY.items ?? []), { source_code: 'justrite_warehouse', name: 'Justrite Warehouse', enabled: true }] },
            { items: [...(STOCKS_DEFAULT_ONLY.items ?? []), { stock_id: 3, name: 'Acme Stock', extension_attributes: { sales_channels: [{ type: 'website', code: 'acme' }] } }] },
            { items: [...(LINKS_DEFAULT_ONLY.items ?? []), { stock_id: 3, source_code: 'justrite_warehouse', priority: 1 }] },
        );
        expect((await warehouseFix.preview({ commerce, ...DEPS })).changes).toEqual([
            'Create Accuform Warehouse',
            'Add Accuform Warehouse to Acme Stock',
        ]);
    });

    it('has nothing to make without an ERP, and refuses without a website', async () => {
        const commerce = store();
        expect((await warehouseFix.preview({ commerce, websiteCode: 'acme', erpNames: [] })).changes).toStrictEqual([]);
        await expect(warehouseFix.preview({ commerce, erpNames: ['Justrite ERP'] })).rejects.toThrow('names no Commerce website');
    });
});

describe('apply', () => {
    it('POSTs the source, the stock with the website as its sales channel, and the links, and records them', async () => {
        const commerce = store();
        const applied = await warehouseFix.apply({ commerce, websiteCode: 'acme', erpNames: ['Justrite ERP'] });
        expect(commerce.writes()).toEqual([
            ['POST', 'inventory/sources', { source: { source_code: 'justrite_warehouse', name: 'Justrite Warehouse', enabled: true, country_id: 'US', postcode: '00000' } }],
            ['POST', 'inventory/stocks', { stock: { name: 'acme Stock', extension_attributes: { sales_channels: [{ type: 'website', code: 'acme' }] } } }],
            ['POST', 'inventory/stock-source-links', { links: [{ stock_id: 7, source_code: 'justrite_warehouse', priority: 1 }] }],
        ]);
        expect(applied.record).toEqual({
            kind: 'warehouse',
            createdSources: ['justrite_warehouse'],
            createdStock: { id: 7, name: 'acme Stock' },
            links: [{ stockId: 7, sourceCode: 'justrite_warehouse' }],
        });
        expect(applied.manual).toBe(MOVE_STOCK_MANUAL);
    });

    it('a refused stock is named and no link is made, while the created source is recorded', async () => {
        const commerce = store();
        commerce.send.mockImplementation(async (_m, path) => {
            if (path === 'inventory/stocks') throw new Error('Commerce answered 400 for inventory/stocks: no');
            return null;
        });
        const applied = await warehouseFix.apply({ commerce, websiteCode: 'acme', erpNames: ['Justrite ERP'] });
        expect(applied.rejected).toEqual(['Create acme Stock: Commerce answered 400 for inventory/stocks: no']);
        expect(applied.record).toEqual({ kind: 'warehouse', createdSources: ['justrite_warehouse'], links: [] });
    });
});

// Justrite, 2026-10-26: undo switched Test Warehouse off (Commerce cannot delete a source),
// and applying again linked it without switching it on, so the step could never read Done.
// The same apply put it at priority 1 beside justrite, which already held 1.
describe('applying again after an undo (AB-81)', () => {
    const JUSTRITE_STOCK = { stock_id: 3, name: 'Justrite Stock', extension_attributes: { sales_channels: [{ type: 'website' as const, code: 'acme' }] } };
    const afterUndo = () =>
        store(
            {
                items: [
                    ...(SOURCES_DEFAULT_ONLY.items ?? []),
                    { source_code: 'justrite_warehouse', name: 'Justrite Warehouse', enabled: true },
                    { source_code: 'test_warehouse', name: 'Test Warehouse', enabled: false },
                ],
            },
            { items: [...(STOCKS_DEFAULT_ONLY.items ?? []), JUSTRITE_STOCK] },
            { items: [...(LINKS_DEFAULT_ONLY.items ?? []), { stock_id: 3, source_code: 'justrite_warehouse', priority: 1 }] },
        );
    const DEPS_TEST = { websiteCode: 'acme', erpNames: ['Justrite ERP', 'Test ERP'] };

    it('says it will switch the warehouse back on, in the plain sentence and the lines', async () => {
        const preview = await warehouseFix.preview({ commerce: afterUndo(), ...DEPS_TEST });
        expect(preview.summary).toBe('Add Test Warehouse to Justrite Stock, and switch Test Warehouse back on');
        expect(preview.changes).toEqual(['Switch Test Warehouse back on', 'Add Test Warehouse to Justrite Stock']);
    });

    it('switches it on, links it after the stock\'s highest priority, and records both', async () => {
        const commerce = afterUndo();
        const applied = await warehouseFix.apply({ commerce, ...DEPS_TEST });
        expect(commerce.writes()).toEqual([
            ['PUT', 'inventory/sources/test_warehouse', { source: { source_code: 'test_warehouse', name: 'Justrite Warehouse', enabled: true, country_id: 'US', postcode: '00000' } }],
            ['POST', 'inventory/stock-source-links', { links: [{ stock_id: 3, source_code: 'test_warehouse', priority: 2 }] }],
        ]);
        expect(applied.record).toEqual({ kind: 'warehouse', createdSources: [], links: [{ stockId: 3, sourceCode: 'test_warehouse' }], enabledSources: ['test_warehouse'] });
        expect(applied.changes).toEqual(['Switched Test Warehouse back on', 'Added Test Warehouse to Justrite Stock']);
    });

    it('switches off again, on undo, a warehouse it switched back on', async () => {
        const commerce = afterUndo();
        await warehouseFix.undo({ commerce, ...DEPS_TEST }, { kind: 'warehouse', createdSources: [], links: [], enabledSources: ['test_warehouse'] });
        expect(commerce.writes().map(([m, p, body]) => [m, p, (body as { source?: { enabled?: boolean } } | undefined)?.source?.enabled])).toEqual([
            ['PUT', 'inventory/sources/test_warehouse', false],
        ]);
    });
});

describe('undo', () => {
    it('unlinks, deletes the stock it created, and disables (never deletes) the source it created', async () => {
        // The store as the apply left it: the warehouse it made is among the sources.
        const commerce = store({ items: [...(SOURCES_DEFAULT_ONLY.items ?? []), { source_code: 'justrite_warehouse', name: 'Justrite Warehouse', enabled: true }] });
        const undone = await warehouseFix.undo(
            { commerce, ...DEPS },
            { kind: 'warehouse', createdSources: ['justrite_warehouse'], createdStock: { id: 7, name: 'acme Stock' }, links: [{ stockId: 7, sourceCode: 'justrite_warehouse' }] },
        );
        expect(commerce.writes()).toEqual([
            ['POST', 'inventory/stock-source-links-delete', { links: [{ stock_id: 7, source_code: 'justrite_warehouse' }] }],
            ['DELETE', 'inventory/stocks/7', undefined],
            ['PUT', 'inventory/sources/justrite_warehouse', { source: { source_code: 'justrite_warehouse', name: 'Justrite Warehouse', enabled: false, country_id: 'US', postcode: '00000' } }],
        ]);
        // By name, never by code (owner, release test row 4.19, 2026-10-26).
        expect(undone.changes).toEqual([
            'Took Justrite Warehouse out of acme Stock',
            'Deleted acme Stock',
            "Switched off Justrite Warehouse (Commerce can't delete a warehouse)",
        ]);
    });

    it('leaves a reused stock and a pre-existing source alone', async () => {
        const commerce = store();
        await warehouseFix.undo({ commerce, ...DEPS }, { kind: 'warehouse', createdSources: [], links: [{ stockId: 3, sourceCode: 'justrite_warehouse' }] });
        expect(commerce.writes().map(([m, p]) => `${m} ${p}`)).toEqual(['POST inventory/stock-source-links-delete']);
    });
});
