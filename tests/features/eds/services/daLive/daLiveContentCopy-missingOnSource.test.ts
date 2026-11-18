/**
 * DaLiveContentCopy — a listed page the source does not have is skipped, not failed.
 *
 * Walk F287 (2026-11-18): an imported demo's storefront setup stopped with "Content
 * copy failed: 66 files failed". The sender's `/sitemap.json` was the template's,
 * carried over as content when the sender's demo was built, so it listed 60 French
 * pages and six others the sender's published site has never served. Each one
 * answered 404 and counted as a failed copy. A 404 on the source is the source
 * saying it has no such page: nothing can be copied and nothing was lost, so the
 * page is skipped. A page the source has that could not be read or written still
 * fails the copy.
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
    indexUrl: 'https://main--src-site--src-org.aem.live/sitemap.json',
};
const LIVE = 'https://main--src-site--src-org.aem.live';
const DEST = 'https://admin.da.live/source/dest-org/dest-site';

/** Everything after the seven arguments this suite does not vary. */
const NO_PATCHES = [undefined, undefined, undefined, undefined, undefined] as const;

describe('DaLiveContentCopy.copyContentFromSource — pages the source does not have', () => {
    let h: CopyHarness;

    beforeEach(() => {
        jest.clearAllMocks();
        h = createCopyHarness();
        // The source serves /about, /cart and its home page; /fr/ and /fr/cart are
        // listed by its index and answer 404; /broken answers 500.
        routeFetch([
            { when: (_u, i) => i?.method === 'HEAD', respond: mockResponse(404) },
            {
                when: (u) =>
                    [
                        `${LIVE}/about.plain.html`,
                        `${LIVE}/cart.plain.html`,
                        `${LIVE}/index.plain.html`,
                    ].includes(u),
                respond: mockResponse(200, '<p/>', 'text/html'),
            },
            { when: (u) => u === `${LIVE}/broken.plain.html`, respond: mockResponse(500) },
        ]);
    });

    const writtenUrls = (): string[] =>
        h.apiClient.fetchWithRetry.mock.calls.map((c) => c[0] as string);

    it('skips a listed page the source answers 404 for, and the copy succeeds', async () => {
        h.discoveryOps.getContentPathsFromDaLive.mockResolvedValue(['/about', '/fr/', '/fr/cart']);

        const result = await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

        expect(result.success).toBe(true);
        expect(result.failedFiles).toStrictEqual([]);
        expect(result.copiedFiles).toStrictEqual(['/about']);
        expect(writtenUrls()).toStrictEqual([`${DEST}/about.html`]);
    });

    it('does not count a skipped page among the files the copy handled', async () => {
        h.discoveryOps.getContentPathsFromDaLive.mockResolvedValue(['/about', '/fr/', '/fr/cart']);

        const result = await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

        expect(result.totalFiles).toBe(1);
    });

    it('still fails the copy for a page the source could not serve', async () => {
        h.discoveryOps.getContentPathsFromDaLive.mockResolvedValue(['/about', '/fr/', '/broken']);

        const result = await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

        expect(result.success).toBe(false);
        expect(result.failedFiles).toStrictEqual([{ path: '/broken', error: 'Copy failed' }]);
    });

    it('still fails the copy for a page the source has but DA.live refused', async () => {
        h.discoveryOps.getContentPathsFromDaLive.mockResolvedValue(['/about', '/fr/']);
        h.apiClient.fetchWithRetry.mockResolvedValue(mockResponse(500));

        const result = await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

        expect(result.success).toBe(false);
        expect(result.failedFiles).toStrictEqual([{ path: '/about', error: 'Copy failed' }]);
    });

    it('does not count a listed code path the source turned out not to have as on the source', async () => {
        h.discoveryOps.getContentPathsFromDaLive.mockResolvedValue(['/cart', '/fr/cart']);

        const result = await h.copy.copyContentFromSource(
            SOURCE,
            'dest-org',
            'dest-site',
            ...NO_PATCHES,
            ['/cart', '/fr/cart']
        );

        expect(result.codePathsOnSource).toStrictEqual(['/cart']);
    });
});
