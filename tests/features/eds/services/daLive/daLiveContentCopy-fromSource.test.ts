/**
 * DaLiveContentCopy — `copyContentFromSource`, the whole-site pipeline.
 *
 * Covers the four decisions it owns before and after the copy loop:
 * enumeration (DA.live list API with a CDN-index fallback, plus the two
 * filters), the CDN-only backfill of unindexed essentials, batching and
 * progress, and the tail — the completeness audit and the auth-page stubs.
 */

import {
    createCopyHarness,
    mockResponse,
    requestInitOf,
    routeFetch,
    uploadedTextOf,
    TEST_TOKEN,
    type CopyHarness,
} from './daLiveContentCopy.testUtils';
import { createPatchReport } from '@/features/eds/services/patches/patchReportHelper';
import type { DaLiveContentSource } from '@/features/eds/services/types';

const SOURCE: DaLiveContentSource = {
    org: 'src-org',
    site: 'src-site',
    indexUrl: 'https://main--src-site--src-org.aem.live/full-index.json',
};
const LIVE = 'https://main--src-site--src-org.aem.live';

/** The three auth pages the CDN-index fallback stubs when source has none. */
const AUTH_STUBS = ['/customer/login', '/customer/account', '/customer/create-account'];

describe('DaLiveContentCopy.copyContentFromSource', () => {
    let h: CopyHarness;

    beforeEach(() => {
        jest.clearAllMocks();
        h = createCopyHarness();
        // Default CDN routing: nothing is a spreadsheet, every backfill probe
        // 404s, and every source page is HTML.
        routeFetch([
            { when: (_u, i) => i?.method === 'HEAD', respond: mockResponse(404) },
            {
                when: (u) => u.endsWith('.plain.html'),
                respond: mockResponse(200, '<p/>', 'text/html'),
            },
        ]);
    });

    /** The destination URLs written, in call order. */
    function writtenUrls(): string[] {
        return h.apiClient.fetchWithRetry.mock.calls.map((c) => c[0] as string);
    }

    describe('enumeration', () => {
        it('asks the DA.live list API first, by org and site', async () => {
            h.discoveryOps.getContentPathsFromDaLive.mockResolvedValue(['/about']);

            await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

            expect(h.discoveryOps.getContentPathsFromDaLive).toHaveBeenCalledWith(
                'src-org',
                'src-site'
            );
            expect(h.discoveryOps.getContentPathsFromIndex).not.toHaveBeenCalled();
        });

        it('falls back to the content index when the list API returns nothing', async () => {
            h.discoveryOps.getContentPathsFromDaLive.mockResolvedValue([]);
            h.discoveryOps.getContentPathsFromIndex.mockResolvedValue(['/about']);

            const result = await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

            expect(h.discoveryOps.getContentPathsFromIndex).toHaveBeenCalledWith(SOURCE);
            expect(result.copiedFiles).toContain('/about');
        });

        it('falls back to the content index when the list API throws', async () => {
            h.discoveryOps.getContentPathsFromDaLive.mockRejectedValue(new Error('403'));
            h.discoveryOps.getContentPathsFromIndex.mockResolvedValue(['/about']);

            const result = await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

            expect(h.discoveryOps.getContentPathsFromIndex).toHaveBeenCalledWith(SOURCE);
            // The fallback path also stubs the three auth pages absent from source.
            expect(result.copiedFiles).toEqual(['/about', ...AUTH_STUBS]);
        });

        it('drops product overlays but keeps the default template', async () => {
            h.discoveryOps.getContentPathsFromDaLive.mockResolvedValue([
                '/products/sku-1',
                '/products/default',
            ]);

            const result = await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

            expect(result.copiedFiles).toEqual(['/products/default']);
        });

        it.each(['/.da/library/blocks', '/.da/library/blocks.json'])(
            'excludes the library index %s (it is regenerated with the right paths)',
            async (indexPath) => {
                h.discoveryOps.getContentPathsFromDaLive.mockResolvedValue([
                    indexPath,
                    '/.da/library/blocks/hero',
                ]);

                const result = await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

                expect(result.copiedFiles).toEqual(['/.da/library/blocks/hero']);
            }
        );

        it('reports success with nothing copied when the source has no content', async () => {
            h.discoveryOps.getContentPathsFromDaLive.mockResolvedValue([]);
            h.discoveryOps.getContentPathsFromIndex.mockResolvedValue([]);

            const result = await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

            expect(result).toEqual({
                success: true,
                copiedFiles: [...AUTH_STUBS],
                failedFiles: [],
                totalFiles: 3,
            });
        });
    });

    describe('backfill of unindexed essentials', () => {
        beforeEach(() => {
            // Force the CDN-index fallback path, which is the only one that backfills.
            h.discoveryOps.getContentPathsFromDaLive.mockResolvedValue([]);
            h.discoveryOps.getContentPathsFromIndex.mockResolvedValue([]);
        });

        it('is skipped entirely when the DA.live list API answered', async () => {
            h.discoveryOps.getContentPathsFromDaLive.mockResolvedValue(['/about']);
            const calls = routeFetch([
                { when: (u) => u.endsWith('.plain.html'), respond: mockResponse(200, '<p/>') },
            ]);

            await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

            // No backfill probe: the only HEAD is copySingleFile's spreadsheet check.
            expect(calls.map((c) => c.url)).not.toContain(`${LIVE}/nav`);
            expect(calls.map((c) => c.url)).not.toContain(`${LIVE}/customer/login.plain.html`);
        });

        it('probes each spreadsheet as .json and adds the ones that exist', async () => {
            routeFetch([
                {
                    when: (u, i) => i?.method === 'HEAD' && u === `${LIVE}/placeholders.json`,
                    respond: mockResponse(200),
                },
                { when: (_u, i) => i?.method === 'HEAD', respond: mockResponse(404) },
                { when: (u) => u.includes('placeholders'), respond: mockResponse(200, '<p/>') },
            ]);

            const result = await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

            expect(result.copiedFiles).toEqual(['/placeholders', ...AUTH_STUBS]);
        });

        it('probes a plain fragment at its bare URL', async () => {
            const calls = routeFetch([
                { when: (_u, i) => i?.method === 'HEAD', respond: mockResponse(404) },
            ]);

            await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

            expect(calls.map((c) => c.url)).toContain(`${LIVE}/nav`);
        });

        it('probes a /customer/ fragment at .plain.html (the bare URL gates to login)', async () => {
            const calls = routeFetch([
                { when: (_u, i) => i?.method === 'HEAD', respond: mockResponse(404) },
            ]);

            await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

            expect(calls.map((c) => c.url)).toContain(
                `${LIVE}/customer/sidebar-fragment.plain.html`
            );
            expect(calls.map((c) => c.url)).not.toContain(`${LIVE}/customer/sidebar-fragment`);
        });

        it('probes each auth page at .plain.html', async () => {
            const calls = routeFetch([
                { when: (_u, i) => i?.method === 'HEAD', respond: mockResponse(404) },
            ]);

            await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

            expect(calls.map((c) => c.url)).toContain(`${LIVE}/customer/login.plain.html`);
        });

        it('does not re-probe a path the index already listed', async () => {
            h.discoveryOps.getContentPathsFromIndex.mockResolvedValue(['/nav']);
            const calls = routeFetch([
                { when: (_u, i) => i?.method === 'HEAD', respond: mockResponse(404) },
                { when: (u) => u.endsWith('.plain.html'), respond: mockResponse(200, '<p/>') },
            ]);

            const result = await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

            expect(calls.filter((c) => c.url === `${LIVE}/nav`)).toHaveLength(0);
            expect(result.copiedFiles).toContain('/nav');
        });

        it('treats an unreachable probe as absent rather than failing the copy', async () => {
            routeFetch([
                {
                    when: (_u, i) => i?.method === 'HEAD',
                    respond: () => {
                        throw new Error('DNS failure');
                    },
                },
            ]);

            const result = await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

            expect(result.success).toBe(true);
        });

        it('prepends found backfill paths ahead of the enumerated ones', async () => {
            h.discoveryOps.getContentPathsFromIndex.mockResolvedValue(['/about']);
            routeFetch([
                {
                    when: (u, i) => i?.method === 'HEAD' && u === `${LIVE}/nav`,
                    respond: mockResponse(200),
                },
                { when: (_u, i) => i?.method === 'HEAD', respond: mockResponse(404) },
                { when: (u) => u.endsWith('.plain.html'), respond: mockResponse(200, '<p/>') },
            ]);

            const result = await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

            expect(result.copiedFiles).toEqual(['/nav', '/about', ...AUTH_STUBS]);
        });
    });

    describe('auth-page stubs', () => {
        beforeEach(() => {
            h.discoveryOps.getContentPathsFromDaLive.mockResolvedValue([]);
            h.discoveryOps.getContentPathsFromIndex.mockResolvedValue([]);
        });

        it('writes a stub carrying the dropin block class for each missing auth page', async () => {
            await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

            expect(writtenUrls()).toEqual([
                'https://admin.da.live/source/dest-org/dest-site/customer/login.html',
                'https://admin.da.live/source/dest-org/dest-site/customer/account.html',
                'https://admin.da.live/source/dest-org/dest-site/customer/create-account.html',
            ]);
            await expect(uploadedTextOf(h.apiClient.fetchWithRetry)).resolves.toBe(
                '<body><header></header><main><div>' +
                    '<div class="commerce-login"><div><div></div></div></div>' +
                    '</div></main><footer></footer></body>'
            );
        });

        it('writes each stub as a text/html blob through the rate-limit-tolerant client', async () => {
            await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

            expect(h.apiClient.fetchWithRetry).toHaveBeenCalledWith(
                'https://admin.da.live/source/dest-org/dest-site/customer/login.html',
                expect.any(Function),
                { rateLimit: 'return' }
            );
            const init = requestInitOf(h.apiClient.fetchWithRetry);
            expect(((init.body as FormData).get('data') as Blob).type).toBe('text/html');
        });

        it('counts each created stub into totalFiles and copiedFiles', async () => {
            const result = await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

            expect(result.copiedFiles).toEqual([
                '/customer/login',
                '/customer/account',
                '/customer/create-account',
            ]);
            expect(result.totalFiles).toBe(3);
        });

        it('creates no stub for an auth page that exists on source', async () => {
            routeFetch([
                {
                    when: (u, i) =>
                        i?.method === 'HEAD' && u === `${LIVE}/customer/login.plain.html`,
                    respond: mockResponse(200),
                },
                { when: (_u, i) => i?.method === 'HEAD', respond: mockResponse(404) },
                { when: (u) => u.endsWith('.plain.html'), respond: mockResponse(200, '<p/>') },
            ]);

            const result = await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

            // Copied from source, then only the other two stubbed.
            expect(result.copiedFiles).toEqual([
                '/customer/login',
                '/customer/account',
                '/customer/create-account',
            ]);
            expect(writtenUrls()[0]).toBe(
                'https://admin.da.live/source/dest-org/dest-site/customer/login.html'
            );
            expect(writtenUrls()).toHaveLength(3);
        });

        it('carries the token on each stub write', async () => {
            await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

            expect(requestInitOf(h.apiClient.fetchWithRetry).headers).toEqual({
                Authorization: `Bearer ${TEST_TOKEN}`,
            });
        });

        it('skips a stub that fails to write, keeping the others', async () => {
            h.apiClient.fetchWithRetry
                .mockResolvedValueOnce(mockResponse(500))
                .mockResolvedValue(mockResponse(200));

            const result = await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

            expect(result.copiedFiles).toEqual(['/customer/account', '/customer/create-account']);
            expect(result.totalFiles).toBe(2);
        });

        it('survives a stub write that throws', async () => {
            h.apiClient.fetchWithRetry
                .mockRejectedValueOnce(new Error('offline'))
                .mockResolvedValue(mockResponse(200));

            const result = await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

            expect(result.copiedFiles).toEqual(['/customer/account', '/customer/create-account']);
            expect(result.success).toBe(true);
        });

        it('never asks for a token when there is nothing to stub', async () => {
            h.discoveryOps.getContentPathsFromDaLive.mockResolvedValue(['/about']);

            await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

            // One token for the single content batch, none for stubs.
            expect(h.apiClient.getImsToken).toHaveBeenCalledTimes(1);
        });
    });

    describe('batching and progress', () => {
        beforeEach(() => {
            h.discoveryOps.getContentPathsFromDaLive.mockResolvedValue(
                Array.from({ length: 7 }, (_, i) => `/p${i}`)
            );
        });

        it('takes a fresh token per batch of five', async () => {
            await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

            expect(h.apiClient.getImsToken).toHaveBeenCalledTimes(2);
        });

        it('copies every path across the batches', async () => {
            const result = await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

            expect(result.copiedFiles).toHaveLength(7);
            expect(result.totalFiles).toBe(7);
        });

        it('reports the enumeration and preparation phases before copying', async () => {
            const progress = jest.fn();

            await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site', progress);

            expect(progress).toHaveBeenNthCalledWith(1, {
                processed: 0,
                total: 0,
                percentage: 0,
                message: 'Enumerating source content...',
                currentFile: 'src-org/src-site',
            });
            expect(progress).toHaveBeenNthCalledWith(2, {
                processed: 0,
                total: 0,
                percentage: 0,
                message: 'Preparing content copy...',
                currentFile: '7 pages from src-org/src-site',
            });
        });

        it('reports the first file and the percentage at each batch start', async () => {
            const progress = jest.fn();

            await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site', progress);

            expect(progress).toHaveBeenNthCalledWith(3, {
                currentFile: '/p0',
                processed: 0,
                total: 7,
                percentage: 0,
            });
            expect(progress).toHaveBeenNthCalledWith(4, {
                currentFile: '/p5',
                processed: 5,
                total: 7,
                percentage: 71,
            });
        });

        it('finishes at 100 percent over the final total', async () => {
            const progress = jest.fn();

            await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site', progress);

            expect(progress).toHaveBeenLastCalledWith({
                processed: 7,
                total: 7,
                percentage: 100,
            });
        });

        it('opens no empty extra batch when the count is an exact multiple of five', async () => {
            h.discoveryOps.getContentPathsFromDaLive.mockResolvedValue(
                Array.from({ length: 5 }, (_, i) => `/p${i}`)
            );

            const result = await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

            expect(h.apiClient.getImsToken).toHaveBeenCalledTimes(1);
            expect(result.copiedFiles).toHaveLength(5);
        });

        it('copies each path exactly once across batches', async () => {
            const result = await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

            expect(result.copiedFiles).toEqual([
                '/p0',
                '/p1',
                '/p2',
                '/p3',
                '/p4',
                '/p5',
                '/p6',
            ]);
        });

        it('copies without a progress callback', async () => {
            const result = await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

            expect(result.success).toBe(true);
        });

        it('records each failed path and fails the overall result', async () => {
            h.discoveryOps.getContentPathsFromDaLive.mockResolvedValue(['/a', '/b']);
            h.apiClient.fetchWithRetry
                .mockResolvedValueOnce(mockResponse(200))
                .mockResolvedValueOnce(mockResponse(500));

            const result = await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

            expect(result.success).toBe(false);
            expect(result.failedFiles).toEqual([{ path: '/b', error: 'Copy failed' }]);
            expect(result.copiedFiles).toEqual(['/a']);
        });
    });

    describe('completeness audit', () => {
        it('records a referenced document that was never copied', async () => {
            h.discoveryOps.getContentPathsFromDaLive.mockResolvedValue(['/account']);
            routeFetch([
                { when: (_u, i) => i?.method === 'HEAD', respond: mockResponse(404) },
                {
                    when: (u) => u === `${LIVE}/account.plain.html`,
                    respond: mockResponse(200, '<a href="/customer/nav">nav</a>', 'text/html'),
                },
                { when: () => true, respond: mockResponse(404) },
            ]);
            const report = createPatchReport();

            await h.copy.copyContentFromSource(
                SOURCE,
                'dest-org',
                'dest-site',
                undefined,
                undefined,
                undefined,
                report
            );

            expect(report.results).toEqual([
                {
                    kind: 'reference',
                    patchId: '/customer/nav',
                    target: '/customer/nav',
                    applied: false,
                    reason: 'referenced by copied content but not found on source',
                },
            ]);
        });

        it('says nothing about a reference a later stage is configured to supply', async () => {
            h.discoveryOps.getContentPathsFromDaLive.mockResolvedValue(['/account']);
            routeFetch([
                { when: (_u, i) => i?.method === 'HEAD', respond: mockResponse(404) },
                {
                    when: (u) => u === `${LIVE}/account.plain.html`,
                    respond: mockResponse(200, '<a href="/customer/nav">nav</a>', 'text/html'),
                },
                { when: () => true, respond: mockResponse(404) },
            ]);
            const report = createPatchReport();
            report.deferredReferencePrefixes = ['/customer/'];

            await h.copy.copyContentFromSource(
                SOURCE,
                'dest-org',
                'dest-site',
                undefined,
                undefined,
                undefined,
                report
            );

            expect(report.results).toEqual([]);
        });

        it('records nothing for a reference that WAS copied', async () => {
            h.discoveryOps.getContentPathsFromDaLive.mockResolvedValue(['/account']);
            routeFetch([
                { when: (_u, i) => i?.method === 'HEAD', respond: mockResponse(404) },
                {
                    when: (u) => u === `${LIVE}/account.plain.html`,
                    respond: mockResponse(200, '<a href="/customer/nav">nav</a>', 'text/html'),
                },
                { when: (u) => u.endsWith('.plain.html'), respond: mockResponse(200, '<p/>') },
            ]);
            const report = createPatchReport();

            const result = await h.copy.copyContentFromSource(
                SOURCE,
                'dest-org',
                'dest-site',
                undefined,
                undefined,
                undefined,
                report
            );

            expect(result.copiedFiles).toEqual(['/account', '/customer/nav']);
            expect(result.totalFiles).toBe(2);
            expect(report.results).toEqual([]);
        });

        it('audits without a report, leaving the copy successful', async () => {
            h.discoveryOps.getContentPathsFromDaLive.mockResolvedValue(['/account']);
            routeFetch([
                { when: (_u, i) => i?.method === 'HEAD', respond: mockResponse(404) },
                {
                    when: (u) => u === `${LIVE}/account.plain.html`,
                    respond: mockResponse(200, '<a href="/customer/nav">nav</a>', 'text/html'),
                },
                { when: () => true, respond: mockResponse(404) },
            ]);

            const result = await h.copy.copyContentFromSource(SOURCE, 'dest-org', 'dest-site');

            expect(result.success).toBe(true);
            expect(result.copiedFiles).toEqual(['/account']);
        });
    });
});
