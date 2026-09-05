/**
 * DaLiveSourceOperations Tests — single-path source CRUD.
 *
 * listDirectory, createSource, deleteSource, readSource and sourceExists: the
 * operations that address ONE path. The whole-site operations (deleteSiteRoot and
 * deleteAllSiteContent) live in `daLiveSourceOperations-siteContent.test.ts`, and
 * the shared harness in `daLiveSourceOperations.testUtils.ts`.
 *
 * These tests assert the ARGUMENTS the api client receives, not just what it
 * answers. A mock cannot see a malformed call: a request sent with the wrong verb
 * or no Authorization header is indistinguishable from a correct one when the
 * only assertion is on the fake's reply.
 */

import {
    DaLiveNetworkError,
    DELETE_INIT,
    GET_INIT,
    makeResponse,
    setupSourceOperations,
    TOKEN,
    type DaLiveSourceOperations,
    type MockApiClient,
} from './daLiveSourceOperations.testUtils';

describe('DaLiveSourceOperations', () => {
    let service: DaLiveSourceOperations;
    let apiClient: MockApiClient;

    beforeEach(() => {
        jest.clearAllMocks();
        ({ service, apiClient } = setupSourceOperations());
    });

    describe('listDirectory', () => {
        it('returns [] on 404', async () => {
            apiClient.fetchWithRetry.mockResolvedValue(makeResponse(404));

            await expect(service.listDirectory('org', 'site', '/')).resolves.toEqual([]);
        });

        it('parses JSON on 200', async () => {
            const entries = [{ path: '/org/site/a', ext: 'html' }];
            apiClient.fetchWithRetry.mockResolvedValue(makeResponse(200, { body: entries }));

            await expect(service.listDirectory('org', 'site', '/')).resolves.toEqual(entries);
        });

        it('throws DaLiveNetworkError on 429', async () => {
            apiClient.fetchWithRetry.mockResolvedValue(
                makeResponse(429, { headers: { 'Retry-After': '30' } })
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

    describe('listDirectory — the request it sends', () => {
        it('sends a GET with the bearer token to the list endpoint', async () => {
            apiClient.fetchWithRetry.mockResolvedValue(makeResponse(200, { body: [] }));

            await service.listDirectory('org', 'site', '/pages');

            expect(apiClient.fetchWithRetry).toHaveBeenCalledWith(
                'https://admin.da.live/list/org/site/pages',
                GET_INIT,
            );
        });

        it('carries the service\'s own Retry-After into the thrown error', async () => {
            apiClient.fetchWithRetry.mockResolvedValue(
                makeResponse(429, { headers: { 'Retry-After': '120' } }),
            );

            await expect(service.listDirectory('org', 'site', '/')).rejects.toMatchObject({
                retryAfter: 120,
            });
        });

        it('falls back to 60 seconds when the service states no Retry-After', async () => {
            apiClient.fetchWithRetry.mockResolvedValue(makeResponse(429));

            await expect(service.listDirectory('org', 'site', '/')).rejects.toMatchObject({
                retryAfter: 60,
            });
        });
    });

    describe('createSource — the request it sends', () => {
        /** The init the subject handed the client on its only call. */
        const sentInit = (): RequestInit => apiClient.fetchWithRetry.mock.calls[0][1];

        it('POSTs the content as an HTML blob under the data field', async () => {
            apiClient.fetchWithRetry.mockResolvedValue(makeResponse(200));

            await service.createSource('org', 'site', '/page', '<p>hello</p>');

            expect(apiClient.fetchWithRetry).toHaveBeenCalledWith(
                'https://admin.da.live/source/org/site/page',
                expect.objectContaining({
                    method: 'POST',
                    headers: { Authorization: `Bearer ${TOKEN}` },
                }),
            );
            const data = (sentInit().body as FormData).get('data') as Blob;
            expect(data.type).toBe('text/html');
            await expect(data.text()).resolves.toBe('<p>hello</p>');
        });

        it('omits the overwrite field unless it was asked for', async () => {
            apiClient.fetchWithRetry.mockResolvedValue(makeResponse(200));

            await service.createSource('org', 'site', '/page', '<p/>');

            expect((sentInit().body as FormData).get('overwrite')).toBeNull();
        });

        it('sends overwrite=true when the caller asked to replace', async () => {
            apiClient.fetchWithRetry.mockResolvedValue(makeResponse(200));

            await service.createSource('org', 'site', '/page', '<p/>', { overwrite: true });

            expect((sentInit().body as FormData).get('overwrite')).toBe('true');
        });

        it('reports a non-conflict failure with the status it got', async () => {
            // 409 has its own remedy — overwrite. Anything else must not be
            // reported as one, or the caller retries with a flag that cannot help.
            apiClient.fetchWithRetry.mockResolvedValue(makeResponse(500));

            await expect(service.createSource('org', 'site', '/page', '<p/>')).resolves.toEqual({
                success: false,
                path: '/page',
                error: 'Failed to create source: 500 Error',
            });
        });
    });

    describe('deleteSource — the request it sends', () => {
        it('sends a DELETE with the bearer token to the source path', async () => {
            apiClient.fetchWithRetry.mockResolvedValue(makeResponse(200));

            await service.deleteSource('org', 'site', '/page');

            expect(apiClient.fetchWithRetry).toHaveBeenCalledWith(
                'https://admin.da.live/source/org/site/page',
                DELETE_INIT,
            );
        });

        it('reports the status it could not delete under', async () => {
            apiClient.fetchWithRetry.mockResolvedValue(makeResponse(500));

            await expect(service.deleteSource('org', 'site', '/page')).resolves.toEqual({
                success: false,
                error: 'Failed to delete: 500 Error',
            });
        });

        it('reports a transport failure rather than throwing at the caller', async () => {
            apiClient.fetchWithRetry.mockRejectedValue(new Error('socket hang up'));

            await expect(service.deleteSource('org', 'site', '/page')).resolves.toEqual({
                success: false,
                error: 'socket hang up',
            });
        });
    });

    describe('readSource', () => {
        it('sends a GET with the bearer token to the source path', async () => {
            apiClient.fetchWithRetry.mockResolvedValue(makeResponse(200, { text: 'hi' }));

            await service.readSource('org', 'site', '/page');

            expect(apiClient.fetchWithRetry).toHaveBeenCalledWith(
                'https://admin.da.live/source/org/site/page',
                GET_INIT,
            );
        });

        it('returns the body and its true size when it fits', async () => {
            apiClient.fetchWithRetry.mockResolvedValue(makeResponse(200, { text: 'hello' }));

            await expect(service.readSource('org', 'site', '/page')).resolves.toEqual({
                status: 200,
                body: 'hello',
                bytes: 5,
                truncated: false,
            });
        });

        it('reports an absent document by status, with no body', async () => {
            // The caller has to tell "absent" from "failed", so 404 must come
            // back as a status rather than as an empty successful read.
            apiClient.fetchWithRetry.mockResolvedValue(makeResponse(404, { text: 'nope' }));

            await expect(service.readSource('org', 'site', '/page')).resolves.toEqual({
                status: 404,
                body: '',
                bytes: 0,
                truncated: false,
            });
        });

        it('truncates the body but still states the true size', async () => {
            // MCP callers pay for the body as context tokens, so it is capped —
            // but a caller's own size check has to stay honest.
            apiClient.fetchWithRetry.mockResolvedValue(makeResponse(200, { text: 'hello' }));

            await expect(service.readSource('org', 'site', '/page', 3)).resolves.toEqual({
                status: 200,
                body: 'hel',
                bytes: 5,
                truncated: true,
            });
        });

        it('leaves a body of exactly the cap untruncated', async () => {
            apiClient.fetchWithRetry.mockResolvedValue(makeResponse(200, { text: 'hello' }));

            await expect(service.readSource('org', 'site', '/page', 5)).resolves.toEqual({
                status: 200,
                body: 'hello',
                bytes: 5,
                truncated: false,
            });
        });
    });

    describe('sourceExists — the request it sends', () => {
        it('sends a GET with the bearer token to the source path', async () => {
            apiClient.fetchWithRetry.mockResolvedValue(makeResponse(200));

            await service.sourceExists('org', 'site', '/page');

            expect(apiClient.fetchWithRetry).toHaveBeenCalledWith(
                'https://admin.da.live/source/org/site/page',
                GET_INIT,
            );
        });
    });
});
