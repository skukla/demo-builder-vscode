/**
 * DaLiveContentCopy — `copyContentFromSource` carries what the storefront's code loads.
 *
 * The cart, checkout and search pages are in no content index and no page links to
 * them; a copy of a colleague's demo arrived without them (EDS-40). The copy is
 * handed the paths read out of the storefront's own code, asks the source for each,
 * copies what answers, and reports which ones the source has so the pipeline can
 * look for them on the finished storefront.
 */

import {
    createCopyHarness,
    mockResponse,
    routeFetch,
    type CopyHarness,
} from './daLiveContentCopy.testUtils';
import type { DaLiveContentSource } from '@/features/eds/services/types';

const SOURCE: DaLiveContentSource = {
    org: 'src-org',
    site: 'src-site',
    indexUrl: 'https://main--src-site--src-org.aem.live/full-index.json',
};
const LIVE = 'https://main--src-site--src-org.aem.live';
const DEST = 'https://admin.da.live/source/dest-org/dest-site';

/** Everything after the seven arguments this suite does not vary. */
const NO_PATCHES = [undefined, undefined, undefined, undefined, undefined] as const;

describe('DaLiveContentCopy.copyContentFromSource — the storefront’s code paths', () => {
    let h: CopyHarness;
    let calls: Array<{ url: string; init?: RequestInit }>;

    beforeEach(() => {
        jest.clearAllMocks();
        h = createCopyHarness();
        // The source has /cart and nothing else the code names; no path is a sheet.
        calls = routeFetch([
            {
                when: (u, i) => i?.method === 'HEAD' && u === `${LIVE}/cart.plain.html`,
                respond: mockResponse(200),
            },
            { when: (_u, i) => i?.method === 'HEAD', respond: mockResponse(404) },
            { when: (u) => u.endsWith('.plain.html'), respond: mockResponse(200, '<p/>', 'text/html') },
        ]);
    });

    const writtenUrls = (): string[] => h.apiClient.fetchWithRetry.mock.calls.map((c) => c[0] as string);
    const headed = (): string[] => calls.filter((c) => c.init?.method === 'HEAD').map((c) => c.url);

    it('copies a page the code loads and the source has, on the published-only route', async () => {
        h.discoveryOps.getContentPathsFromIndex.mockResolvedValue(['/about']);

        const result = await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site', ...NO_PATCHES, [
            '/cart',
            '/graphql',
        ]);

        expect(headed()).toEqual(expect.arrayContaining([`${LIVE}/cart.plain.html`, `${LIVE}/graphql.plain.html`]));
        expect(writtenUrls()).toContain(`${DEST}/cart.html`);
        expect(writtenUrls()).not.toContain(`${DEST}/graphql.html`);
        expect(result.codePathsOnSource).toEqual(['/cart']);
    });

    it('does the same when the source’s DA.live org can be listed', async () => {
        h.discoveryOps.getContentPathsFromDaLive.mockResolvedValue(['/about']);

        const result = await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site', ...NO_PATCHES, [
            '/about',
            '/cart',
        ]);

        // /about is listed already: counted as on the source, and not asked for.
        expect(headed()).not.toContain(`${LIVE}/about.plain.html`);
        expect(writtenUrls()).toContain(`${DEST}/cart.html`);
        expect(result.codePathsOnSource).toEqual(['/about', '/cart']);
    });

    it('reports no code paths, and asks for none, when the code was not read', async () => {
        h.discoveryOps.getContentPathsFromIndex.mockResolvedValue(['/about']);

        const result = await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

        expect(headed()).not.toContain(`${LIVE}/cart.plain.html`);
        expect(result.codePathsOnSource).toStrictEqual([]);
    });
});
