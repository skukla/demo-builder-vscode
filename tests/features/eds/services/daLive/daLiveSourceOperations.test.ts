/**
 * DaLiveSourceOperations Tests — source-tree CRUD.
 *
 * Focused unit suite for the source-CRUD cluster extracted from
 * DaLiveContentOperations: listDirectory, createSource, deleteSource,
 * deleteSiteRoot, deleteAllSiteContent, and sourceExists. The service is
 * constructed with a mock DaLiveApiClient and mock logger; global.fetch is
 * mocked for the DELETE/GET paths that bypass the client.
 */

import { DaLiveSourceOperations } from '@/features/eds/services/daLive/daLiveSourceOperations';
import { DaLiveNetworkError } from '@/features/eds/services/types';
import type { DaLiveApiClient } from '@/features/eds/services/daLive/daLiveApiClient';
import type { Logger } from '@/types/logger';

// Mock the timeout config
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        NORMAL: 30000,
        QUICK: 5000,
    },
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

type MockApiClient = {
    getImsToken: jest.Mock;
    fetchWithRetry: jest.Mock;
    createErrorFromResponse: jest.Mock;
};

function makeResponse(
    status: number,
    body?: unknown,
    headers: Record<string, string> = {}
): Response {
    const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? 'OK' : status === 404 ? 'Not Found' : 'Error',
        headers: { get: (key: string) => lower[key.toLowerCase()] ?? null } as unknown as Headers,
        json: jest.fn().mockResolvedValue(body),
    } as unknown as Response;
}

describe('DaLiveSourceOperations', () => {
    let service: DaLiveSourceOperations;
    let apiClient: MockApiClient;
    let logger: Logger;

    beforeEach(() => {
        jest.clearAllMocks();

        apiClient = {
            getImsToken: jest.fn().mockResolvedValue('t'),
            fetchWithRetry: jest.fn(),
            createErrorFromResponse: jest.fn(),
        };

        logger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as unknown as Logger;

        service = new DaLiveSourceOperations(apiClient as unknown as DaLiveApiClient, logger);
    });

    describe('listDirectory', () => {
        it('returns [] on 404', async () => {
            apiClient.fetchWithRetry.mockResolvedValue(makeResponse(404));

            await expect(service.listDirectory('org', 'site', '/')).resolves.toEqual([]);
        });

        it('parses JSON on 200', async () => {
            const entries = [{ path: '/org/site/a', ext: 'html' }];
            apiClient.fetchWithRetry.mockResolvedValue(makeResponse(200, entries));

            await expect(service.listDirectory('org', 'site', '/')).resolves.toEqual(entries);
        });

        it('throws DaLiveNetworkError on 429', async () => {
            apiClient.fetchWithRetry.mockResolvedValue(
                makeResponse(429, undefined, { 'Retry-After': '30' })
            );

            await expect(service.listDirectory('org', 'site', '/')).rejects.toBeInstanceOf(
                DaLiveNetworkError
            );
        });

        it('maps other non-OK statuses via the api client error mapper', async () => {
            const mapped = new Error('boom');
            apiClient.fetchWithRetry.mockResolvedValue(makeResponse(500));
            apiClient.createErrorFromResponse.mockReturnValue(mapped);

            await expect(service.listDirectory('org', 'site', '/')).rejects.toBe(mapped);
            expect(apiClient.createErrorFromResponse).toHaveBeenCalledWith(
                expect.anything(),
                'list directory'
            );
        });
    });

    describe('createSource', () => {
        it('returns success on ok', async () => {
            apiClient.fetchWithRetry.mockResolvedValue(makeResponse(200));

            await expect(service.createSource('org', 'site', '/page', '<p/>')).resolves.toEqual({
                success: true,
                path: '/page',
            });
        });

        it('returns a conflict error on 409', async () => {
            apiClient.fetchWithRetry.mockResolvedValue(makeResponse(409));

            const result = await service.createSource('org', 'site', '/page', '<p/>');
            expect(result.success).toBe(false);
            expect(result.error).toContain('already exists');
        });
    });

    describe('deleteSource', () => {
        it('reports success on 200', async () => {
            apiClient.fetchWithRetry.mockResolvedValue(makeResponse(200));

            await expect(service.deleteSource('org', 'site', '/page')).resolves.toEqual({
                success: true,
            });
        });

        it('reports success on 404 (already gone)', async () => {
            apiClient.fetchWithRetry.mockResolvedValue(makeResponse(404));

            await expect(service.deleteSource('org', 'site', '/page')).resolves.toEqual({
                success: true,
            });
        });

        it('reports failure on other status', async () => {
            apiClient.fetchWithRetry.mockResolvedValue(makeResponse(500));

            const result = await service.deleteSource('org', 'site', '/page');
            expect(result.success).toBe(false);
        });
    });

    describe('sourceExists', () => {
        it('returns true when the GET is ok', async () => {
            apiClient.fetchWithRetry.mockResolvedValue(makeResponse(200));

            await expect(service.sourceExists('org', 'site', '/page')).resolves.toBe(true);
        });

        it('returns false on 404', async () => {
            apiClient.fetchWithRetry.mockResolvedValue(makeResponse(404));

            await expect(service.sourceExists('org', 'site', '/page')).resolves.toBe(false);
        });

        it('returns false when fetch throws', async () => {
            apiClient.fetchWithRetry.mockRejectedValue(new Error('network'));

            await expect(service.sourceExists('org', 'site', '/page')).resolves.toBe(false);
        });
    });

    describe('deleteAllSiteContent', () => {
        it('orchestrates list → delete files → delete dirs → delete root', async () => {
            // First list (root): one file + one subdir; second list (subdir): one file.
            apiClient.fetchWithRetry
                .mockResolvedValueOnce(
                    makeResponse(200, [
                        { path: '/org/site/page', ext: 'html' },
                        { path: '/org/site/sub' }, // no ext → directory
                    ])
                )
                .mockResolvedValueOnce(
                    makeResponse(200, [{ path: '/org/site/sub/inner', ext: 'html' }])
                );

            // Since the 2026-08-22 transport consolidation, deleteSource and
            // deleteSiteRoot ALSO ride the shared client.
            apiClient.fetchWithRetry.mockResolvedValue(makeResponse(200));

            const onProgress = jest.fn();
            const result = await service.deleteAllSiteContent('org', 'site', onProgress);

            expect(result.success).toBe(true);
            // Two files deleted (relative paths, org/site prefix stripped).
            expect(result.deletedCount).toBe(2);
            expect(result.deletedPaths).toEqual(['/page', '/sub/inner']);
            expect(onProgress).toHaveBeenCalledTimes(2);
            // 2 list calls + deleteSource for 2 files + 1 dir + deleteSiteRoot = 6 client calls.
            expect(apiClient.fetchWithRetry).toHaveBeenCalledTimes(6);
        });

        it('deletes only the site root when the site is already empty', async () => {
            apiClient.fetchWithRetry.mockResolvedValue(makeResponse(200, []));

            const result = await service.deleteAllSiteContent('org', 'site');

            expect(result).toEqual({ success: true, deletedCount: 0, deletedPaths: [] });
            // The empty list + the site-root DELETE, both via the client.
            expect(apiClient.fetchWithRetry).toHaveBeenCalledTimes(2);
        });
    });

    describe('deleteSiteRoot', () => {
        it('resolves without throwing on ok', async () => {
            mockFetch.mockResolvedValue(makeResponse(200));

            await expect(service.deleteSiteRoot('org', 'site')).resolves.toBeUndefined();
        });

        it('swallows fetch errors (best-effort)', async () => {
            mockFetch.mockRejectedValue(new Error('network'));

            await expect(service.deleteSiteRoot('org', 'site')).resolves.toBeUndefined();
        });
    });
});
