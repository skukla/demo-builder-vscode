/**
 * findMissingPages — after a copy is published, is everything the source has there?
 *
 * The copy took every path the storefront's code loads that the source serves. This
 * asks the finished storefront for the same paths and names the ones it does not
 * serve, so a person and an agent are told instead of finding a blank cart page in
 * a demo (EDS-40). It runs at the end of a create or a reset that has otherwise
 * worked, so it may never throw and never report a gap it did not see.
 */

import { findMissingPages, missingPagesSentence } from '@/features/eds/services/storefront/missingPages';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { installSiteFetch, restoreFetch } from '../../../../helpers/siteFetchFake';

// GitHub owner and repository: the key the live site is published under.
const SITE = { owner: 'me', repo: 'shop' };
const LIVE = 'https://main--shop--me.aem.live';

afterEach(restoreFetch);

describe('findMissingPages', () => {
    it('asks the storefront for every path the source has, as the source was asked', async () => {
        const site = installSiteFetch([]);

        await findMissingPages(SITE, ['/cart', '/customer/forgotpassword', '/placeholders/cart.json'], createMockLogger());

        expect(site.asked().sort()).toEqual([
            `${LIVE}/cart.plain.html`,
            `${LIVE}/customer/forgotpassword.plain.html`,
            `${LIVE}/placeholders/cart.json`,
        ]);
    });

    it('names what the storefront does not serve', async () => {
        installSiteFetch([`${LIVE}/cart.plain.html`]);

        const result = await findMissingPages(SITE, ['/cart', '/checkout', '/search'], createMockLogger());

        expect(result.status).toBe('missing');
        expect(result.missing).toEqual(['/checkout', '/search']);
        expect(result.summary).toBe(
            '2 pages the source has are missing from this storefront: /checkout, /search',
        );
    });

    it('says nothing when the storefront serves them all', async () => {
        installSiteFetch([`${LIVE}/cart.plain.html`, `${LIVE}/placeholders/cart.json`]);

        const result = await findMissingPages(SITE, ['/cart', '/placeholders/cart.json'], createMockLogger());

        expect(result).toEqual({ status: 'complete', missing: [] });
    });

    it('does not call a page missing when the request for it failed', async () => {
        installSiteFetch([`${LIVE}/cart.plain.html`], [`${LIVE}/checkout.plain.html`]);

        const result = await findMissingPages(SITE, ['/cart', '/checkout'], createMockLogger());

        expect(result).toEqual({ status: 'complete', missing: [] });
    });

    it('says it could not check when the storefront answered nothing', async () => {
        installSiteFetch([], [`${LIVE}/cart.plain.html`, `${LIVE}/checkout.plain.html`]);

        const result = await findMissingPages(SITE, ['/cart', '/checkout'], createMockLogger());

        expect(result.status).toBe('not-checked');
        expect(result.missing).toStrictEqual([]);
        expect(result.summary).toBe(
            'Could not check whether every page the source has reached this storefront.',
        );
    });

    it('swallows a failure of the check itself into "could not check"', async () => {
        // Nothing the check calls is expected to throw; this is the guard for the
        // day something does. The storefront is missing /cart, and reporting it fails.
        installSiteFetch([]);
        const logger = createMockLogger();
        logger.warn.mockImplementationOnce(() => {
            throw new Error('output channel closed');
        });

        const result = await findMissingPages(SITE, ['/cart'], logger);

        expect(result.status).toBe('not-checked');
        expect(result.missing).toStrictEqual([]);
    });

    it('asks for nothing when the source had nothing', async () => {
        const site = installSiteFetch([]);

        const result = await findMissingPages(SITE, [], createMockLogger());

        expect(site.asked()).toStrictEqual([]);
        expect(result).toEqual({ status: 'complete', missing: [] });
    });
});

describe('missingPagesSentence', () => {
    it('counts one page in the singular', () => {
        expect(missingPagesSentence(['/cart'])).toBe(
            '1 page the source has is missing from this storefront: /cart',
        );
    });

    it('names the first ten and counts the rest', () => {
        const paths = Array.from({ length: 13 }, (_, index) => `/p${index}`);

        expect(missingPagesSentence(paths)).toBe(
            '13 pages the source has are missing from this storefront: ' +
                '/p0, /p1, /p2, /p3, /p4, /p5, /p6, /p7, /p8, /p9, and 3 more (all are in the Debug Logs)',
        );
    });
});
