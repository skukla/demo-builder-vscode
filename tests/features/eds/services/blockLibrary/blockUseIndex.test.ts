/**
 * The index of real block uses: for each block on a site's pages, the first page using it and the
 * first example seen for each style variant, across pages in page order (DA.live's Import Blocks
 * `blockDoc` takes the first example per variant). Every block class is recorded.
 * Real pages captured 2026-11-23 (tests/fixtures/eds/block-library/README.md).
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { buildBlockUseIndex, photosInUses } from '@/features/eds/services/blockLibrary/blockUseIndex';

const FIXTURES = resolve(__dirname, '../../../../fixtures/eds/block-library');
const readPage = (name: string): string => readFileSync(resolve(FIXTURES, name), 'utf8');
const CART = readPage('b2b-cart.plain.html');
const CHECKOUT = readPage('b2b-checkout.plain.html');
const CARDS = readPage('cards-variants.plain.html');

const SITE = { org: 'adobe-commerce', site: 'boilerplate-b2b' };
const BASE = 'https://main--boilerplate-b2b--adobe-commerce.aem.page';

const section = (blocks: string): string => `<div>${blocks}</div>`;

function fetcherFor(pages: Record<string, string>) {
    return jest.fn(async (url: string) => pages[url]);
}

describe('buildBlockUseIndex', () => {
    it('indexes the real cart and checkout blocks with their page and example', async () => {
        const fetchText = fetcherFor({
            [`${BASE}/cart.plain.html`]: CART,
            [`${BASE}/checkout.plain.html`]: CHECKOUT,
        });

        const index = await buildBlockUseIndex(SITE, ['/cart', '/checkout'], fetchText);

        expect([...index.keys()].sort()).toEqual(['commerce-cart', 'commerce-checkout']);
        expect(index.get('commerce-cart')?.path).toBe('/cart');
        expect(index.get('commerce-cart')?.examples).toHaveLength(1);
        expect(index.get('commerce-cart')?.examples[0].html).toContain('Checkout URL');
        expect(index.get('commerce-checkout')).toEqual({
            path: '/checkout',
            examples: [{ variant: '', html: '<div>\n      <div></div>\n      <div></div>\n    </div>' }],
        });
    });

    it('keeps the first example of each variant, in the order first seen', async () => {
        const fetchText = fetcherFor({ [`${BASE}/cards.plain.html`]: CARDS });

        const index = await buildBlockUseIndex(SITE, ['/cards'], fetchText);

        expect(index.get('cards')).toEqual({
            path: '/cards',
            examples: [
                { variant: '', html: '<div>\n      <div><p>First card</p></div>\n    </div>' },
                { variant: 'horizontal', html: '<div>\n      <div><p>Wide card</p></div>\n    </div>' },
            ],
        });
    });

    it('adds a variant first seen on a later page, keeping the first page as the path', async () => {
        const fetchText = fetcherFor({
            [`${BASE}/a.plain.html`]: section('<div class="cards"><div>A</div></div>'),
            [`${BASE}/b.plain.html`]: section('<div class="cards"><div>B</div></div>'
                + '<div class="cards wide"><div>W</div></div>'),
        });

        const index = await buildBlockUseIndex(SITE, ['/a', '/b'], fetchText);

        expect(index.get('cards')).toEqual({
            path: '/a',
            examples: [{ variant: '', html: '<div>A</div>' }, { variant: 'wide', html: '<div>W</div>' }],
        });
    });

    it('records every block class, page-structure blocks included', async () => {
        const fetchText = fetcherFor({
            [`${BASE}/home.plain.html`]: section('<div class="metadata"><div>m</div></div>'
                + '<div class="section-metadata"><div>s</div></div>'),
        });

        const index = await buildBlockUseIndex(SITE, ['/home'], fetchText);

        expect([...index.keys()].sort()).toEqual(['metadata', 'section-metadata']);
    });

    it('reads a folder path at its index page and skips sheets', async () => {
        const fetchText = fetcherFor({});

        await buildBlockUseIndex(
            SITE,
            ['/', '/customer/account/confirm/', '/cart', '/query-index.json'],
            fetchText,
        );

        expect(fetchText.mock.calls.map(([url]) => url).sort()).toEqual([
            `${BASE}/cart.plain.html`,
            `${BASE}/customer/account/confirm/index.plain.html`,
            `${BASE}/index.plain.html`,
        ]);
    });

    it('keeps the first page in the given order, even when a later page answers first', async () => {
        let releaseFirst: (html: string) => void = () => undefined;
        const fetchText = jest.fn((url: string) => {
            if (url === `${BASE}/first.plain.html`) {
                return new Promise<string>((done) => { releaseFirst = done; });
            }
            return Promise.resolve(section('<div class="hero"><div>second</div></div>'));
        });

        const pending = buildBlockUseIndex(SITE, ['/first', '/second'], fetchText);
        await Promise.resolve();
        releaseFirst(section('<div class="hero"><div>first</div></div>'));
        const index = await pending;

        expect(index.get('hero')).toEqual({
            path: '/first',
            examples: [{ variant: '', html: '<div>first</div>' }],
        });
    });

    it('skips a page that cannot be read and keeps going', async () => {
        const fetchText = jest.fn(async (url: string) => {
            if (url.includes('/broken')) throw new Error('500');
            if (url.includes('/missing')) return undefined;
            return CART;
        });

        const index = await buildBlockUseIndex(SITE, ['/broken', '/missing', '/cart'], fetchText);

        expect(index.get('commerce-cart')?.path).toBe('/cart');
    });

    it('fetches a few pages at a time: more than one, never all at once', async () => {
        const paths = Array.from({ length: 20 }, (_, i) => `/page-${i}`);
        let inFlight = 0;
        let most = 0;
        const fetchText = jest.fn(async () => {
            inFlight += 1;
            most = Math.max(most, inFlight);
            await new Promise<void>((done) => { setImmediate(done); });
            inFlight -= 1;
            return section('<div class="hero"></div>');
        });

        await buildBlockUseIndex(SITE, paths, fetchText);

        expect(fetchText).toHaveBeenCalledTimes(20);
        expect(most).toBeGreaterThan(1);
        expect(most).toBeLessThan(20);
    });
});

describe('photosInUses', () => {
    const use = (path: string, html: string) => ({ path, examples: [{ variant: '', html }] });

    it('takes each image in the uses as an address on the site, without the resize query', () => {
        const index = new Map([
            ['hero', use('/', '<div><div><picture><source srcset="./media_a.jpeg?width=2000">'
                + '<img src="./media_a.jpeg?width=750&#x26;format=jpeg" alt="A"></picture></div></div>')],
            ['cards', use('/shop/sale', '<div><div><img alt="B" src="./media_b.png"></div></div>')],
        ]);

        expect(photosInUses(SITE, index)).toEqual([`${BASE}/media_a.jpeg`, `${BASE}/shop/media_b.png`]);
    });

    it('keeps a photo once, and only http and https addresses', () => {
        const index = new Map([
            ['hero', use('/a', '<img src="./media_a.jpeg"><img src="data:image/png;base64,xx">'
                + '<img src="javascript:alert(1)">')],
            ['cards', use('/b', '<img src="https://cdn.example.com/x.jpg"><img src="./media_a.jpeg">')],
        ]);

        expect(photosInUses(SITE, index)).toEqual([`${BASE}/media_a.jpeg`, 'https://cdn.example.com/x.jpg']);
    });

    it('finds none in uses with no image', () => {
        expect(photosInUses(SITE, new Map([['hero', use('/', '<div>text</div>')]]))).toStrictEqual([]);
    });
});
