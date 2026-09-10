/**
 * The storefront delivery section — what the site is SERVING right now.
 *
 * Every other EDS signal in the report describes the extension's own last run.
 * This one describes the CDN, which is why the labels are load-bearing: calling
 * the overlay's source template a "PDP … (prerendered)" is what let a storefront
 * that could not serve a product page read clean for weeks.
 *
 * Each leg is asserted as an exact line, and each variant of each leg has its
 * own case, because the bug class here is a leg that renders the wrong WORD for
 * a request that was always fine.
 */

import { buildSummaryLines, makeTypedReport, section } from './diagnosticsReport.testUtils';
import type { StorefrontScopeReport } from '@/commands/diagnosticsReport';
import type { StorefrontProbeResult } from '@/features/eds/services/storefront/storefrontProbe';

const TITLE = 'Storefront delivery (what is serving now):';
const URL = 'https://main--demo--skukla.aem.live';
const VERDICT = 'Storefront delivery looks correct.';

const linesFor = (storefront: StorefrontProbeResult, storefrontScope?: StorefrontScopeReport): string[] =>
    section(buildSummaryLines(makeTypedReport({ storefront, storefrontScope })), TITLE);

/** Everything working: site up, both fallbacks installed, a real PDP served. */
const healthy: StorefrontProbeResult = {
    baseUrl: URL,
    site: { reachable: true, status: 200 },
    smart404Snippet: { installed: true, status: 200 },
    eagerRedirect: { installed: true, status: 200 },
    pdp: { path: '/products/blue-shoe', sku: 'SHOE-1', status: 200, served: true },
    authoredTemplate: { path: '/products/default', status: 200, published: true },
    overlay: { sha: 'a1b2c3d', version: '1.4.0', unknown: false },
    verdict: VERDICT,
};

describe('a storefront that is serving', () => {
    it('prints every leg, the SKU it asked for, and the deployed overlay build', () => {
        expect(linesFor(healthy)).toStrictEqual([
            TITLE,
            `  URL: ${URL}`,
            '  Site: reachable',
            '  Smart 404 handler (delayed.js): installed (HTTP 200)',
            '  Eager redirect (404.html): installed (HTTP 200)',
            // The SKU is printed so the reader can repeat the request by hand.
            '  PDP /products/blue-shoe (SKU SHOE-1): HTTP 200 (served)',
            '  Overlay source template /products/default: HTTP 200 (published)',
            '  Overlay action build: a1b2c3d (v1.4.0)',
            `  → ${VERDICT}`,
        ]);
    });

    it('names each broken leg for what it is, not as one flat failure', () => {
        expect(
            linesFor({
                baseUrl: URL,
                site: { reachable: true, status: 200 },
                eagerRedirect: { installed: false, status: 404 },
                pdp: { path: '/products/blue-shoe', sku: 'SHOE-1', status: 404, served: false },
                authoredTemplate: { path: '/products/default', status: 404, published: false },
                overlay: { unknown: true },
                verdict: VERDICT,
            }),
        ).toStrictEqual([
            TITLE,
            `  URL: ${URL}`,
            '  Site: reachable',
            // A leg that was never probed is not a leg that failed.
            '  Smart 404 handler (delayed.js): not checked',
            '  Eager redirect (404.html): MISSING (HTTP 404)',
            '  PDP /products/blue-shoe (SKU SHOE-1): HTTP 404 (NOT SERVED)',
            '  Overlay source template /products/default: HTTP 404 (NOT PUBLISHED)',
            '  Overlay action build: unknown (deployed action predates /__version)',
            `  → ${VERDICT}`,
        ]);
    });

    it('reports an unreachable leg as unreachable, carrying the reason', () => {
        expect(
            linesFor({ ...healthy, smart404Snippet: { installed: false, error: 'timed out' } })[3],
        ).toBe('  Smart 404 handler (delayed.js): unreachable (timed out)');
    });

    // No SKU means the chain was never exercised. Saying so is the point: a
    // silent omission reads as though the PDP leg passed.
    it('says the PDP was not checked when no SKU could be sampled', () => {
        const probe = { ...healthy };
        delete probe.pdp;
        delete probe.authoredTemplate;
        delete probe.overlay;

        expect(linesFor(probe)).toStrictEqual([
            TITLE,
            `  URL: ${URL}`,
            '  Site: reachable',
            '  Smart 404 handler (delayed.js): installed (HTTP 200)',
            '  Eager redirect (404.html): installed (HTTP 200)',
            '  PDP: not checked (no catalog SKU available)',
            `  → ${VERDICT}`,
        ]);
    });

    // The action answered but told us nothing. Reported, never judged — the
    // extension has no expectation to compare a sha against.
    it('prints question marks rather than dropping the overlay build line', () => {
        expect(linesFor({ ...healthy, overlay: { unknown: false } })[7]).toBe(
            '  Overlay action build: ? (v?)',
        );
    });
});

describe('a storefront that is not answering', () => {
    it('stops after the site line and carries the status', () => {
        expect(
            linesFor({
                baseUrl: URL,
                site: { reachable: false, status: 503 },
                verdict: 'The site is not answering.',
            }),
        ).toStrictEqual([
            TITLE,
            `  URL: ${URL}`,
            '  Site: unreachable (HTTP 503)',
            '  → The site is not answering.',
        ]);
    });

    it('omits the status when the request never got one', () => {
        expect(
            linesFor({ baseUrl: URL, site: { reachable: false }, verdict: 'No answer.' })[2],
        ).toBe('  Site: unreachable');
    });
});

/**
 * The store scope the PDP sample came from.
 *
 * Silent when served and project agree — that is the normal case. A disagreement
 * after a Configure save is expected too, so only `unexpected` is called out.
 */
describe('the scope line', () => {
    // The scope lines sit between the PDP leg and the overlay template line —
    // the only place they are ever rendered, since scope describes the SAMPLE.
    const scopeLine = (storefrontScope: StorefrontScopeReport): string[] => {
        const lines = linesFor(healthy, storefrontScope);
        const pdp = lines.findIndex((l) => l.startsWith('  PDP '));
        const overlay = lines.findIndex((l) => l.startsWith('  Overlay source template'));
        return lines.slice(pdp + 1, overlay);
    };

    const divergence = {
        served: { websiteCode: 'base', storeCode: 'main', storeViewCode: 'default' },
        manifest: { websiteCode: 'base', storeCode: 'main', storeViewCode: 'french' },
    };

    it('says nothing when the served scope is what the project configured', () => {
        expect(scopeLine({ source: 'served' })).toStrictEqual([]);
    });

    it('reads a pending republish as context, not as a fault', () => {
        expect(scopeLine({ source: 'served', divergence: { ...divergence, unexpected: false } })).toStrictEqual([
            '  Scope: serving base / main / default, project configured for base / main / french',
            '    (expected: republish pending)',
        ]);
    });

    // The project claims published and the CDN serves something else: a
    // republish did not take, and nothing else in the report can see that.
    it('calls out a divergence the project cannot explain', () => {
        expect(scopeLine({ source: 'served', divergence: { ...divergence, unexpected: true } })).toStrictEqual([
            '  Scope: serving base / main / default, project configured for base / main / french',
            '    ⚠ Project reads "published" — a republish did not take',
        ]);
    });

    it('says where the scope came from when the served config was unreadable', () => {
        expect(scopeLine({ source: 'manifest' })).toStrictEqual([
            '  Scope: sampled from the project (served config.json unreadable)',
        ]);
    });
});
