/**
 * DaLiveSourceOperations — whole-site deletion.
 *
 * `deleteAllSiteContent` is the reversal half of storefront setup: it walks the
 * tree, deletes files in batches, then directories deepest-first, then the site
 * root so the site disappears from the org listing. Every one of those four
 * phases can be skipped without any single-path test noticing, so this suite
 * counts the calls as well as reading the result.
 *
 * Shared harness in `daLiveSourceOperations.testUtils.ts`.
 */

import {
    DELETE_INIT,
    makeResponse,
    setupSourceOperations,
    type DaLiveSourceOperations,
    type MockApiClient,
} from './daLiveSourceOperations.testUtils';

describe('DaLiveSourceOperations — whole-site deletion', () => {
    let service: DaLiveSourceOperations;
    let apiClient: MockApiClient;

    beforeEach(() => {
        jest.clearAllMocks();
        ({ service, apiClient } = setupSourceOperations());
    });

    /** Every URL the subject asked the client for, in call order. */
    const urls = (): string[] => apiClient.fetchWithRetry.mock.calls.map((c) => String(c[0]));

    describe('deleteSiteRoot', () => {
        it('sends a DELETE to the site root marker', async () => {
            apiClient.fetchWithRetry.mockResolvedValue(makeResponse(200));

            await service.deleteSiteRoot('org', 'site');

            expect(apiClient.fetchWithRetry).toHaveBeenCalledWith(
                'https://admin.da.live/source/org/site/',
                DELETE_INIT,
            );
        });

        it('resolves without throwing when the root is already gone', async () => {
            apiClient.fetchWithRetry.mockResolvedValue(makeResponse(404));

            await expect(service.deleteSiteRoot('org', 'site')).resolves.toBeUndefined();
        });

        it('resolves without throwing when the transport fails', async () => {
            // Best-effort: a failed root delete must not fail the reset around it.
            apiClient.fetchWithRetry.mockRejectedValue(new Error('network'));

            await expect(service.deleteSiteRoot('org', 'site')).resolves.toBeUndefined();
        });
    });

    describe('deleteAllSiteContent', () => {
        it('orchestrates list → delete files → delete dirs → delete root', async () => {
            // First list (root): one file + one subdir; second list (subdir): one file.
            apiClient.fetchWithRetry
                .mockResolvedValueOnce(
                    makeResponse(200, {
                        body: [
                            { path: '/org/site/page', ext: 'html' },
                            { path: '/org/site/sub' }, // no ext → directory
                        ],
                    }),
                )
                .mockResolvedValueOnce(
                    makeResponse(200, { body: [{ path: '/org/site/sub/inner', ext: 'html' }] }),
                );
            apiClient.fetchWithRetry.mockResolvedValue(makeResponse(200));

            const onProgress = jest.fn();
            const result = await service.deleteAllSiteContent('org', 'site', onProgress);

            expect(result).toEqual({
                success: true,
                deletedCount: 2,
                deletedPaths: ['/page', '/sub/inner'],
            });
            // The directory is deleted after its contents, and the root last.
            expect(urls()).toEqual([
                'https://admin.da.live/list/org/site/',
                'https://admin.da.live/list/org/site/sub',
                'https://admin.da.live/source/org/site/page',
                'https://admin.da.live/source/org/site/sub/inner',
                'https://admin.da.live/source/org/site/sub',
                'https://admin.da.live/source/org/site/',
            ]);
        });

        it('tells the caller which file it just deleted', async () => {
            apiClient.fetchWithRetry
                .mockResolvedValueOnce(
                    makeResponse(200, { body: [{ path: '/org/site/page', ext: 'html' }] }),
                )
                .mockResolvedValue(makeResponse(200));

            const onProgress = jest.fn();
            await service.deleteAllSiteContent('org', 'site', onProgress);

            expect(onProgress).toHaveBeenCalledWith({ deleted: 1, current: '/page' });
        });

        it('runs without a progress callback', async () => {
            // The callback is optional, and the delete loop is the only place
            // that reads it — an unguarded call there fails every caller that
            // omits it, which is most of them.
            apiClient.fetchWithRetry
                .mockResolvedValueOnce(
                    makeResponse(200, { body: [{ path: '/org/site/page', ext: 'html' }] }),
                )
                .mockResolvedValue(makeResponse(200));

            await expect(service.deleteAllSiteContent('org', 'site')).resolves.toEqual({
                success: true,
                deletedCount: 1,
                deletedPaths: ['/page'],
            });
        });

        it('counts only the files that actually deleted', async () => {
            apiClient.fetchWithRetry
                .mockResolvedValueOnce(
                    makeResponse(200, {
                        body: [
                            { path: '/org/site/kept', ext: 'html' },
                            { path: '/org/site/gone', ext: 'html' },
                        ],
                    }),
                )
                .mockResolvedValueOnce(makeResponse(500)) // /kept refuses
                .mockResolvedValue(makeResponse(200));

            const onProgress = jest.fn();
            const result = await service.deleteAllSiteContent('org', 'site', onProgress);

            // deletedPaths still lists what it TRIED; deletedCount is what landed.
            expect(result.deletedCount).toBe(1);
            expect(result.deletedPaths).toEqual(['/kept', '/gone']);
            expect(onProgress).toHaveBeenCalledTimes(1);
        });

        it('deletes more files than one batch holds, each exactly once', async () => {
            // Six files against a batch size of five: the second batch must be
            // the remainder, not the whole list again.
            const files = ['a', 'b', 'c', 'd', 'e', 'f'].map((n) => ({
                path: `/org/site/${n}`,
                ext: 'html',
            }));
            apiClient.fetchWithRetry
                .mockResolvedValueOnce(makeResponse(200, { body: files }))
                .mockResolvedValue(makeResponse(200));

            const result = await service.deleteAllSiteContent('org', 'site');

            expect(result.deletedCount).toBe(6);
            // 1 list + 6 file deletes + 1 root delete.
            expect(apiClient.fetchWithRetry).toHaveBeenCalledTimes(8);
        });

        it('deletes only the site root when the site is already empty', async () => {
            apiClient.fetchWithRetry.mockResolvedValue(makeResponse(200, { body: [] }));

            const result = await service.deleteAllSiteContent('org', 'site');

            expect(result).toEqual({ success: true, deletedCount: 0, deletedPaths: [] });
            expect(urls()).toEqual([
                'https://admin.da.live/list/org/site/',
                'https://admin.da.live/source/org/site/',
            ]);
        });

        it('leaves empty directories alone when the site holds no files', async () => {
            // A site whose only entries are directories still counts as empty,
            // and the early return means those directories are NOT swept.
            apiClient.fetchWithRetry
                .mockResolvedValueOnce(makeResponse(200, { body: [{ path: '/org/site/sub' }] }))
                .mockResolvedValueOnce(makeResponse(200, { body: [] }))
                .mockResolvedValue(makeResponse(200));

            const result = await service.deleteAllSiteContent('org', 'site');

            expect(result).toEqual({ success: true, deletedCount: 0, deletedPaths: [] });
            expect(urls()).toEqual([
                'https://admin.da.live/list/org/site/',
                'https://admin.da.live/list/org/site/sub',
                'https://admin.da.live/source/org/site/',
            ]);
        });

        it('reports what it had collected when the walk fails partway', async () => {
            apiClient.fetchWithRetry
                .mockResolvedValueOnce(
                    makeResponse(200, {
                        body: [
                            { path: '/org/site/page', ext: 'html' },
                            { path: '/org/site/sub' },
                        ],
                    }),
                )
                .mockRejectedValue(new Error('ENOTFOUND'));

            const result = await service.deleteAllSiteContent('org', 'site');

            expect(result).toEqual({
                success: false,
                deletedCount: 1,
                deletedPaths: ['/page'],
                error: 'ENOTFOUND',
            });
        });
    });
});
