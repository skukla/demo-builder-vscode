/**
 * Loading an ACO pack and taking it back out (PL-60 P4): every kind through the one ACO client, in
 * the service's order; the install record lists what went in by the pack's own keys; removal sends
 * the ingestion deletes for exactly those keys. Step 14's rules hold: every row is checked before
 * the first write, and one row ACO refuses is skipped and named while the rest go in.
 */

import { AcoApiError } from '@/features/data-installer/services/aco/acoClient';
import { acoRowProblems, installAcoPack, removeAcoPack } from '@/features/data-installer/services/aco/acoPackInstall';
import { installRecordPath, openInstallRecord, readInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import type { AcoCategoryRow, AcoMetadataRow, AcoPriceBookRow, AcoPriceRow, AcoProductRow } from '@/types/acoPack';
import { NOW, PACK, PROJECT, memoryFiles } from '../demoBuilderEngine/demoBuilderEngine.testUtils';
import { ACO_INSTANCE, fakeAco } from './acoFakes.testUtils';

const INSTANCE = ACO_INSTANCE;

const METADATA: AcoMetadataRow = {
    code: 'name',
    source: { locale: 'en-US' },
    visibleIn: ['PRODUCT_DETAIL'],
    label: 'Name',
    dataType: 'TEXT',
    searchTypes: ['AUTOCOMPLETE'],
};
const CATEGORY: AcoCategoryRow = { slug: 'tents', source: { locale: 'en-US' }, name: 'Tents', description: null };
const product = (sku: string): AcoProductRow => ({ sku, source: { locale: 'en-US' }, name: sku, slug: sku.toLowerCase(), status: 'ENABLED', description: null });
const BOOK: AcoPriceBookRow = { priceBookId: 'main', name: 'Main', currency: 'USD' };
const price = (sku: string): AcoPriceRow => ({ sku, priceBookId: 'main', regular: 10 });

const PACK_ITEMS = {
    aco_prices: [price('TENT-1')],
    aco_products: [product('TENT-1')],
    aco_metadata: [METADATA],
    aco_price_books: [BOOK],
    aco_categories: [CATEGORY],
};

async function setUp(files = memoryFiles()) {
    const recorder = await openInstallRecord(files, PROJECT, PACK, NOW, { aco: INSTANCE });
    const logged: string[] = [];
    return { files, recorder, logged, log: (line: string) => void logged.push(line) };
}

describe('acoRowProblems', () => {
    it('finds nothing in rows ACO takes', () => {
        expect(acoRowProblems(PACK_ITEMS)).toEqual([]);
    });

    it('names the kind and the row ACO could not take, before anything is written', () => {
        const problems = acoRowProblems({ aco_products: [product('A'), { sku: 'B', source: { locale: 'en-US' } }] });
        expect(problems).toHaveLength(1);
        expect(problems[0]).toMatch(/^aco_products row 2:/u);
    });

    it('refuses rows that are not a list', () => {
        expect(acoRowProblems({ aco_metadata: { code: 'x' } })[0]).toMatch(/aco_metadata.*list/u);
    });

    it('checks a product layer by its sku and layer', () => {
        expect(acoRowProblems({ aco_product_layers: [{ sku: 'A', source: { locale: 'en-US' } }] })[0]).toMatch(/source\.layer/u);
        expect(acoRowProblems({ aco_product_layers: [{ sku: 'A', source: { layer: 'winter' } }] })).toEqual([]);
    });
});

describe('installAcoPack', () => {
    it('loads every kind in the service\'s order, whatever order the pack lists them', async () => {
        const { recorder, log } = await setUp();
        const aco = fakeAco();
        const kinds: string[] = [];
        await installAcoPack({ client: aco, recorder, log }, PACK_ITEMS, (kind) => void kinds.push(kind));
        expect(aco.calls.map((c) => c.path)).toEqual([
            '/v1/catalog/products/metadata',
            '/v1/catalog/categories',
            '/v1/catalog/products',
            '/v1/catalog/price-books',
            '/v1/catalog/products/prices',
        ]);
        expect(kinds).toEqual(['aco_metadata', 'aco_categories', 'aco_products', 'aco_price_books', 'aco_prices']);
        expect(aco.calls[2].rows).toEqual([product('TENT-1')]);
    });

    it('writes each row down by the pack\'s own key, and where it went', async () => {
        const { files, recorder, log } = await setUp();
        await installAcoPack({ client: fakeAco(), recorder, log }, PACK_ITEMS);
        const record = await readInstallRecord(files, PROJECT, PACK);
        expect(record?.aco).toEqual(INSTANCE);
        expect(record?.target).toBeUndefined();
        expect(record?.created.map((o) => [o.kind, o.key])).toEqual([
            ['aco_metadata', 'name (en-US)'],
            ['aco_categories', 'tents (en-US)'],
            ['aco_products', 'TENT-1 (en-US)'],
            ['aco_price_books', 'main'],
            ['aco_prices', 'TENT-1 in main'],
        ]);
        // No fingerprints: ACO cannot be read back, so there is nothing to compare one with.
        expect(record?.created.every((o) => o.fingerprint === undefined)).toBe(true);
    });

    it('sends products in batches of 100', async () => {
        const { recorder, log } = await setUp();
        const aco = fakeAco();
        const products = Array.from({ length: 250 }, (_, i) => product(`P-${i}`));
        await installAcoPack({ client: aco, recorder, log }, { aco_products: products });
        expect(aco.calls.map((c) => c.rows.length)).toEqual([100, 100, 50]);
    });

    it('skips and names one row ACO refuses, and loads the rest', async () => {
        const { files, recorder, log, logged } = await setUp();
        const aco = fakeAco((call) =>
            call.rows.some((r) => (r as { sku?: string }).sku === 'BAD') ? new AcoApiError('ACO answered 400 for POST /v1/catalog/products: bad slug', 'ingestion', 400) : undefined,
        );
        const outcome = await installAcoPack({ client: aco, recorder, log }, { aco_products: [product('GOOD'), product('BAD')] });
        expect(outcome.skipped).toEqual([{ kind: 'aco_products', key: 'BAD (en-US)', reason: 'bad slug' }]);
        expect(outcome.loaded).toBe(1);
        const record = await readInstallRecord(files, PROJECT, PACK);
        expect(record?.created.map((o) => o.key)).toEqual(['GOOD (en-US)']);
        expect(logged.join('\n')).toMatch(/skipped aco_products BAD/u);
    });

    it('stops on a refusal that is not the row\'s, keeping on the record what may have landed', async () => {
        const { files, recorder, log } = await setUp();
        const aco = fakeAco((call) => (call.path === '/v1/catalog/categories' ? new AcoApiError('ACO answered 503', 'ingestion', 503) : undefined));
        await expect(installAcoPack({ client: aco, recorder, log }, PACK_ITEMS)).rejects.toThrow(/503/u);
        const record = await readInstallRecord(files, PROJECT, PACK);
        // The categories were written down before they were sent: removal still deletes them.
        expect(record?.created.map((o) => o.kind)).toEqual(['aco_metadata', 'aco_categories']);
        expect(aco.calls.map((c) => c.path)).not.toContain('/v1/catalog/products');
    });

    it('answers the locales the pack loaded', async () => {
        const { recorder, log } = await setUp();
        const outcome = await installAcoPack({ client: fakeAco(), recorder, log }, PACK_ITEMS);
        expect(outcome.locales).toEqual(['en-US']);
    });

    it('does not write a row twice into the record when installed again', async () => {
        const { files, recorder, log } = await setUp();
        await installAcoPack({ client: fakeAco(), recorder, log }, PACK_ITEMS);
        const again = await openInstallRecord(files, PROJECT, PACK, NOW, { aco: INSTANCE });
        await installAcoPack({ client: fakeAco(), recorder: again, log }, PACK_ITEMS);
        expect((await readInstallRecord(files, PROJECT, PACK))?.created).toHaveLength(5);
    });
});

describe('removeAcoPack', () => {
    it('sends the ingestion deletes for exactly what the record lists, newest kind first, then forgets the record', async () => {
        const { files, recorder, log } = await setUp();
        await installAcoPack({ client: fakeAco(), recorder, log }, PACK_ITEMS);
        const aco = fakeAco();
        const result = await removeAcoPack(aco, files, { projectPath: PROJECT, pack: PACK });
        expect(aco.calls).toEqual([
            { path: '/v1/catalog/products/prices/delete', rows: [{ sku: 'TENT-1', priceBookId: 'main' }] },
            { path: '/v1/catalog/price-books/delete', rows: [{ priceBookId: 'main' }] },
            { path: '/v1/catalog/products/delete', rows: [{ sku: 'TENT-1', source: { locale: 'en-US' } }] },
            { path: '/v1/catalog/categories/delete', rows: [{ slug: 'tents', source: { locale: 'en-US' } }] },
            { path: '/v1/catalog/products/metadata/delete', rows: [{ code: 'name', source: { locale: 'en-US' } }] },
        ]);
        expect(result).toEqual({ removed: 5, noRecord: false });
        expect(files.data.has(installRecordPath(PROJECT, PACK))).toBe(false);
    });

    it('says there is no record when this engine never loaded the pack', async () => {
        await expect(removeAcoPack(fakeAco(), memoryFiles(), { projectPath: PROJECT, pack: PACK })).resolves.toEqual({ removed: 0, noRecord: true });
    });

    it('counts a row ACO no longer has as gone', async () => {
        const { files, recorder, log } = await setUp();
        await installAcoPack({ client: fakeAco(), recorder, log }, { aco_products: [product('A')] });
        const aco = fakeAco(() => new AcoApiError('ACO answered 404', 'ingestion', 404));
        await expect(removeAcoPack(aco, files, { projectPath: PROJECT, pack: PACK })).resolves.toEqual({ removed: 1, noRecord: false });
    });

    it('stops on a refused delete, leaving on the record what is still there, so a re-run carries on', async () => {
        const { files, recorder, log } = await setUp();
        await installAcoPack({ client: fakeAco(), recorder, log }, PACK_ITEMS);
        const aco = fakeAco((call) => (call.path === '/v1/catalog/products/delete' ? new AcoApiError('ACO answered 401', 'ingestion', 401) : undefined));
        await expect(removeAcoPack(aco, files, { projectPath: PROJECT, pack: PACK })).rejects.toThrow(/401/u);
        const left = await readInstallRecord(files, PROJECT, PACK);
        expect(left?.created.map((o) => o.kind)).toEqual(['aco_metadata', 'aco_categories', 'aco_products']);
    });
});
