/**
 * HelixBulkPublish — the Admin API's bulk preview and bulk publish, measured on
 * its own (EDS-8, 2026-10-08). The HelixService suites drive the same code
 * through the facade; this one constrains the decisions the unit makes by
 * itself: which partition, which credentials, which status means what.
 */

import { HelixAdminAuth } from '@/features/eds/services/helix/helixAdminAuth';
import { ADMIN_API_401_MESSAGE } from '@/features/eds/services/helix/helixAdminErrors';
import { HelixBulkPublish } from '@/features/eds/services/helix/helixBulkPublish';
import type { GitHubTokenService } from '@/features/eds/services/github/githubTokenService';
import { DaLiveAuthError } from '@/features/eds/services/types';
import { createMockLogger } from '../../../../helpers/loggerFake';

const mockFetch = jest.fn();
global.fetch = mockFetch;

/** A Response carrying only what the unit reads. */
function res(status: number, body?: unknown, statusText = ''): Response {
    return {
        status,
        ok: status >= 200 && status < 300,
        statusText,
        headers: { get: () => null },
        json: async () => body,
        text: async () => (typeof body === 'string' ? body : ''),
    } as unknown as Response;
}

/** A Response whose body cannot be read (the 400 path's "Invalid request" branch). */
function unreadable(status: number): Response {
    return {
        status,
        ok: false,
        statusText: 'Bad Request',
        headers: { get: () => null },
        text: async () => {
            throw new Error('stream closed');
        },
    } as unknown as Response;
}

const scheduled = (name: string, topic: string): Response =>
    res(202, { job: { name, topic, state: 'created' } });
const finished = (processed: number, total: number): Response =>
    res(200, { state: 'stopped', progress: { processed, total } });

describe('HelixBulkPublish', () => {
    let logger: ReturnType<typeof createMockLogger>;
    let bulk: HelixBulkPublish;

    beforeEach(() => {
        mockFetch.mockReset();
        logger = createMockLogger();
        const githubTokenService = {
            getToken: jest.fn().mockResolvedValue({ token: 'gh-token' }),
        } as unknown as GitHubTokenService;
        const auth = new HelixAdminAuth(
            { getAccessToken: jest.fn().mockResolvedValue('da-token') },
            () => null,
            githubTokenService,
        );
        bulk = new HelixBulkPublish({ logger, auth });
    });

    describe('the request', () => {
        it('previews through POST /preview/{org}/{site}/{ref}/* with both credentials', async () => {
            mockFetch.mockResolvedValueOnce(res(200));

            await bulk.previewAllContent('org', 'site', 'main', undefined, ['/a', '/b']);

            expect(mockFetch).toHaveBeenCalledTimes(1);
            const [url, init] = mockFetch.mock.calls[0];
            expect(url).toBe('https://admin.hlx.page/preview/org/site/main/*');
            expect(init.method).toBe('POST');
            expect(init.headers).toEqual({
                Authorization: 'Bearer da-token',
                'x-auth-token': 'gh-token',
                'x-content-source-authorization': 'Bearer da-token',
                'Content-Type': 'application/json',
            });
            expect(JSON.parse(init.body)).toEqual({ paths: ['/a', '/b'], forceUpdate: true });
            expect(init.signal).toBeInstanceOf(AbortSignal);
        });

        it('publishes through POST /live/{org}/{site}/{ref}/* with the same body', async () => {
            mockFetch.mockResolvedValueOnce(res(200));

            await bulk.publishAllContent('org', 'site', 'main', undefined, ['/a']);

            const [url, init] = mockFetch.mock.calls[0];
            expect(url).toBe('https://admin.hlx.page/live/org/site/main/*');
            expect(init.method).toBe('POST');
            expect(init.headers).toEqual({
                Authorization: 'Bearer da-token',
                'x-auth-token': 'gh-token',
                'x-content-source-authorization': 'Bearer da-token',
                'Content-Type': 'application/json',
            });
            expect(JSON.parse(init.body)).toEqual({ paths: ['/a'], forceUpdate: true });
        });

        it.each([
            ['preview', (b: HelixBulkPublish) => b.previewAllContent('org', 'site')],
            ['live', (b: HelixBulkPublish) => b.publishAllContent('org', 'site')],
        ])('%s defaults to the main branch and the site root when nothing is given', async (
            partition,
            run,
        ) => {
            mockFetch.mockResolvedValueOnce(res(200));

            await run(bulk);

            const [url, init] = mockFetch.mock.calls[0];
            expect(url).toBe(`https://admin.hlx.page/${partition}/org/site/main/*`);
            expect(JSON.parse(init.body).paths).toEqual(['/']);
        });

        it('an empty paths list also means the site root', async () => {
            mockFetch.mockResolvedValueOnce(res(200));

            await bulk.previewAllContent('org', 'site', 'main', undefined, []);

            expect(JSON.parse(mockFetch.mock.calls[0][1].body).paths).toEqual(['/']);
        });

        it('reaches for the credentials before it POSTs, so a missing token never hits the API', async () => {
            const noGitHub = new HelixAdminAuth(
                { getAccessToken: jest.fn().mockResolvedValue('da-token') },
                () => null,
                undefined,
            );
            const withoutToken = new HelixBulkPublish({ logger, auth: noGitHub });

            await expect(withoutToken.previewAllContent('org', 'site')).rejects.toThrow(
                /GitHub authentication required/,
            );
            expect(mockFetch).not.toHaveBeenCalled();
        });
    });

    describe('what each status means', () => {
        it.each([
            ['preview', (b: HelixBulkPublish) => b.previewAllContent('org', 'site')],
            ['publish', (b: HelixBulkPublish) => b.publishAllContent('org', 'site')],
        ])('%s: 200 is a synchronous success and the only request made', async (_name, run) => {
            mockFetch.mockResolvedValueOnce(res(200));

            await expect(run(bulk)).resolves.toBeUndefined();

            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it.each([
            ['preview', (b: HelixBulkPublish) => b.previewAllContent('org', 'site')],
            ['publish', (b: HelixBulkPublish) => b.publishAllContent('org', 'site')],
        ])('%s: 401 is the admin-API refusal, verbatim', async (_name, run) => {
            mockFetch.mockResolvedValueOnce(res(401));

            await expect(run(bulk)).rejects.toThrow(ADMIN_API_401_MESSAGE);
        });

        // Publish matched preview on 2026-10-09 (EDS-34): it used to throw a plain
        // "Access denied", so an expired session mid-publish never re-prompted.
        it.each([
            ['preview', (b: HelixBulkPublish) => b.previewAllContent('org', 'site')],
            ['publish', (b: HelixBulkPublish) => b.publishAllContent('org', 'site')],
        ])('%s: 403 is a refused credential (DaLiveAuthError), so the auth retry can prompt', async (_name, run) => {
            mockFetch.mockResolvedValueOnce(res(403));

            await expect(run(bulk)).rejects.toBeInstanceOf(DaLiveAuthError);
        });

        it.each([
            ['preview', (b: HelixBulkPublish) => b.previewAllContent('org', 'site')],
            ['publish', (b: HelixBulkPublish) => b.publishAllContent('org', 'site')],
        ])('%s: 400 carries the response body and is logged as an error', async (_name, run) => {
            mockFetch.mockResolvedValueOnce(res(400, 'paths must be an array'));

            await expect(run(bulk)).rejects.toThrow(
                /400 Bad Request - paths must be an array/,
            );
            expect(logger.error).toHaveBeenCalledTimes(1);
        });

        it('400 with an unreadable body still fails, with a placeholder reason', async () => {
            mockFetch.mockResolvedValueOnce(unreadable(400));

            await expect(bulk.previewAllContent('org', 'site')).rejects.toThrow(
                /400 Bad Request - Invalid request/,
            );
        });

        it('publish: 400 carries the body too, and is logged as an error', async () => {
            mockFetch.mockResolvedValueOnce(res(400, 'ref not found'));

            await expect(bulk.publishAllContent('org', 'site')).rejects.toThrow(
                /publish all content: 400 Bad Request - ref not found/,
            );
            expect(logger.error).toHaveBeenCalledTimes(1);
        });

        it('publish: 400 with an unreadable body still names a placeholder reason', async () => {
            mockFetch.mockResolvedValueOnce(unreadable(400));

            await expect(bulk.publishAllContent('org', 'site')).rejects.toThrow(
                /publish all content: 400 Bad Request - Invalid request/,
            );
        });

        it.each([
            ['preview', (b: HelixBulkPublish) => b.previewAllContent('org', 'site')],
            ['publish', (b: HelixBulkPublish) => b.publishAllContent('org', 'site')],
        ])('%s: any other failure names the status and its text', async (_name, run) => {
            mockFetch.mockResolvedValueOnce(res(503, undefined, 'Service Unavailable'));

            await expect(run(bulk)).rejects.toThrow(/503 Service Unavailable/);
        });
    });

    describe('202: a scheduled job', () => {
        it('polls the job with the job-status identity and reports its progress', async () => {
            const onProgress = jest.fn();
            mockFetch
                .mockResolvedValueOnce(scheduled('job-1', 'preview'))
                .mockResolvedValueOnce(finished(3, 3));

            await bulk.previewAllContent('org', 'site', 'main', onProgress, ['/a', '/b', '/c']);

            expect(mockFetch).toHaveBeenCalledTimes(2);
            const [url, init] = mockFetch.mock.calls[1];
            expect(url).toBe('https://admin.hlx.page/job/org/site/main/preview/job-1');
            expect(init.method).toBe('GET');
            expect(init.headers).toEqual({
                Authorization: 'Bearer da-token',
                'x-auth-token': 'gh-token',
            });
            expect(onProgress).toHaveBeenCalledWith(3, 3);
        });

        it('publish polls under the live topic', async () => {
            mockFetch
                .mockResolvedValueOnce(scheduled('job-2', 'live'))
                .mockResolvedValueOnce(finished(1, 1));

            await bulk.publishAllContent('org', 'site');

            expect(mockFetch.mock.calls[1][0]).toBe(
                'https://admin.hlx.page/job/org/site/main/live/job-2',
            );
        });

        it('a job that failed fails the operation', async () => {
            mockFetch
                .mockResolvedValueOnce(scheduled('job-3', 'live'))
                .mockResolvedValueOnce(res(200, { state: 'stopped', error: 'boom' }));

            await expect(bulk.publishAllContent('org', 'site')).rejects.toThrow(/boom/);
        });

        it('a job answer that names no topic is polled under the partition it was sent to', async () => {
            mockFetch
                .mockResolvedValueOnce(res(202, { job: { name: 'p-1' } }))
                .mockResolvedValueOnce(finished(1, 1))
                .mockResolvedValueOnce(res(202, { job: { name: 'l-1' } }))
                .mockResolvedValueOnce(finished(1, 1));

            await bulk.previewAllContent('org', 'site');
            await bulk.publishAllContent('org', 'site');

            expect(mockFetch.mock.calls[1][0]).toBe(
                'https://admin.hlx.page/job/org/site/main/preview/p-1',
            );
            expect(mockFetch.mock.calls[3][0]).toBe(
                'https://admin.hlx.page/job/org/site/main/live/l-1',
            );
        });

        it.each([
            ['preview', (b: HelixBulkPublish) => b.previewAllContent('org', 'site')],
            ['publish', (b: HelixBulkPublish) => b.publishAllContent('org', 'site')],
        ])('%s: 202 without a job name is treated as done, with a warning and no poll', async (
            _name,
            run,
        ) => {
            mockFetch.mockResolvedValueOnce(res(202, {}));

            await expect(run(bulk)).resolves.toBeUndefined();

            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(logger.warn).toHaveBeenCalledTimes(1);
        });
    });
});
