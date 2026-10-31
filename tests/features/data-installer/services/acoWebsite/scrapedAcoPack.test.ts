/**
 * Saving a website's products as an ACO pack in the SC's library (PL-60 slice A). The write is a
 * plain function here, as `writePackToStore(writer, file)` is handed in by the handler, so the
 * assertions are on the FILE it is given: the pack named, the kinds in the service's order, and a
 * description that names what was proposed, which is what the SC reads in the library.
 */

import {
    saveScrapedAcoPack,
} from '@/features/data-installer/services/acoWebsite/scrapedAcoPack';
import { ScrapedPackError } from '@/features/data-installer/services/acoWebsite/scrapedAcoRows';
import { DatapackTransferError, type PackWriteOutcome } from '@/features/data-installer/services/datapackTransfer';
import type { DatapackFile } from '@/features/data-installer/services/datapackZip';
import type { ScrapedProduct } from '@/types/scrapedProduct';

const LISTING = 'https://shop.example.com/collections/boots';

const PRODUCTS: ScrapedProduct[] = [
    {
        origin: LISTING,
        readFrom: 'json-ld',
        data: { name: 'Trail Boot', image: 'https://cdn.example.com/a.jpg', price: 129, currency: 'USD', sku: 'TB-1', categories: ['Boots'] },
    },
    {
        origin: LISTING,
        data: { name: 'Beach Sandal', image: 'https://cdn.example.com/b.jpg', price: 40 },
        proposed: ['price'],
    },
    { origin: LISTING, data: { name: 'Mystery Box', image: 'https://cdn.example.com/c.jpg', sku: 'MB' } },
];

const REQUEST = {
    id: { name: 'aco_boots_shop', version: 'v1' },
    displayName: 'Boots shop',
    locale: 'en-US',
    currency: 'USD',
    products: PRODUCTS,
};

const NOW = () => new Date('2026-10-31T12:00:00.000Z');

function writer(outcome: Partial<PackWriteOutcome> = {}) {
    const files: DatapackFile[] = [];
    const write = jest.fn(async (file: DatapackFile): Promise<PackWriteOutcome> => {
        files.push(file);
        return { pack: 'created', stored: file.items.map((i) => i.dataType), failed: [], ...outcome };
    });
    return { write, files };
}

describe('saveScrapedAcoPack', () => {
    it('writes one library pack with the kinds that have rows, in the service order', async () => {
        const { write, files } = writer();

        await saveScrapedAcoPack(REQUEST, write, NOW);

        expect(write).toHaveBeenCalledTimes(1);
        const [file] = files;
        expect(file.id).toEqual({ name: 'aco_boots_shop', version: 'v1' });
        expect(file.displayName).toBe('Boots shop');
        expect(file.source).toBe('library');
        expect(file.exportedAt).toBe('2026-10-31T12:00:00.000Z');
        // No option dimensions, so no aco_metadata.
        expect(file.items.map((i) => i.dataType)).toEqual(['aco_categories', 'aco_products', 'aco_price_books', 'aco_prices']);
    });

    it('puts the price book in the main book by default, named for the pack', async () => {
        const { write, files } = writer();

        await saveScrapedAcoPack(REQUEST, write, NOW);

        const books = files[0].items.find((i) => i.dataType === 'aco_price_books')?.records;
        expect(books).toEqual([{ priceBookId: 'main', name: 'Boots shop (USD)', currency: 'USD' }]);
    });

    it('takes a price book id when one is given', async () => {
        const { write, files } = writer();

        await saveScrapedAcoPack({ ...REQUEST, priceBookId: 'boots-us' }, write, NOW);

        const prices = files[0].items.find((i) => i.dataType === 'aco_prices')?.records as Array<{ priceBookId: string }>;
        expect(prices.map((p) => p.priceBookId)).toEqual(['boots-us', 'boots-us']);
    });

    it('names what was proposed and what has no price, in the answer and in the pack description', async () => {
        const { write, files } = writer();

        const outcome = await saveScrapedAcoPack(REQUEST, write, NOW);

        expect(outcome.proposed).toEqual([{ sku: 'BEACHSAN', name: 'Beach Sandal', fields: ['price', 'sku'] }]);
        expect(outcome.unpriced).toEqual(['MB']);
        expect(outcome.sentence).toMatch(/aco_boots_shop@v1/);
        expect(outcome.sentence).toMatch(/1 price and 1 SKU were proposed/);
        expect(outcome.sentence).toMatch(/1 product has no price/);
        expect(files[0].description).toMatch(LISTING);
        expect(files[0].description).toMatch(/1 price and 1 SKU were proposed/);
    });

    it('says plainly when nothing was proposed', async () => {
        const { write } = writer();

        const outcome = await saveScrapedAcoPack({ ...REQUEST, products: [PRODUCTS[0]] }, write, NOW);

        expect(outcome.proposed).toStrictEqual([]);
        expect(outcome.sentence).toMatch(/Every value was read from the page/);
    });

    it('counts the rows of each kind saved', async () => {
        const { write } = writer();

        const outcome = await saveScrapedAcoPack(REQUEST, write, NOW);

        expect(outcome.kinds).toEqual([
            { dataType: 'aco_categories', rows: 1 },
            { dataType: 'aco_products', rows: 3 },
            { dataType: 'aco_price_books', rows: 1 },
            { dataType: 'aco_prices', rows: 2 },
        ]);
        expect(outcome.saved).toEqual({ name: 'aco_boots_shop', version: 'v1' });
    });

    it('reports a kind the library did not take, by name', async () => {
        const { write } = writer({ failed: [{ dataType: 'aco_prices', reason: 'too large' }] });

        const outcome = await saveScrapedAcoPack(REQUEST, write, NOW);

        expect(outcome.failed).toEqual([{ dataType: 'aco_prices', reason: 'too large' }]);
        expect(outcome.sentence).toMatch(/aco_prices.*too large/);
    });

    it('refuses a name and version already in the library, and says how to go on', async () => {
        const write = jest.fn(async (): Promise<PackWriteOutcome> => {
            throw new DatapackTransferError('exists');
        });

        await expect(saveScrapedAcoPack(REQUEST, write, NOW)).rejects.toThrow(
            /aco_boots_shop@v1 is already in your datapack library/,
        );
    });

    it('writes nothing when the products cannot be made into a pack', async () => {
        const { write } = writer();

        await expect(saveScrapedAcoPack({ ...REQUEST, products: [] }, write, NOW)).rejects.toThrow(ScrapedPackError);
        expect(write).not.toHaveBeenCalled();
    });

    it('writes nothing when the Data Installer schema refuses a kind, and names the kind', async () => {
        const { write } = writer();
        // A name of spaces trims to '', which the service's aco_products schema refuses
        // (minLength 1). The tool's input schema stops it first; this is the backstop.
        const blankName: ScrapedProduct = { origin: LISTING, data: { name: '   ', image: 'https://cdn.example.com/d.jpg', price: 1 } };

        await expect(saveScrapedAcoPack({ ...REQUEST, products: [blankName] }, write, NOW)).rejects.toThrow(
            /aco_products.*Nothing was saved/,
        );
        expect(write).not.toHaveBeenCalled();
    });
});
