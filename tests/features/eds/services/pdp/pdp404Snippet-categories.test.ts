/**
 * The smart-404 script publishes category pages on a shopper's first visit (EDS-61, step 2).
 *
 * A category page lives at the category's own address (`/signs/fire`) and, like a product
 * page, exists on the live site only once it is published. The script in `delayed.js` asks
 * the same `prepublish-pdp` action to publish it. The action's contract (2026-10-29): a
 * category address is any path whose segments are all `[a-z0-9-]`, except the two templates;
 * a product-shaped address is tried as a product first, then as a category. It answers 200
 * (published, with the path), 404 (no such product or category, nothing published), 503
 * (the store could not be asked, nothing published) or 400 (bad input).
 *
 * So the script, on a category-shaped path: shows "Loading…" ("Loading product…" on a
 * product-shaped one), asks, and on 200 reloads into the page; on 503 sends the shopper to a
 * search filtered to that category (the menu block's own fallback shape); on anything else
 * puts the storefront's own 404 back where it was. A product-shaped path that is refused goes
 * to `/404`. A path of neither shape is not touched.
 *
 * The script lives in `404.html` (since 2026-10-29: Adobe's B2B template has no
 * `scripts/delayed.js`), inline at the end of the body.
 *
 * These tests RUN the built snippets against stub pages and assert what they asked and
 * where they sent the shopper. The product half is run too, so the change cannot break it.
 */

import { OWN_404_BODY, TRIGGER_URL, visitSmart404, type Smart404Visit } from './pdp404Snippet.testUtils';
import { SMART_404_HEAD_SNIPPET_TEMPLATE } from '@/features/eds/services/pdp/pdp404Snippet';

const SITE = { org: 'skukla', site: 'scratch-1022' };

/** Open `pathname` as a 404 page; the action publishes at `path`. */
const published = (pathname: string, path?: string): Promise<Smart404Visit> =>
    visitSmart404(pathname, { ok: true, body: { success: true, ...(path ? { path } : {}) } }, SITE);

/** Open `pathname` as a 404 page; the action refuses with `status`. */
const refused = (pathname: string, status: number): Promise<Smart404Visit> =>
    visitSmart404(pathname, { ok: false, status, body: { success: false } }, SITE);

const triggerFor = (path: string): string => `${TRIGGER_URL}?org=skukla&site=scratch-1022&path=${encodeURIComponent(path)}`;
const post = (path: string) => ({ url: triggerFor(path), method: 'POST' });

describe('the smart-404 script on a category address', () => {
    it('shows "Loading…", asks the action to publish the page, and reloads into it', async () => {
        const v = await published('/signs/danger-signs', '/signs/danger-signs');

        expect(v.requests).toEqual([post('/signs/danger-signs')]);
        expect(v.redirects).toEqual(['/signs/danger-signs?pdpRetry=1']);
        expect(v.shown).toHaveLength(1);
        expect(v.shown[0]).toContain('>Loading…<');
        expect(v.shown[0]).not.toContain('Loading product');
    });

    it('never touches <main>: the storefront decorates it on its own schedule', async () => {
        // The script runs inline at the end of 404.html, before the storefront's scripts
        // decorate <main>. Its loading state is its own element beside <main>, which stays
        // hidden while the action works.
        const v = await published('/signs/danger-signs', '/signs/danger-signs');

        expect(v.main).toEqual({ className: 'error', innerHTML: OWN_404_BODY });
        expect(v.left).toEqual({ loading: true, mainHidden: true });
    });

    it('goes where the action says it published the page', async () => {
        const v = await published('/signs/fire', '/signs/fire-safety');

        expect(v.redirects).toEqual(['/signs/fire-safety?pdpRetry=1']);
    });

    it('never follows an answer that is not a page address of the site', async () => {
        for (const path of ['https://elsewhere.example/x', '//elsewhere.example/x', '/signs.html']) {
            const v = await published('/signs', path);
            expect({ path, redirects: v.redirects }).toEqual({ path, redirects: ['/signs?pdpRetry=1'] });
        }
    });

    it("puts the storefront's own 404 back, at the same address, when there is no such category", async () => {
        const v = await refused('/made-up', 404);

        expect(v.requests).toEqual([post('/made-up')]);
        expect(v.redirects).toStrictEqual([]);
        expect(v.main).toEqual({ className: 'error', innerHTML: OWN_404_BODY });
        expect(v.left).toEqual({ loading: false, mainHidden: false });
    });

    it("puts the storefront's own 404 back on a 400 too: only a 503 means the store was not asked", async () => {
        const v = await refused('/made-up', 400);

        expect(v.redirects).toStrictEqual([]);
        expect(v.main).toEqual({ className: 'error', innerHTML: OWN_404_BODY });
        expect(v.left).toEqual({ loading: false, mainHidden: false });
    });

    it('sends the shopper to a search filtered to the category when the store could not be asked (503)', async () => {
        const v = await refused('/signs/fire', 503);

        // One retry on a 5xx, as for a product.
        expect(v.requests).toEqual([post('/signs/fire'), post('/signs/fire')]);
        expect(v.redirects).toEqual([`/search?filter=${encodeURIComponent('categoryPath:signs/fire')}`]);
    });

    it("sends no search for an address the menu's search fallback would also refuse (a number range)", async () => {
        // `searchFallbackHref` in the catalog-menu block returns null for `10-20`: the search
        // block would read it as a price range.
        const v = await refused('/10-20', 503);

        expect(v.redirects).toStrictEqual([]);
        expect(v.main).toEqual({ className: 'error', innerHTML: OWN_404_BODY });
        expect(v.left).toEqual({ loading: false, mainHidden: false });
    });

    it('asks nothing and shows nothing on a path that is neither a category nor a product address', async () => {
        const paths = [
            '/404',
            '/categories/default',
            '/products/default',
            '/Signs',
            '/safety_cabinets',
            '/a%20b',
            '/',
            '/signs/',
            '/signs.html',
            '/customer/account.html',
            '/media_1a2b.png',
        ];
        for (const path of paths) {
            const v = await published(path, '/x');
            expect({ path, requests: v.requests, redirects: v.redirects, shown: v.shown, left: v.left }).toEqual({
                path, requests: [], redirects: [], shown: [], left: { loading: false, mainHidden: false },
            });
        }
    });
});

/**
 * Measured live on scratch-1028 (2026-10-29, headless Chrome): a SECOND visit to an address
 * published a moment earlier got a cached 404; the action answered 409 ("Address already
 * has a live page") and the shopper stayed on "Page Not Found". A 409 means the page IS
 * live: reload once, past the cache.
 */
describe('the smart-404 script when the page is already live (409)', () => {
    const FRESH = /^\/signs\/fire\?pdpRetry=1&pdpFresh=\d+$/;

    it('reloads once into the page, with a value no cache has seen', async () => {
        const v = await refused('/signs/fire', 409);

        expect(v.requests).toEqual([post('/signs/fire')]);
        expect(v.redirects).toHaveLength(1);
        expect(v.redirects[0]).toMatch(FRESH);
    });

    it('does the same for a product address', async () => {
        const v = await refused('/products/drum-cabinet/dc-100', 409);

        expect(v.redirects[0]).toMatch(/^\/products\/drum-cabinet\/dc-100\?pdpRetry=1&pdpFresh=\d+$/);
    });

    it('leaves the 404 page alone when that reload still 404s: the retry flag stops a loop', async () => {
        const v = await visitSmart404('/signs/fire', { ok: false, status: 409 }, SITE, '?pdpRetry=1&pdpFresh=1');

        expect({ requests: v.requests, redirects: v.redirects, shown: v.shown }).toStrictEqual({ requests: [], redirects: [], shown: [] });
    });
});

describe('the tab title while the script works', () => {
    it('says "Loading…" while the action is asked, not "Page not found"', async () => {
        for (const path of ['/signs/fire', '/products/drum-cabinet/dc-100']) {
            const v = await published(path, path);
            expect({ path, whileLoading: v.title.whileLoading }).toEqual({ path, whileLoading: 'Loading…' });
        }
    });

    it("puts the page's own title back with its own 404", async () => {
        const v = await refused('/made-up', 404);

        expect(v.title).toEqual({ whileLoading: 'Loading…', after: 'Page not found' });
    });
});

describe('the smart-404 script on a product address', () => {
    it('publishes a cold product page through the action and reloads it, captioned "Loading product…"', async () => {
        const v = await published('/products/drum-cabinet/dc-100', '/products/drum-cabinet/dc-100');

        expect(v.requests).toEqual([post('/products/drum-cabinet/dc-100')]);
        expect(v.redirects).toEqual(['/products/drum-cabinet/dc-100?pdpRetry=1']);
        expect(v.shown[0]).toContain('Loading product…');
    });

    it('publishes a category whose address has the product shape (a top category keyed `products`)', async () => {
        const v = await published('/products/racks/servers', '/products/racks/servers');

        expect(v.requests).toEqual([post('/products/racks/servers')]);
        expect(v.redirects).toEqual(['/products/racks/servers?pdpRetry=1']);
    });

    it('never follows an answer that is not a product address', async () => {
        const v = await published('/products/a/b', '/categories/signs');

        expect(v.redirects).toEqual(['/products/a/b?pdpRetry=1']);
    });

    it('sends the shopper to the native /404 when the action finds neither', async () => {
        const v = await refused('/products/gone/gone-1', 404);

        expect(v.redirects).toEqual(['/404']);
    });

    it('sends a product address to the native /404 when the store could not be asked, never to a search', async () => {
        // Owner, 2026-10-29: a shopper opening a product link must not land on an empty
        // category search. The search fallback is for category addresses of no product shape.
        for (const path of ['/products/racks/servers', '/products/sign/rre-805-white', '/products/sign/rre-805_5fwhite']) {
            const v = await refused(path, 503);
            expect({ path, redirects: v.redirects }).toEqual({ path, redirects: ['/404'] });
        }
    });
});

/**
 * The eager script in `head.html` / `404.html`, run: before the body paints, it hides
 * `<main>` on a cold 404 that `delayed.js` will act on, so the 404 body does not flash
 * before the loading state. That is now a category address as well as a product one.
 */
describe('the eager head script', () => {
    interface HeadRun { redirects: string[]; hidden: boolean; tidied: string[] }

    function runHead(pathname: string, isErrorPage = true, search = ''): HeadRun {
        const redirects: string[] = [];
        const tidied: string[] = [];
        const appended: Array<{ id?: string }> = [];
        const code = SMART_404_HEAD_SNIPPET_TEMPLATE.replace(/^[\s\S]*?<script[^>]*>/, '').replace(/<\/script>[\s\S]*$/, '');
        const document = {
            prerendering: false,
            createElement: () => ({}),
            head: { appendChild: (el: { id?: string }) => appended.push(el) },
        };
        const location = { pathname, search, hash: '', replace: (to: string) => redirects.push(to) };
        const history = { state: null, replaceState: (_s: unknown, _t: string, url: string) => tidied.push(url) };
        new Function('window', 'document', 'location', 'history', code)({ isErrorPage }, document, location, history);
        return { redirects, hidden: appended.some((el) => el.id === 'smart-404-cold-hide'), tidied };
    }

    it('hides <main> on a cold category 404 as on a cold product 404', () => {
        expect(runHead('/signs/fire')).toEqual({ redirects: [], hidden: true, tidied: [] });
        expect(runHead('/products/a/b')).toEqual({ redirects: [], hidden: true, tidied: [] });
    });

    it("tidies the published page's address: only our parameters go, and nothing reloads", () => {
        // After the reload the address ended "?pdpRetry=1&...". The product list adds its own
        // page/sort/filter parameters; those stay.
        expect(runHead('/signs/fire', false, '?pdpRetry=1&pdpFresh=123&page=2&sort=price')).toEqual({
            redirects: [], hidden: false, tidied: ['/signs/fire?page=2&sort=price'],
        });
        expect(runHead('/products/a/b', false, '?pdpRetry=1').tidied).toEqual(['/products/a/b']);
    });

    it("leaves the address alone on the 404 page, where the retry flag is the script's loop guard", () => {
        expect(runHead('/signs/fire', true, '?pdpRetry=1&pdpFresh=1').tidied).toStrictEqual([]);
    });

    it('touches an address without our parameters not at all', () => {
        expect(runHead('/signs/fire', false, '?page=2').tidied).toStrictEqual([]);
    });

    it('still lowercases a mixed-case product address, and only a product address', () => {
        expect(runHead('/products/Foo/BAR').redirects).toEqual(['/products/foo/bar']);
        expect(runHead('/Signs/Fire')).toEqual({ redirects: [], hidden: false, tidied: [] });
    });

    it('leaves alone every path the delayed script leaves alone, and every page that is not a 404', () => {
        for (const path of ['/404', '/categories/default', '/products/default', '/signs.html', '/a_b', '/']) {
            expect({ path, ...runHead(path) }).toEqual({ path, redirects: [], hidden: false, tidied: [] });
        }
        expect(runHead('/signs/fire', false)).toEqual({ redirects: [], hidden: false, tidied: [] });
    });
});
