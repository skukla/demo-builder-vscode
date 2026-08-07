/**
 * Storefront delivery probe.
 *
 * Answers what the setup logs cannot: those record what the CREATING run
 * attempted, not what is serving now. When a colleague reports "PDPs don't work",
 * the questions are whether the smart-404 snippet and eager redirect are actually
 * deployed, and whether a given PDP URL resolves at all.
 *
 * Signals verified live against `skukla/demo-builder-test` (2026-08-07):
 *   /scripts/delayed.js   carries SMART_404_MARKER_START
 *   /404.html             carries SMART_404_HEAD_MARKER_START
 *   /products/default     200 + class="product-details"
 *   /products/<bad>/<sku> 404
 */

import { probeStorefrontDelivery, aemLiveBaseUrl } from '@/features/eds/services/storefrontProbe';
import {
    SMART_404_MARKER_START,
    SMART_404_HEAD_MARKER_START,
} from '@/features/eds/services/pdp404HandlerPublisher';

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

/**
 * Route each probed URL to a canned response, matched on the exact PATHNAME.
 *
 * A substring match cannot work here: every URL contains '/', so the root route
 * swallowed the PDP fetch and the prerender assertion failed against the
 * homepage body.
 */
function mockFetch(routes: Record<string, { status: number; body?: string }>) {
    global.fetch = jest.fn(async (url: string) => {
        const hit = routes[new URL(String(url)).pathname] ?? { status: 404, body: '' };
        return {
            ok: hit.status >= 200 && hit.status < 300,
            status: hit.status,
            text: async () => hit.body ?? '',
        };
    }) as never;
}

const HEALTHY = {
    '/scripts/delayed.js': { status: 200, body: `x\n${SMART_404_MARKER_START}\ny` },
    '/404.html': { status: 200, body: `<html>${SMART_404_HEAD_MARKER_START}</html>` },
    '/': { status: 200, body: '<html>home</html>' },
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('aemLiveBaseUrl', () => {
    it('builds the GitHub-keyed live URL', () => {
        expect(aemLiveBaseUrl('skukla', 'demo-builder-test')).toBe(
            'https://main--demo-builder-test--skukla.aem.live'
        );
    });
});

describe('probeStorefrontDelivery', () => {
    it('reports the smart-404 snippet installed when delayed.js carries the marker', async () => {
        mockFetch(HEALTHY);

        const result = await probeStorefrontDelivery('skukla', 'demo-builder-test', logger);

        expect(result.smart404Snippet?.installed).toBe(true);
    });

    it('reports it MISSING when delayed.js is served without the marker', async () => {
        mockFetch({ ...HEALTHY, '/scripts/delayed.js': { status: 200, body: 'no marker here' } });

        const result = await probeStorefrontDelivery('skukla', 'demo-builder-test', logger);

        expect(result.smart404Snippet?.installed).toBe(false);
    });

    it('reports the eager redirect from 404.html', async () => {
        mockFetch({ ...HEALTHY, '/404.html': { status: 200, body: '<html>plain</html>' } });

        const result = await probeStorefrontDelivery('skukla', 'demo-builder-test', logger);

        expect(result.eagerRedirect?.installed).toBe(false);
    });

    it('calls a PDP path prerendered when it serves 200 with the product block', async () => {
        mockFetch({
            ...HEALTHY,
            '/products/default': { status: 200, body: '<div class="product-details"></div>' },
        });

        const result = await probeStorefrontDelivery(
            'skukla',
            'demo-builder-test',
            logger,
            '/products/default'
        );

        expect(result.pdp).toMatchObject({ status: 200, prerendered: true });
    });

    it('calls a 404 PDP path NOT prerendered', async () => {
        mockFetch({ ...HEALTHY, '/products/nope': { status: 404, body: 'Page Not Found' } });

        const result = await probeStorefrontDelivery(
            'skukla',
            'demo-builder-test',
            logger,
            '/products/nope'
        );

        expect(result.pdp).toMatchObject({ status: 404, prerendered: false });
    });

    it('skips the PDP leg when no path is given — an invented one 404s like a finding', async () => {
        mockFetch(HEALTHY);

        const result = await probeStorefrontDelivery('skukla', 'demo-builder-test', logger);

        expect(result.pdp).toBeUndefined();
    });

    it('issues only GET requests — a diagnostic must never mutate a live storefront', async () => {
        mockFetch(HEALTHY);

        await probeStorefrontDelivery('skukla', 'demo-builder-test', logger, '/products/default');

        for (const call of (global.fetch as jest.Mock).mock.calls) {
            const init = call[1] as { method?: string } | undefined;
            expect((init?.method ?? 'GET').toUpperCase()).toBe('GET');
        }
    });

    it('says the site is unreachable rather than reporting every leg as missing', async () => {
        // A dead site would otherwise read as "nothing is installed", which points
        // at a reinstall instead of at the site being down.
        mockFetch({ '/': { status: 503, body: '' } });

        const result = await probeStorefrontDelivery('skukla', 'demo-builder-test', logger);

        expect(result.site.reachable).toBe(false);
        expect(result.verdict).toMatch(/unreachable|not reachable/i);
        expect(result.smart404Snippet).toBeUndefined();
    });

    it('gives a verdict naming the missing piece when the site is up', async () => {
        mockFetch({ ...HEALTHY, '/scripts/delayed.js': { status: 404, body: '' } });

        const result = await probeStorefrontDelivery('skukla', 'demo-builder-test', logger);

        expect(result.verdict).toMatch(/smart 404/i);
    });
});
