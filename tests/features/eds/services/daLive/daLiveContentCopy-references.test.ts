/**
 * DaLiveContentCopy — reference-following discovery, the account-chrome
 * overlay, and content patching.
 *
 * These three share one mechanism: a page's HTML is read for internal
 * references while it is being copied, and whatever it names is pulled from
 * canonical afterwards. The patch pass sits in the same place, so the html the
 * patcher returns is the html that gets uploaded AND the html that gets read
 * for references.
 */

import {
    applyContentPatches,
    createCopyHarness,
    mockResponse,
    routeFetch,
    uploadedTextOf,
    TEST_TOKEN,
    type CopyHarness,
} from './daLiveContentCopy.testUtils';
import { createPatchReport } from '@/features/eds/services/patches/patchReportHelper';
import type { ContentPatchSource } from '@/types/demoPackages';
import type { DaLiveContentSource } from '@/features/eds/services/types';

const SOURCE: DaLiveContentSource = {
    org: 'src-org',
    site: 'src-site',
    indexUrl: 'https://main--src-site--src-org.aem.live/full-index.json',
};
const LIVE = 'https://main--src-site--src-org.aem.live';
const ACCOUNT = { org: 'b2b-org', site: 'b2b-site' };
const ACCOUNT_LIVE = 'https://main--b2b-site--b2b-org.aem.live';

/** A page whose HTML links to `refs`. */
const pageLinking = (...refs: string[]): Response =>
    mockResponse(200, refs.map((r) => `<a href="${r}">x</a>`).join(''), 'text/html');

describe('DaLiveContentCopy — reference-following discovery', () => {
    let h: CopyHarness;

    beforeEach(() => {
        jest.clearAllMocks();
        h = createCopyHarness();
        (applyContentPatches as jest.Mock).mockResolvedValue({ html: '<p/>', results: [] });
    });

    /** Every page 404s except the ones named, which link onward. */
    function routePages(pages: Record<string, string[]>): void {
        routeFetch([
            { when: (_u, i) => i?.method === 'HEAD', respond: mockResponse(404) },
            {
                when: (u) => u.startsWith(LIVE) && u.endsWith('.plain.html'),
                respond: (u) => {
                    const path = u.slice(LIVE.length, -'.plain.html'.length);
                    return pages[path] ? pageLinking(...pages[path]) : mockResponse(404);
                },
            },
        ]);
    }

    it('copies a referenced document that the index never listed', async () => {
        h.discoveryOps.getContentPathsFromDaLive.mockResolvedValue(['/account']);
        routePages({ '/account': ['/customer/nav'], '/customer/nav': [] });

        const result = await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

        expect(result.copiedFiles).toEqual(['/account', '/customer/nav']);
        expect(h.apiClient.fetchWithRetry.mock.calls.map((c) => c[0])).toContain(
            'https://admin.da.live/source/dest-org/dest-site/customer/nav.html'
        );
    });

    it('counts each discovered copy into totalFiles', async () => {
        h.discoveryOps.getContentPathsFromDaLive.mockResolvedValue(['/account']);
        routePages({ '/account': ['/customer/nav'], '/customer/nav': [] });

        const result = await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

        expect(result.totalFiles).toBe(2);
    });

    it('never re-copies a path the enumeration already covered', async () => {
        h.discoveryOps.getContentPathsFromDaLive.mockResolvedValue(['/account', '/about']);
        routePages({ '/account': ['/about'], '/about': [] });

        const result = await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

        expect(result.copiedFiles).toEqual(['/account', '/about']);
        expect(h.apiClient.fetchWithRetry).toHaveBeenCalledTimes(2);
    });

    it('follows a reference chain transitively', async () => {
        h.discoveryOps.getContentPathsFromDaLive.mockResolvedValue(['/a']);
        routePages({ '/a': ['/b'], '/b': ['/c'], '/c': [] });

        const result = await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

        expect(result.copiedFiles).toEqual(['/a', '/b', '/c']);
    });

    it('stops after three levels of discovery', async () => {
        h.discoveryOps.getContentPathsFromDaLive.mockResolvedValue(['/a']);
        routePages({ '/a': ['/b'], '/b': ['/c'], '/c': ['/d'], '/d': ['/e'], '/e': [] });

        const result = await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

        expect(result.copiedFiles).toEqual(['/a', '/b', '/c', '/d']);
    });

    it('skips a discovered reference that 404s on source without failing the copy', async () => {
        h.discoveryOps.getContentPathsFromDaLive.mockResolvedValue(['/account']);
        routePages({ '/account': ['/customer/nav'] });

        const result = await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

        expect(result).toEqual({
            success: true,
            copiedFiles: ['/account'],
            failedFiles: [],
            totalFiles: 1,
        });
    });

    it('takes a fresh token per discovery batch of five', async () => {
        const refs = Array.from({ length: 6 }, (_, i) => `/ref${i}`);
        h.discoveryOps.getContentPathsFromDaLive.mockResolvedValue(['/account']);
        routePages({
            '/account': refs,
            ...Object.fromEntries(refs.map((r) => [r, []])),
        });

        await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

        // One token for the single content batch, two for the discovery batches.
        expect(h.apiClient.getImsToken).toHaveBeenCalledTimes(3);
    });

    it('opens no empty discovery batch when exactly five references are found', async () => {
        const refs = Array.from({ length: 5 }, (_, i) => `/ref${i}`);
        h.discoveryOps.getContentPathsFromDaLive.mockResolvedValue(['/account']);
        routePages({ '/account': refs, ...Object.fromEntries(refs.map((r) => [r, []])) });

        const result = await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

        expect(h.apiClient.getImsToken).toHaveBeenCalledTimes(2);
        expect(result.copiedFiles).toHaveLength(6);
    });

    it('copies each discovered reference exactly once across batches', async () => {
        const refs = Array.from({ length: 6 }, (_, i) => `/ref${i}`);
        h.discoveryOps.getContentPathsFromDaLive.mockResolvedValue(['/account']);
        routePages({ '/account': refs, ...Object.fromEntries(refs.map((r) => [r, []])) });

        const result = await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

        expect(result.copiedFiles).toEqual(['/account', ...refs]);
    });

    it('does no discovery work when nothing was referenced', async () => {
        h.discoveryOps.getContentPathsFromDaLive.mockResolvedValue(['/about']);
        routePages({ '/about': [] });

        await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

        expect(h.apiClient.getImsToken).toHaveBeenCalledTimes(1);
    });
});

describe('DaLiveContentCopy.overlayAccountChrome', () => {
    let h: CopyHarness;

    beforeEach(() => {
        jest.clearAllMocks();
        h = createCopyHarness();
        (applyContentPatches as jest.Mock).mockResolvedValue({ html: '<p/>', results: [] });
    });

    /** Only `present` auth pages exist on the account source; each links onward. */
    function routeAccountSource(
        pages: Record<string, string[]>
    ): Array<{ url: string; init?: RequestInit }> {
        return routeFetch([
            {
                when: (u, i) => i?.method === 'HEAD' && u.startsWith(ACCOUNT_LIVE),
                respond: (u) => {
                    const path = u.slice(ACCOUNT_LIVE.length, -'.plain.html'.length);
                    return pages[path] ? mockResponse(200) : mockResponse(404);
                },
            },
            { when: (_u, i) => i?.method === 'HEAD', respond: mockResponse(404) },
            {
                when: (u) => u.endsWith('.plain.html'),
                respond: (u) => {
                    const path = u.slice(ACCOUNT_LIVE.length, -'.plain.html'.length);
                    return pages[path] ? pageLinking(...pages[path]) : mockResponse(404);
                },
            },
        ]);
    }

    it('probes every auth page on the ACCOUNT source, not the destination', async () => {
        const calls = routeAccountSource({});

        await h.copy.overlayAccountChrome(ACCOUNT, 'dest-org', 'dest-site');

        expect(calls.map((c) => c.url)).toEqual([
            `${ACCOUNT_LIVE}/customer/login.plain.html`,
            `${ACCOUNT_LIVE}/customer/account.plain.html`,
            `${ACCOUNT_LIVE}/customer/create-account.plain.html`,
        ]);
    });

    it('probes the auth pages with HEAD, never a full GET', async () => {
        const calls = routeAccountSource({});

        await h.copy.overlayAccountChrome(ACCOUNT, 'dest-org', 'dest-site');

        expect(calls.map((c) => c.init?.method)).toEqual(['HEAD', 'HEAD', 'HEAD']);
    });

    it('reports an empty success and writes nothing when the source has no auth pages', async () => {
        routeAccountSource({});

        const result = await h.copy.overlayAccountChrome(ACCOUNT, 'dest-org', 'dest-site');

        expect(result).toEqual({
            success: true,
            copiedFiles: [],
            failedFiles: [],
            totalFiles: 0,
        });
        expect(h.apiClient.getImsToken).not.toHaveBeenCalled();
        expect(h.apiClient.fetchWithRetry).not.toHaveBeenCalled();
    });

    it('treats an unreachable probe as an absent page', async () => {
        routeFetch([
            {
                when: (_u, i) => i?.method === 'HEAD',
                respond: () => {
                    throw new Error('DNS failure');
                },
            },
        ]);

        const result = await h.copy.overlayAccountChrome(ACCOUNT, 'dest-org', 'dest-site');

        expect(result.totalFiles).toBe(0);
    });

    it('copies only the auth pages that exist, onto the destination site', async () => {
        routeAccountSource({ '/customer/account': [] });

        const result = await h.copy.overlayAccountChrome(ACCOUNT, 'dest-org', 'dest-site');

        expect(result.success).toBe(true);
        expect(result.copiedFiles).toEqual(['/customer/account']);
        expect(h.apiClient.fetchWithRetry).toHaveBeenCalledWith(
            'https://admin.da.live/source/dest-org/dest-site/customer/account.html',
            expect.any(Function),
            { rateLimit: 'return' }
        );
    });

    it('follows the references the account pages embed', async () => {
        routeAccountSource({ '/customer/account': ['/customer/nav'], '/customer/nav': [] });

        const result = await h.copy.overlayAccountChrome(ACCOUNT, 'dest-org', 'dest-site');

        expect(result.copiedFiles).toEqual(['/customer/account', '/customer/nav']);
        expect(result.totalFiles).toBe(2);
    });

    it('records an auth page whose write fails, and reports the overlay unsuccessful', async () => {
        routeAccountSource({ '/customer/account': [] });
        h.apiClient.fetchWithRetry.mockResolvedValue(mockResponse(500));

        const result = await h.copy.overlayAccountChrome(ACCOUNT, 'dest-org', 'dest-site');

        expect(result).toEqual({
            success: false,
            copiedFiles: [],
            failedFiles: [{ path: '/customer/account', error: 'Copy failed' }],
            totalFiles: 1,
        });
    });

    it('routes the overlay copies through the patch report it was given', async () => {
        routeAccountSource({ '/customer/account': [] });
        const report = createPatchReport();

        await h.copy.overlayAccountChrome(ACCOUNT, 'dest-org', 'dest-site', report);

        // No content patches are applied on the overlay pass — the report is
        // carried so a later reference audit can share it, not filled here.
        expect(report.results).toEqual([]);
        expect(applyContentPatches).not.toHaveBeenCalled();
    });

    it('uses one token for the whole overlay pass', async () => {
        routeAccountSource({ '/customer/account': [], '/customer/login': [] });

        await h.copy.overlayAccountChrome(ACCOUNT, 'dest-org', 'dest-site');

        expect(h.apiClient.getImsToken).toHaveBeenCalledTimes(1);
    });
});

describe('DaLiveContentCopy — content patches', () => {
    let h: CopyHarness;

    beforeEach(() => {
        jest.clearAllMocks();
        h = createCopyHarness();
        routeFetch([
            { when: (_u, i) => i?.method === 'HEAD', respond: mockResponse(404) },
            {
                when: (u) => u.endsWith('.plain.html'),
                respond: mockResponse(200, '<p>original</p>', 'text/html'),
            },
        ]);
        (applyContentPatches as jest.Mock).mockResolvedValue({
            html: '<p>patched</p>',
            results: [],
        });
    });

    const SRC = { org: 'src-org', site: 'src-site' };
    const DEST = { org: 'dest-org', site: 'dest-site' };

    it('is skipped when no patch ids are supplied', async () => {
        await h.copy.copySingleFile(TEST_TOKEN, SRC, '/about', DEST, '/about');

        expect(applyContentPatches).not.toHaveBeenCalled();
        await expect(uploadedTextOf(h.apiClient.fetchWithRetry)).resolves.toContain(
            '<p>original</p>'
        );
    });

    it('is skipped for an empty patch id list', async () => {
        await h.copy.copySingleFile(TEST_TOKEN, SRC, '/about', DEST, '/about', []);

        expect(applyContentPatches).not.toHaveBeenCalled();
    });

    it('hands the patcher the source html, the page path, the ids and the source', async () => {
        const patchSource: ContentPatchSource = {
            owner: 'skukla',
            repo: 'eds-demo-patches',
            path: 'citisignal',
        };

        await h.copy.copySingleFile(
            TEST_TOKEN,
            SRC,
            '/about',
            DEST,
            '/about',
            ['hide-price'],
            patchSource
        );

        expect(applyContentPatches).toHaveBeenCalledWith(
            '<p>original</p>',
            '/about',
            ['hide-price'],
            h.logger,
            patchSource
        );
    });

    it('uploads the PATCHED html, not the source html', async () => {
        await h.copy.copySingleFile(TEST_TOKEN, SRC, '/about', DEST, '/about', ['hide-price']);

        const uploaded = await uploadedTextOf(h.apiClient.fetchWithRetry);
        expect(uploaded).toContain('<p>patched</p>');
        expect(uploaded).not.toContain('original');
    });

    it('records every patch result in the report, applied or not', async () => {
        (applyContentPatches as jest.Mock).mockResolvedValue({
            html: '<p>patched</p>',
            results: [
                { patchId: 'a', pagePath: '/about', applied: true },
                { patchId: 'b', pagePath: '/about', applied: false, reason: 'no match' },
            ],
        });
        const report = createPatchReport();

        await h.copy.copySingleFile(
            TEST_TOKEN,
            SRC,
            '/about',
            DEST,
            '/about',
            ['a', 'b'],
            undefined,
            report
        );

        expect(report.results).toEqual([
            { kind: 'content', patchId: 'a', target: '/about', applied: true, reason: undefined },
            {
                kind: 'content',
                patchId: 'b',
                target: '/about',
                applied: false,
                reason: 'no match',
            },
        ]);
    });

    it('copies successfully with unapplied patches and no report', async () => {
        (applyContentPatches as jest.Mock).mockResolvedValue({
            html: '<p>patched</p>',
            results: [{ patchId: 'b', pagePath: '/about', applied: false, reason: 'no match' }],
        });

        const ok = await h.copy.copySingleFile(TEST_TOKEN, SRC, '/about', DEST, '/about', ['b']);

        expect(ok).toBe(true);
    });

    it('reads references out of the SOURCE html, before any patch runs', async () => {
        routeFetch([
            { when: (_u, i) => i?.method === 'HEAD', respond: mockResponse(404) },
            {
                when: (u) => u.endsWith('.plain.html'),
                respond: mockResponse(200, '<a href="/in-source">x</a>', 'text/html'),
            },
        ]);
        (applyContentPatches as jest.Mock).mockResolvedValue({
            html: '<a href="/added-by-patch">x</a>',
            results: [],
        });
        const discovered = new Set<string>();

        await h.copy.copySingleFile(
            TEST_TOKEN,
            SRC,
            '/about',
            DEST,
            '/about',
            ['a'],
            undefined,
            undefined,
            discovered
        );

        // A link a patch ADDS is not discovered; discovery reads what the source had.
        expect([...discovered]).toEqual(['/in-source']);
    });

    it('collects nothing when the caller asks for no discovery', async () => {
        await h.copy.copySingleFile(TEST_TOKEN, SRC, '/about', DEST, '/about');

        expect(applyContentPatches).not.toHaveBeenCalled();
    });
});
