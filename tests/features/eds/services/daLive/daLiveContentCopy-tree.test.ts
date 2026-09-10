/**
 * DaLiveContentCopy — the two tree-level operations.
 *
 * `copyContent` walks a DA.live directory (folders have no `ext`, files do) and
 * rewrites each entry's path onto the destination; `copyDaLiveSite` is the
 * single bulk POST the storefront name-migration uses on reset. Both are pinned
 * by the arguments the collaborators receive, since the paths they compute are
 * the whole behaviour.
 */

import {
    createCopyHarness,
    mockResponse,
    requestInitOf,
    routeFetch,
    TEST_TOKEN,
    type CopyHarness,
} from './daLiveContentCopy.testUtils';

const SOURCE = { org: 'src-org', site: 'src-site', path: '/content' };
const DEST = { org: 'dest-org', site: 'dest-site', path: '/new' };

/** A DA.live list entry: files carry `ext`, folders do not. */
const file = (path: string): { path: string; ext: string } => ({ path, ext: 'html' });
const folder = (path: string): { path: string } => ({ path });

describe('DaLiveContentCopy.copyContent', () => {
    let h: CopyHarness;

    beforeEach(() => {
        jest.clearAllMocks();
        h = createCopyHarness();
        // Every copySingleFile: not a spreadsheet, source is HTML, write is left
        // to the spec's fetchWithRetry mock.
        routeFetch([
            { when: (_u, i) => i?.method === 'HEAD', respond: mockResponse(404) },
            {
                when: (u) => u.endsWith('.plain.html'),
                respond: mockResponse(200, '<p/>', 'text/html'),
            },
        ]);
    });

    it('copies one file and reports it, without listing anything', async () => {
        const result = await h.copy.copyContent(SOURCE, DEST);

        expect(h.sourceOps.listDirectory).not.toHaveBeenCalled();
        expect(result).toEqual({
            success: true,
            copiedFiles: ['/new'],
            failedFiles: [],
            totalFiles: 1,
        });
        expect(h.apiClient.fetchWithRetry.mock.calls[0][0]).toBe(
            'https://admin.da.live/source/dest-org/dest-site/new.html'
        );
    });

    it('records the destination path as failed when the single copy fails', async () => {
        h.apiClient.fetchWithRetry.mockResolvedValue(mockResponse(500));

        const result = await h.copy.copyContent(SOURCE, DEST);

        expect(result).toEqual({
            success: false,
            copiedFiles: [],
            failedFiles: [{ path: '/new', error: 'Copy failed' }],
            totalFiles: 1,
        });
    });

    it('fetches the token once and carries it into the write', async () => {
        await h.copy.copyContent(SOURCE, DEST);

        expect(h.apiClient.getImsToken).toHaveBeenCalledTimes(1);
        expect(requestInitOf(h.apiClient.fetchWithRetry).headers).toEqual({
            Authorization: `Bearer ${TEST_TOKEN}`,
        });
    });

    describe('recursive', () => {
        it('lists the source directory it was given', async () => {
            await h.copy.copyContent(SOURCE, DEST, { recursive: true });

            expect(h.sourceOps.listDirectory).toHaveBeenCalledWith(
                'src-org',
                'src-site',
                '/content'
            );
        });

        it('rewrites each file path from the source prefix onto the destination', async () => {
            h.sourceOps.listDirectory.mockResolvedValue([file('/content/about')]);

            const result = await h.copy.copyContent(SOURCE, DEST, { recursive: true });

            expect(result.copiedFiles).toEqual(['/new/about']);
            expect(h.apiClient.fetchWithRetry.mock.calls[0][0]).toBe(
                'https://admin.da.live/source/dest-org/dest-site/new/about.html'
            );
        });

        it('reads each file from its SOURCE path, not the rewritten one', async () => {
            h.sourceOps.listDirectory.mockResolvedValue([file('/content/about')]);
            const calls = routeFetch([
                { when: (_u, i) => i?.method === 'HEAD', respond: mockResponse(404) },
                { when: (u) => u.endsWith('.plain.html'), respond: mockResponse(200, '<p/>') },
            ]);

            await h.copy.copyContent(SOURCE, DEST, { recursive: true });

            expect(calls.map((c) => c.url)).toContain(
                'https://main--src-site--src-org.aem.live/content/about.plain.html'
            );
        });

        it('descends into a folder entry and copies its files', async () => {
            h.sourceOps.listDirectory
                .mockResolvedValueOnce([folder('/content/blog')])
                .mockResolvedValueOnce([file('/content/blog/post')]);

            const result = await h.copy.copyContent(SOURCE, DEST, { recursive: true });

            expect(h.sourceOps.listDirectory).toHaveBeenNthCalledWith(
                2,
                'src-org',
                'src-site',
                '/content/blog'
            );
            expect(result.copiedFiles).toEqual(['/new/blog/post']);
        });

        it('rolls a subdirectory failure up into the parent result', async () => {
            h.sourceOps.listDirectory
                .mockResolvedValueOnce([folder('/content/blog')])
                .mockResolvedValueOnce([file('/content/blog/post')]);
            h.apiClient.fetchWithRetry.mockResolvedValue(mockResponse(500));

            const result = await h.copy.copyContent(SOURCE, DEST, { recursive: true });

            expect(result.success).toBe(false);
            expect(result.failedFiles).toEqual([{ path: '/new/blog/post', error: 'Copy failed' }]);
            expect(result.totalFiles).toBe(1);
        });

        it('mixes copied and failed entries and totals both', async () => {
            h.sourceOps.listDirectory.mockResolvedValue([file('/content/a'), file('/content/b')]);
            h.apiClient.fetchWithRetry
                .mockResolvedValueOnce(mockResponse(200))
                .mockResolvedValueOnce(mockResponse(500));

            const result = await h.copy.copyContent(SOURCE, DEST, { recursive: true });

            expect(result).toEqual({
                success: false,
                copiedFiles: ['/new/a'],
                failedFiles: [{ path: '/new/b', error: 'Copy failed' }],
                totalFiles: 2,
            });
        });

        it('succeeds with nothing copied for an empty directory', async () => {
            h.sourceOps.listDirectory.mockResolvedValue([]);

            const result = await h.copy.copyContent(SOURCE, DEST, { recursive: true });

            expect(result).toEqual({
                success: true,
                copiedFiles: [],
                failedFiles: [],
                totalFiles: 0,
            });
            expect(h.apiClient.fetchWithRetry).not.toHaveBeenCalled();
        });

        it('keeps the destination org and site when descending', async () => {
            h.sourceOps.listDirectory
                .mockResolvedValueOnce([folder('/content/blog')])
                .mockResolvedValueOnce([file('/content/blog/post')]);

            await h.copy.copyContent(SOURCE, DEST, { recursive: true });

            expect(h.apiClient.fetchWithRetry.mock.calls[0][0]).toContain('/dest-org/dest-site/');
        });
    });
});

describe('DaLiveContentCopy.copyDaLiveSite', () => {
    let h: CopyHarness;

    beforeEach(() => {
        jest.clearAllMocks();
        h = createCopyHarness();
    });

    /** The bulk copy POST is a raw fetch, deliberately outside fetchWithRetry. */
    function routeCopy(response: Response): Array<{ url: string; init?: RequestInit }> {
        return routeFetch([{ when: (u) => u.includes('/copy/'), respond: response }]);
    }

    it('posts the destination as form data to the source site copy endpoint', async () => {
        const calls = routeCopy(mockResponse(200));

        const result = await h.copy.copyDaLiveSite('org', 'old', 'org', 'new');

        expect(result).toEqual({ success: true });
        expect(calls[0].url).toBe('https://admin.da.live/copy/org/old/');
        expect(calls[0].init?.method).toBe('POST');
        expect(calls[0].init?.headers).toEqual({ Authorization: `Bearer ${TEST_TOKEN}` });
        expect((calls[0].init?.body as FormData).get('destination')).toBe('/org/new/');
    });

    it('does NOT route the bulk copy through the retrying client', async () => {
        routeCopy(mockResponse(200));

        await h.copy.copyDaLiveSite('org', 'old', 'org', 'new');

        expect(h.apiClient.fetchWithRetry).not.toHaveBeenCalled();
    });

    it('accepts a 204 as success (DA answers the bulk copy with no content)', async () => {
        routeCopy(mockResponse(204));

        await expect(h.copy.copyDaLiveSite('org', 'old', 'org', 'new')).resolves.toEqual({
            success: true,
        });
    });

    it('supports copying across orgs', async () => {
        const calls = routeCopy(mockResponse(200));

        await h.copy.copyDaLiveSite('src-org', 'site', 'dest-org', 'site');

        expect(calls[0].url).toBe('https://admin.da.live/copy/src-org/site/');
        expect((calls[0].init?.body as FormData).get('destination')).toBe('/dest-org/site/');
    });

    it('reports the status and the response body on failure', async () => {
        routeCopy(mockResponse(403, 'forbidden'));

        const result = await h.copy.copyDaLiveSite('org', 'old', 'org', 'new');

        expect(result).toEqual({
            success: false,
            status: 403,
            error: 'Copy failed: 403 Error — forbidden',
        });
    });

    it('truncates a long error body', async () => {
        routeCopy(mockResponse(500, 'x'.repeat(500)));

        const result = await h.copy.copyDaLiveSite('org', 'old', 'org', 'new');

        expect(result).toEqual({
            success: false,
            status: 500,
            error: `Copy failed: 500 Error — ${'x'.repeat(200)}`,
        });
    });

    it('omits the body clause when the failure response has no body', async () => {
        routeCopy(mockResponse(404));

        const result = await h.copy.copyDaLiveSite('org', 'old', 'org', 'new');

        expect(result).toEqual({
            success: false,
            status: 404,
            error: 'Copy failed: 404 Not Found',
        });
    });

    it('still reports the status when the failure body cannot be read', async () => {
        routeCopy({
            ...mockResponse(500),
            text: jest.fn().mockRejectedValue(new Error('unreadable')),
        } as unknown as Response);

        const result = await h.copy.copyDaLiveSite('org', 'old', 'org', 'new');

        expect(result).toEqual({
            success: false,
            status: 500,
            error: 'Copy failed: 500 Error',
        });
    });

    it('reports the network error message when the POST throws', async () => {
        routeFetch([
            {
                when: (u) => u.includes('/copy/'),
                respond: () => {
                    throw new Error('socket hang up');
                },
            },
        ]);

        await expect(h.copy.copyDaLiveSite('org', 'old', 'org', 'new')).resolves.toEqual({
            success: false,
            error: 'socket hang up',
        });
    });

    it('reports a token failure rather than throwing out of the migration', async () => {
        h.apiClient.getImsToken.mockRejectedValue(new Error('not signed in'));

        await expect(h.copy.copyDaLiveSite('org', 'old', 'org', 'new')).rejects.toThrow(
            'not signed in'
        );
    });
});
