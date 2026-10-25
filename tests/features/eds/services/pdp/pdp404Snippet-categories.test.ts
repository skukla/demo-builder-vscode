/**
 * The smart-404 script learns category pages (EDS-61).
 *
 * A category page lives at the category's own address (`/signs`) and, like a product page,
 * exists on the live site only once it is published. The script in `delayed.js` asks the
 * same `prepublish-pdp` action to publish it on a shopper's first visit; the action
 * publishes a category path only when the store lists it (and the site has opted in with
 * its authored-pages sheet), at its one cleaned path, and answers that path. A missing
 * page cannot be told from a category by its shape, so for a non-product path the script
 * shows nothing of its own: on any refusal the storefront's 404 stays as it was.
 *
 * These tests RUN the built snippet against a stub page — `window`, `document`, `fetch` —
 * and assert what it asked the action and where it sent the shopper. The product half is
 * run too, so the change cannot break it.
 */

import { TRIGGER_URL, visitSmart404, type Smart404Visit } from './pdp404Snippet.testUtils';

const SITE = { org: 'skukla', site: 'scratch-1022' };

/** Open `pathname` as a 404 page; the action answers `answer`, or 404 when there is none. */
const visit = (pathname: string, answer?: { path: string }): Promise<Smart404Visit> =>
    visitSmart404(pathname, answer ? { ok: true, body: { success: true, ...answer } } : { ok: false }, SITE);

const triggerFor = (path: string): string => `${TRIGGER_URL}?org=skukla&site=scratch-1022&path=${encodeURIComponent(path)}`;

describe('the smart-404 script on a category page', () => {
    it('asks the action to publish a missing category page and reloads it', async () => {
        const v = await visit('/signs/danger-signs', { path: '/signs/danger-signs' });

        expect(v.requests).toEqual([{ url: triggerFor('/signs/danger-signs'), method: 'POST' }]);
        expect(v.redirects).toEqual(['/signs/danger-signs?pdpRetry=1']);
    });

    it('goes where the action published it: the cleaned path', async () => {
        const v = await visit('/safety_cabinets', { path: '/safety-cabinets' });

        expect(v.redirects).toEqual(['/safety-cabinets?pdpRetry=1']);
    });

    it('never follows an answer that is not a page path of the site', async () => {
        const v = await visit('/signs', { path: 'https://elsewhere.example/x' });

        expect(v.redirects).toEqual(['/signs?pdpRetry=1']);
    });

    it("leaves the storefront's own 404 as it is when the path is no category: nothing shown, nowhere sent", async () => {
        // Any missing page could be a category's, so it asks; most are not.
        const v = await visit('/made-up');

        expect(v.requests).toHaveLength(1);
        expect(v.redirects).toStrictEqual([]);
        expect(v.main.innerHTML).toBe('Page Not Found');
    });

    it('asks nothing for the 404 page itself, the template, or a path no page could have', async () => {
        for (const path of ['/404', '/categories/default', '/Signs', '/a%20b', '/', '/signs.html']) {
            const v = await visit(path, { path: '/x' });
            expect({ path, requests: v.requests, redirects: v.redirects }).toEqual({ path, requests: [], redirects: [] });
        }
    });
});

describe('the smart-404 script on a product page (unchanged)', () => {
    it('publishes a cold product page through the action and reloads it', async () => {
        const v = await visit('/products/drum-cabinet/dc-100', { path: '/products/drum-cabinet/dc-100' });

        expect(v.requests).toEqual([{ url: triggerFor('/products/drum-cabinet/dc-100'), method: 'POST' }]);
        expect(v.redirects).toEqual(['/products/drum-cabinet/dc-100?pdpRetry=1']);
        expect(v.main.innerHTML).toContain('Loading product');
    });

    it('never follows an answer that is not a product path', async () => {
        const v = await visit('/products/a/b', { path: '/categories/signs' });

        expect(v.redirects).toEqual(['/products/a/b?pdpRetry=1']);
    });
});
