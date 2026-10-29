/**
 * probePaths — asking a published site which paths it serves.
 *
 * The copy asks the source before it copies and the storefront after it publishes.
 * Both questions go to a public CDN that owes the copy nothing, so every bound is
 * tested here: how each kind of path is asked for, what counts as an answer, and
 * that a slow or broken site costs a fixed amount of time and never an error.
 */

import { probePaths, probeUrl } from '@/features/eds/services/sitePathProbe';
import { installSiteFetch, restoreFetch } from '../../../helpers/siteFetchFake';

const BASE = 'https://main--their-demo--colleague.aem.live';

afterEach(restoreFetch);

describe('how each kind of path is asked for', () => {
    it('asks for a page at the .plain.html the copy reads, never the bare URL', () => {
        // The bare URL of a /customer page gates to a login, and a file in the
        // repository can answer a bare URL; neither is a page the copy can read.
        expect(probeUrl(BASE, '/cart')).toBe(`${BASE}/cart.plain.html`);
        expect(probeUrl(BASE, '/customer/forgotpassword')).toBe(`${BASE}/customer/forgotpassword.plain.html`);
    });

    it('asks for a sheet at its own .json path', () => {
        expect(probeUrl(BASE, '/placeholders/cart.json')).toBe(`${BASE}/placeholders/cart.json`);
    });
});

describe('what counts as an answer', () => {
    it('sorts paths into served, absent and unknown', async () => {
        const site = installSiteFetch(
            [`${BASE}/cart.plain.html`, `${BASE}/placeholders/cart.json`],
            [`${BASE}/search.plain.html`],
        );

        const result = await probePaths(BASE, ['/cart', '/checkout', '/search', '/placeholders/cart.json']);

        expect(result.served).toEqual(['/cart', '/placeholders/cart.json']);
        expect(result.absent).toEqual(['/checkout']);
        expect(result.unknown).toEqual(['/search']);
        expect(site.asked().sort()).toEqual([
            `${BASE}/cart.plain.html`,
            `${BASE}/checkout.plain.html`,
            `${BASE}/placeholders/cart.json`,
            `${BASE}/search.plain.html`,
        ]);
    });

    it('asks for a page with HEAD and reads a sheet with GET', async () => {
        const site = installSiteFetch([`${BASE}/cart.plain.html`, `${BASE}/placeholders/cart.json`]);

        await probePaths(BASE, ['/cart', '/placeholders/cart.json']);

        expect(site.methodFor(`${BASE}/cart.plain.html`)).toBe('HEAD');
        expect(site.methodFor(`${BASE}/placeholders/cart.json`)).toBe('GET');
    });

    it('does not call JSON that is not a sheet a sheet', async () => {
        // A storefront's config.json answers 200 with JSON from the repository. It
        // has no row list, and copying it as a sheet would carry one site's
        // settings to another.
        installSiteFetch({ [`${BASE}/config.json`]: { public: { default: {} } } });

        const result = await probePaths(BASE, ['/config.json']);

        expect(result.served).toStrictEqual([]);
        expect(result.absent).toEqual(['/config.json']);
    });

    it('reads a multi-sheet document as a sheet', async () => {
        installSiteFetch({
            [`${BASE}/placeholders/cart.json`]: {
                data: { total: 1, offset: 0, limit: 1, data: [{ Key: 'k', Value: 'v' }] },
                ':names': ['data'],
                ':version': 3,
                ':type': 'multi-sheet',
            },
        });

        const result = await probePaths(BASE, ['/placeholders/cart.json']);

        expect(result.served).toEqual(['/placeholders/cart.json']);
    });
});

describe('the bounds', () => {
    it('asks for no more paths than the cap and reports the rest as unknown', async () => {
        const site = installSiteFetch([]);
        const paths = ['/a', '/b', '/c', '/d', '/e'];

        const result = await probePaths(BASE, paths, { maxPaths: 2, concurrency: 2, budgetMs: 60000 });

        expect(site.asked()).toEqual([`${BASE}/a.plain.html`, `${BASE}/b.plain.html`]);
        expect(result.absent).toEqual(['/a', '/b']);
        expect(result.unknown).toEqual(['/c', '/d', '/e']);
    });

    it('stops asking once the time allowed is spent', async () => {
        const site = installSiteFetch([`${BASE}/a.plain.html`]);

        const result = await probePaths(BASE, ['/a', '/b'], { maxPaths: 10, concurrency: 1, budgetMs: 0 });

        expect(site.asked()).toStrictEqual([]);
        expect(result.unknown).toEqual(['/a', '/b']);
    });

    it('never has more requests in flight than the concurrency allows', async () => {
        let inFlight = 0;
        let most = 0;
        global.fetch = jest.fn(async () => {
            inFlight += 1;
            most = Math.max(most, inFlight);
            await Promise.resolve();
            inFlight -= 1;
            return { ok: true, status: 200 };
        }) as unknown as typeof fetch;

        await probePaths(BASE, ['/a', '/b', '/c', '/d', '/e'], { maxPaths: 10, concurrency: 2, budgetMs: 60000 });

        expect(most).toBe(2);
    });
});
