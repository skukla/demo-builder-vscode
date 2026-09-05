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
 *
 * NOTE on `/products/default`: it is the overlay's authored SOURCE, which
 * `render-pdp` fetches and returns as the body for real PDPs — not a prerendered
 * page. It answers 200 regardless of whether the overlay is registered or the
 * action is deployed, so it cannot evidence that any PDP renders. It was reported
 * as `prerendered` until 2026-08-10; a storefront that could not serve a single
 * PDP came back "Storefront delivery looks correct."
 */

import {
    aemLiveBaseUrl,
    probeOverlayVersion,
    probeStorefrontDelivery,
} from '@/features/eds/services/storefront/storefrontProbe';
import {
    SMART_404_MARKER_START,
    SMART_404_HEAD_MARKER_START,
} from '@/features/eds/services/pdp/pdp404Snippet';
import { createMockLogger } from '../../../../helpers/loggerFake';

const logger = createMockLogger();

/**
 * Route each probed URL to a canned response, matched on the exact PATHNAME.
 *
 * A substring match cannot work here: every URL contains '/', so the root route
 * swallowed the PDP fetch and the prerender assertion failed against the
 * homepage body.
 */
function mockFetch(routes: Record<string, { status: number; body?: string }>) {
    global.fetch = jest.fn(async (url: RequestInfo | URL) => {
        const hit = routes[new URL(String(url)).pathname] ?? { status: 404, body: '' };
        // Only the three members the probe reads; the rest of Response is not built.
        return {
            ok: hit.status >= 200 && hit.status < 300,
            status: hit.status,
            text: async () => hit.body ?? '',
        } as unknown as Response;
    });
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

    it('reports the overlay source template published when it serves 200', async () => {
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

        expect(result.authoredTemplate).toMatchObject({ status: 200, published: true });
    });

    it('reports the source template NOT published on a 404, and says PDPs render from it', async () => {
        mockFetch({ ...HEALTHY, '/products/default': { status: 404, body: 'Page Not Found' } });

        const result = await probeStorefrontDelivery(
            'skukla',
            'demo-builder-test',
            logger,
            '/products/default'
        );

        expect(result.authoredTemplate).toMatchObject({ status: 404, published: false });
        expect(result.verdict).toMatch(/source template/i);
        expect(result.verdict).toMatch(/every PDP renders from this page/i);
    });

    it('skips the template leg when no path is given — an invented one 404s like a finding', async () => {
        mockFetch(HEALTHY);

        const result = await probeStorefrontDelivery('skukla', 'demo-builder-test', logger);

        expect(result.authoredTemplate).toBeUndefined();
    });

    it('never calls anything "prerendered" — that word cost us a false green', async () => {
        // THE control for this rename. `/products/default` is render-pdp's authored
        // INPUT: it answers 200 with the product block whether or not the overlay
        // is registered or the action is deployed. Reporting it as `prerendered`
        // meant a storefront that could not serve one PDP read "looks correct".
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

        expect(JSON.stringify(result)).not.toMatch(/prerender/i);
    });

    it('does not claim delivery is correct outright — it says no SKU was checked', async () => {
        // The all-green verdict asserts only what four GETs can establish.
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

        expect(result.verdict).toMatch(/no SKU was checked/i);
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

/**
 * The real-SKU leg — the only one that exercises the whole chain.
 *
 * `/products/default` cannot fail for a prerender reason (it is the overlay's
 * input). A path built for a SKU the catalog just confirmed exists can: the
 * request goes through overlay registration, `render-pdp`, the authored-template
 * fetch, and the content-bus write. It is also the only automated check that the
 * three hand-written copies of `encodeSkuForUrl` still agree — our copy builds
 * the path, their code serves it.
 */
describe('probeStorefrontDelivery — real SKU leg', () => {
    const SKU = 'VA19-SI-NA';
    const PDP_PATH = '/products/cronus-yoga-pant/va19-si-na';
    const target = { path: PDP_PATH, sku: SKU };
    const WITH_TEMPLATE = { ...HEALTHY, '/products/default': { status: 200, body: '<html/>' } };

    it('reports the PDP served on a 200', async () => {
        mockFetch({ ...WITH_TEMPLATE, [PDP_PATH]: { status: 200, body: '<html>pdp</html>' } });

        const result = await probeStorefrontDelivery(
            'skukla',
            'demo-builder-test',
            logger,
            '/products/default',
            target
        );

        expect(result.pdp).toMatchObject({ sku: SKU, status: 200, served: true });
        expect(result.verdict).toContain(SKU);
    });

    it('does not let a served PDP imply the product data loaded', async () => {
        // Nothing here runs page JavaScript. An empty product block is a 200.
        mockFetch({ ...WITH_TEMPLATE, [PDP_PATH]: { status: 200, body: '<html>pdp</html>' } });

        const result = await probeStorefrontDelivery(
            'skukla',
            'demo-builder-test',
            logger,
            '/products/default',
            target
        );

        expect(result.verdict).toMatch(/does not confirm the product data loaded/i);
    });

    it('calls a 404 on a catalog-confirmed SKU what it is — the chain is broken', async () => {
        // THE case the old probe could not produce at all. Every leg below is
        // healthy; only the PDP fails, and that must not be excused as "maybe
        // that SKU has no page" — the catalog said it exists.
        mockFetch({ ...WITH_TEMPLATE, [PDP_PATH]: { status: 404, body: 'Page Not Found' } });

        const result = await probeStorefrontDelivery(
            'skukla',
            'demo-builder-test',
            logger,
            '/products/default',
            target
        );

        expect(result.pdp).toMatchObject({ status: 404, served: false });
        expect(result.verdict).toContain(SKU);
        expect(result.verdict).not.toMatch(/looks correct/i);
    });

    it('names BOTH causes of a 404 rather than blaming the chain', async () => {
        // Cold-path recovery is client-side: delayed.js runs in a browser and
        // calls prepublish-pdp, so a fetch can never trigger it. Any SKU that
        // pre-warming missed 404s on a perfectly healthy storefront. Asserting
        // "the chain is broken" there is the same over-claiming that made this
        // probe report a prerender that never happened — pointed the other way.
        mockFetch({ ...WITH_TEMPLATE, [PDP_PATH]: { status: 404, body: 'Page Not Found' } });

        const result = await probeStorefrontDelivery(
            'skukla',
            'demo-builder-test',
            logger,
            '/products/default',
            target
        );

        expect(result.verdict).toMatch(/no page has been published/i);
        expect(result.verdict).toMatch(/prerender chain is not serving/i);
        expect(result.verdict).toMatch(/browser/i);
    });

    it('omits the leg when no SKU could be sampled, without going red', async () => {
        // Control for the gates: a PaaS backend, no Commerce endpoint, or a
        // Catalog outage all arrive here as "no target". None is a storefront
        // fault and none may colour the verdict.
        mockFetch(WITH_TEMPLATE);

        const result = await probeStorefrontDelivery(
            'skukla',
            'demo-builder-test',
            logger,
            '/products/default'
        );

        expect(result.pdp).toBeUndefined();
        expect(result.verdict).toMatch(/no SKU was checked/i);
        expect(result.verdict).not.toMatch(/not serving/i);
    });

    it('still issues only GET requests with the SKU leg active', async () => {
        // Extends the read-only guarantee to the new leg. A diagnostic that
        // published a PDP would change the thing it was called to measure.
        mockFetch({ ...WITH_TEMPLATE, [PDP_PATH]: { status: 200, body: 'x' } });

        await probeStorefrontDelivery(
            'skukla',
            'demo-builder-test',
            logger,
            '/products/default',
            target
        );

        for (const call of (global.fetch as jest.Mock).mock.calls) {
            const init = call[1] as { method?: string } | undefined;
            expect((init?.method ?? 'GET').toUpperCase()).toBe('GET');
        }
    });
});

/**
 * Which build of the shared overlay action is deployed.
 *
 * Reported, never compared. The overlay URL points at an action in another repo
 * that deploys on its own schedule, so any expectation asserted here would go
 * red on every legitimate deploy of that action.
 */
describe('probeOverlayVersion', () => {
    const OVERLAY = 'https://ns.adobeioruntime.net/api/v1/web/accs-discovery/render-pdp?org=a&site=b';

    const respondWith = (impl: () => unknown) => {
        // The canned reply carries only what the probe reads; it is a partial Response.
        global.fetch = jest.fn(async () => impl() as Response);
    };

    it('reports the sha and version the action returns', async () => {
        respondWith(() => ({ status: 200, json: async () => ({ sha: '9207b91', version: '1.0.0' }) }));

        expect(await probeOverlayVersion(OVERLAY)).toEqual({
            sha: '9207b91',
            version: '1.0.0',
            unknown: false,
        });
    });

    it('strips the query string before appending /__version', async () => {
        // The registered URL carries ?org=&site=; appending to it would produce
        // /render-pdp?org=a&site=b/__version, which is not a path at all.
        respondWith(() => ({ status: 200, json: async () => ({ sha: 'x' }) }));

        await probeOverlayVersion(OVERLAY);

        const [url] = (global.fetch as jest.Mock).mock.calls[0];
        expect(String(url)).toBe(
            'https://ns.adobeioruntime.net/api/v1/web/accs-discovery/render-pdp/__version'
        );
    });

    it('says unknown for an action deployed before the endpoint existed', async () => {
        // Every storefront in the field is this until that action redeploys. It
        // is not a fault and must never read as one.
        respondWith(() => ({ status: 404, json: async () => ({}) }));

        expect(await probeOverlayVersion(OVERLAY)).toEqual({ unknown: true });
    });

    it('says unknown rather than half-answering a malformed body', async () => {
        respondWith(() => ({ status: 200, json: async () => ({ nope: 1 }) }));

        expect(await probeOverlayVersion(OVERLAY)).toEqual({ unknown: true });
    });

    it('says unknown when the action is unreachable', async () => {
        respondWith(() => {
            throw new Error('ENOTFOUND');
        });

        expect(await probeOverlayVersion(OVERLAY)).toEqual({ unknown: true });
    });

    it('issues only a GET', async () => {
        respondWith(() => ({ status: 200, json: async () => ({ sha: 'x' }) }));

        await probeOverlayVersion(OVERLAY);

        const [, init] = (global.fetch as jest.Mock).mock.calls[0];
        expect(((init as { method?: string })?.method ?? 'GET').toUpperCase()).toBe('GET');
    });

    it('an unknown build does not change the storefront verdict', async () => {
        // The control on degradation: adding this leg must not make a healthy
        // storefront report a problem just because the action is old.
        mockFetch({ ...HEALTHY, '/products/default': { status: 200, body: '<html/>' } });

        const result = await probeStorefrontDelivery(
            'skukla',
            'demo-builder-test',
            logger,
            '/products/default',
            undefined,
            OVERLAY
        );

        expect(result.overlay).toEqual({ unknown: true });
        expect(result.verdict).toMatch(/looks correct/i);
    });
});

/**
 * The transport failures and the boundary statuses.
 *
 * Everything above drives the probe through canned HTTP answers. This block
 * covers what happens when there is no answer at all — the two catch paths and
 * the error-carrying leg result — and the edges of the reachable window, which
 * decide whether an SC is told to reinstall a storefront that is merely down.
 */
describe('probeStorefrontDelivery — no answer, and the edges of "reachable"', () => {
    /** Canned responses, but a listed path may instead throw the way fetch does. */
    function mockFetchOrThrow(routes: Record<string, { status: number; body?: string } | Error>) {
        global.fetch = jest.fn(async (url: RequestInfo | URL) => {
            const hit = routes[new URL(String(url)).pathname] ?? { status: 404, body: '' };
            if (hit instanceof Error) throw hit;
            return {
                ok: hit.status >= 200 && hit.status < 300,
                status: hit.status,
                text: async () => hit.body ?? '',
            } as unknown as Response;
        });
    }

    it('reports an unreachable site with no status when the request never lands', async () => {
        // DNS failure, TLS failure, timeout: there is no HTTP status to report, and
        // reporting 0 would print as "HTTP 0" in the verdict.
        mockFetchOrThrow({ '/': new Error('ENOTFOUND main--demo--skukla.aem.live') });

        const result = await probeStorefrontDelivery('skukla', 'demo-builder-test', logger);

        expect(result.site.reachable).toBe(false);
        expect(result.site.status).toBeUndefined();
        expect(result.site.error).toBe('ENOTFOUND main--demo--skukla.aem.live');
        expect(result.verdict).toMatch(/unreachable/i);
        expect(result.verdict).not.toMatch(/HTTP/);
    });

    it('keeps the HTTP status when the site answers with an error status', async () => {
        mockFetch({ '/': { status: 503, body: '' } });

        const result = await probeStorefrontDelivery('skukla', 'demo-builder-test', logger);

        expect(result.site.status).toBe(503);
        expect(result.verdict).toMatch(/HTTP 503/);
    });

    it('treats 400 as unreachable — the window ends below it', async () => {
        // 2xx and 3xx are a site answering. 400 is the first status that is not,
        // and an off-by-one here would send the probe on to report every marker
        // missing against a site that never served anything.
        mockFetch({ '/': { status: 400, body: '' } });

        const result = await probeStorefrontDelivery('skukla', 'demo-builder-test', logger);

        expect(result.site.reachable).toBe(false);
        expect(result.smart404Snippet).toBeUndefined();
    });

    it('carries the transport error onto the leg instead of calling it not installed', async () => {
        // "delayed.js is missing its marker" points at a reset. "the request for
        // delayed.js failed" does not — the two must not read the same.
        mockFetchOrThrow({
            '/': { status: 200, body: '<html>home</html>' },
            '/scripts/delayed.js': new Error('socket hang up'),
        });

        const result = await probeStorefrontDelivery('skukla', 'demo-builder-test', logger);

        expect(result.smart404Snippet).toEqual({ installed: false, error: 'socket hang up' });
    });

    it('does not accept a marker served under a non-200 status', async () => {
        // aem.live serves the site's 404 page body for an unpublished path, and
        // that body can contain the marker. Only a published 200 counts.
        mockFetch({
            ...HEALTHY,
            '/404.html': { status: 404, body: `<html>${SMART_404_HEAD_MARKER_START}</html>` },
        });

        const result = await probeStorefrontDelivery('skukla', 'demo-builder-test', logger);

        expect(result.eagerRedirect).toEqual({ installed: false, status: 404 });
        expect(result.verdict).toMatch(/eager redirect/i);
    });

    it('names the eager redirect on its own when the smart 404 handler is present', async () => {
        mockFetch({ ...HEALTHY, '/404.html': { status: 404, body: '' } });

        const result = await probeStorefrontDelivery('skukla', 'demo-builder-test', logger);

        expect(result.smart404Snippet?.installed).toBe(true);
        expect(result.verdict).toMatch(/eager redirect missing/i);
    });

    it('gives every storefront request an abort signal', async () => {
        // TIMEOUTS.QUICK is the only thing bounding these GETs; without the signal
        // a hung storefront hangs the diagnostic with no way out.
        mockFetch(HEALTHY);

        await probeStorefrontDelivery('skukla', 'demo-builder-test', logger);

        for (const [, init] of (global.fetch as jest.Mock).mock.calls) {
            expect(init).toEqual(
                expect.objectContaining({ method: 'GET', signal: expect.any(AbortSignal) })
            );
        }
    });

    it('leaves the overlay leg off entirely when no overlay URL is registered', async () => {
        // Absent, not "unknown": a storefront with no overlay registered has
        // nothing to report, and {unknown: true} would read as a deployed action
        // that failed to answer.
        mockFetch(HEALTHY);

        const result = await probeStorefrontDelivery('skukla', 'demo-builder-test', logger);

        expect(result.overlay).toBeUndefined();
    });
});

/**
 * What the version endpoint is allowed to be believed about.
 *
 * The action is in another repo on its own release cadence, so this probe
 * reports and never compares. That makes the only real decisions here: which
 * responses count as an answer at all, and which fields of that answer are
 * usable as-is.
 */
describe('probeOverlayVersion — what counts as an answer', () => {
    const OVERLAY_URL = 'https://ns.adobeioruntime.net/api/v1/web/accs-discovery/render-pdp';

    const answering = (status: number, body: unknown) => {
        global.fetch = jest.fn(async () => ({ status, json: async () => body }) as Response);
    };

    it('ignores a version reported under a non-200 status', async () => {
        // A gateway or error envelope can carry its OWN version field. Reading it
        // would report the gateway's build as the action's.
        answering(502, { version: '2.1.0-gateway', sha: 'deadbee' });

        expect(await probeOverlayVersion(OVERLAY_URL)).toEqual({ unknown: true });
    });

    it('drops a sha that is not a string rather than reporting it', async () => {
        answering(200, { sha: 9207891, version: '1.0.0' });

        expect(await probeOverlayVersion(OVERLAY_URL)).toEqual({
            sha: undefined,
            version: '1.0.0',
            unknown: false,
        });
    });

    it('drops a version that is not a string rather than reporting it', async () => {
        answering(200, { sha: '9207b91', version: 42 });

        expect(await probeOverlayVersion(OVERLAY_URL)).toEqual({
            sha: '9207b91',
            version: undefined,
            unknown: false,
        });
    });

    it('accepts an answer carrying only one of the two fields', async () => {
        // Either field alone identifies the build well enough for a human to
        // compare against the other repo's log; requiring both would report every
        // action that reports only a sha as unknown.
        answering(200, { version: '1.4.2' });

        expect(await probeOverlayVersion(OVERLAY_URL)).toEqual({
            sha: undefined,
            version: '1.4.2',
            unknown: false,
        });
    });

    it('gives the version request an abort signal', async () => {
        answering(200, { sha: '9207b91' });

        await probeOverlayVersion(OVERLAY_URL);

        const [, init] = (global.fetch as jest.Mock).mock.calls[0];
        expect(init).toEqual(
            expect.objectContaining({ method: 'GET', signal: expect.any(AbortSignal) })
        );
    });
});
