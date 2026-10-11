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
                'Create the source Justrite Warehouse (justrite_warehouse)',
                'Create the source Accuform Warehouse (accuform_warehouse)',
                'Create the stock acme Stock, selling to the website',
                'Assign the source justrite_warehouse to the stock acme Stock',
                'Assign the source accuform_warehouse to the stock acme Stock',
            ],
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
            'Create the source Accuform Warehouse (accuform_warehouse)',
            'Assign the source accuform_warehouse to the stock Acme Stock',
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
        expect(applied.rejected).toEqual(['Create the stock acme Stock: Commerce answered 400 for inventory/stocks: no']);
        expect(applied.record).toEqual({ kind: 'warehouse', createdSources: ['justrite_warehouse'], links: [] });
    });
});

describe('undo', () => {
    it('unlinks, deletes the stock it created, and disables (never deletes) the source it created', async () => {
        const commerce = store();
        const undone = await warehouseFix.undo(
            { commerce, ...DEPS },
            { kind: 'warehouse', createdSources: ['justrite_warehouse'], createdStock: { id: 7, name: 'acme Stock' }, links: [{ stockId: 7, sourceCode: 'justrite_warehouse' }] },
        );
        expect(commerce.writes()).toEqual([
            ['POST', 'inventory/stock-source-links-delete', { links: [{ stock_id: 7, source_code: 'justrite_warehouse' }] }],
            ['DELETE', 'inventory/stocks/7', undefined],
            ['PUT', 'inventory/sources/justrite_warehouse', { source: { source_code: 'justrite_warehouse', name: 'Justrite Warehouse', enabled: false, country_id: 'US', postcode: '00000' } }],
        ]);
        expect(undone.changes[2]).toContain('disabled, not gone');
    });

    it('leaves a reused stock and a pre-existing source alone', async () => {
        const commerce = store();
        await warehouseFix.undo({ commerce, ...DEPS }, { kind: 'warehouse', createdSources: [], links: [{ stockId: 3, sourceCode: 'justrite_warehouse' }] });
        expect(commerce.writes().map(([m, p]) => `${m} ${p}`)).toEqual(['POST inventory/stock-source-links-delete']);
    });
});
