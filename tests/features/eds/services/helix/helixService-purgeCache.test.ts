/**
 * `purgeCacheAll` — the call made before republishing a site that already
 * existed under the same name, so the CDN stops serving the previous demo's
 * pages. Nothing exercised it at all: every branch in it was measured
 * uncovered on 2026-09-05.
 *
 * Two things it decides that no other Helix call does:
 *
 *   - A 404 is SUCCESS. Nothing has been cached yet, which is the state a fresh
 *     site is in, and treating it as a failure would abort every first publish.
 *   - It sends the GitHub token only. Cache invalidation never touches DA.live
 *     content, so a missing DA.live session must not stop a reset — the admin
 *     Bearer rides along when there is one, and is simply absent when there is not.
 */

import {
    createHelixService,
    installFetchMock,
    restoreFetch,
    type HelixServiceType,
} from './helixService.testUtils';

const res = (status: number, statusText = ''): Partial<Response> => ({
    ok: status >= 200 && status < 300,
    status,
    statusText,
});

describe('HelixService.purgeCacheAll', () => {
    let service: HelixServiceType;
    let mockFetch: jest.Mock;

    beforeEach(async () => {
        jest.clearAllMocks();
        mockFetch = installFetchMock();
        service = await createHelixService();
    });

    afterEach(restoreFetch);

    it('POSTs the whole-site cache partition with both credentials', async () => {
        mockFetch.mockResolvedValue(res(200));

        await service.purgeCacheAll('testuser', 'my-site');

        expect(mockFetch).toHaveBeenCalledWith(
            'https://admin.hlx.page/cache/testuser/my-site/main/*',
            expect.objectContaining({
                method: 'POST',
                headers: {
                    Authorization: 'Bearer valid-dalive-ims-token',
                    'x-auth-token': 'valid-github-token',
                },
            }),
        );
    });

    it('accepts a 404 — nothing had been cached yet', async () => {
        mockFetch.mockResolvedValue(res(404, 'Not Found'));

        await expect(service.purgeCacheAll('testuser', 'my-site')).resolves.toBeUndefined();
    });

    it('reports a 401 as the admin-API refusal it is, not as a purge failure', async () => {
        mockFetch.mockResolvedValue(res(401, 'Unauthorized'));

        await expect(service.purgeCacheAll('testuser', 'my-site')).rejects.toThrow(
            /Adobe rejected the request \(401\)/,
        );
    });

    it('reports a 403 as access denied', async () => {
        mockFetch.mockResolvedValue(res(403, 'Forbidden'));

        await expect(service.purgeCacheAll('testuser', 'my-site')).rejects.toThrow(/Access denied/);
    });

    it('reports any other failure with its status', async () => {
        mockFetch.mockResolvedValue(res(500, 'Server Error'));

        await expect(service.purgeCacheAll('testuser', 'my-site')).rejects.toThrow(
            'Failed to purge cache: 500 Server Error',
        );
    });
});
