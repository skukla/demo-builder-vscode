/**
 * A removal with Demo Builder's engine, through the real engine and wiring: it takes what the install
 * record lists, whatever the request names, and needs nothing of the pack, which may be long gone.
 */

import { type TicksHarness, ROWS, request, ticksHarness } from './buildDatapackEngine-ticks.testUtils';
import { kindsOnRecord } from '@/features/data-installer/services/demoBuilderEngine/runPack';
import { forgetPackReads } from '@/features/data-installer/services/packReadCache';

// Pack reads are kept between callers (`packReadCache`, walk F82): each test reads its own.
beforeEach(() => forgetPackReads());

const ALL = Object.keys(ROWS);

let h: TicksHarness;

beforeEach(() => {
    h = ticksHarness();
});

afterEach(() => h.cleanUp());

describe('a removal with one type named', () => {
    it('takes everything the record lists', async () => {
        await h.importTypes(ALL);
        h.store.sent.length = 0;

        await h.removeTypes(['categories']);

        expect(h.writes('products')).toEqual(['DELETE products/VR-Rack']);
        expect(h.store.products.size).toBe(0);
        expect([...h.store.categories.values()].map((c) => c.name)).toEqual(['Default Category']);
        expect(await h.onRecord()).toStrictEqual([]);
    });
});

describe('checking a removal', () => {
    const unreadable = { rows: { categories: 'not rows' } };

    it('accepts when the pack can no longer be read: the record is all it needs', async () => {
        await h.importTypes(ALL);
        const engine = h.engine({ rows: {} });

        await expect(engine.validateImport(request(ALL))).resolves.toMatchObject({ valid: false });
        await expect(engine.validateRemoval(request(ALL))).resolves.toEqual({ valid: true });
    });

    it('accepts kinds the pack does not hold or whose rows it would refuse', async () => {
        await h.importTypes(ALL);

        await expect(h.engine(unreadable).validateRemoval(request(['store_config']))).resolves.toEqual({ valid: true });
    });

    it('refuses a store other than the one the record names, saying which, and removes nothing', async () => {
        await h.importTypes(ALL);
        h.store.sent.length = 0;

        const verdict = await h.engine().validateRemoval(request(ALL, { websiteCode: 'other', storeCode: 'default' }));

        expect(verdict).toEqual({ valid: false, reason: 'racks@1.0.0 is installed on the website base. Choose that one to remove it.' });
        expect(h.store.sent).toStrictEqual([]);
    });
});

describe('kindsOnRecord', () => {
    it('reads pack kinds, in install order, without repeats', () => {
        const created = [
            { kind: 'products', id: 'a' },
            { kind: 'store_config', id: 'p@default' },
            { kind: 'products', id: 'b' },
            { kind: 'attribute_options', id: 'o' },
            { kind: 'categories', id: '1' },
        ];

        expect(kindsOnRecord({ created })).toEqual(['product_attributes', 'categories', 'products', 'store_config']);
    });

    it('names what it is waiting to hear about, since that goes too', () => {
        expect(kindsOnRecord({ created: [], pending: [{ kind: 'customers', key: 'a@b.test' }] })).toEqual(['customers']);
    });

    it('keeps a kind it does not know rather than hide it', () => {
        expect(kindsOnRecord({ created: [{ kind: 'something_new', id: '1' }, { kind: 'categories', id: '2' }] })).toEqual(['categories', 'something_new']);
    });

    it('is empty for a record with nothing on it', () => {
        expect(kindsOnRecord({ created: [] })).toStrictEqual([]);
    });
});
