/**
 * HelixService.previewCode — 400 retry-with-backoff.
 *
 * `POST /code/<org>/<site>/<branch><path>` returns 400 when Helix's code mirror
 * hasn't yet indexed a just-pushed commit ("I don't have that commit yet").
 * previewCode retries on 400 only — with backoff spanning Helix's typical <10s
 * mirror-indexing window — so the spurious "Failed to preview code: 400" warning
 * stops firing right after a push. Non-400 statuses keep their immediate-throw
 * semantics so genuine auth/permission/server failures are never masked.
 *
 * setTimeout is stubbed to fire synchronously: the retry loop advances without
 * real waits, and the stub's recorded delays assert the 1s/3s/7s backoff.
 */

import { HelixService } from '@/features/eds/services/helixService';
import type { DaLiveTokenProvider } from '@/features/eds/services/helixService';
import type { GitHubTokenService } from '@/features/eds/services/githubTokenService';

import type { Logger } from '@/types/logger';

const mockFetch = jest.fn();
global.fetch = mockFetch;

const res = (status: number, statusText = ''): Response =>
    ({ status, ok: status >= 200 && status < 300, statusText }) as Response;

describe('HelixService.previewCode — 400 retry-with-backoff', () => {
    let service: HelixService;
    let mockLogger: Logger;
    let setTimeoutSpy: jest.SpyInstance;
    let abortTimeoutSpy: jest.SpyInstance;

    beforeEach(() => {
        mockFetch.mockReset();

        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as unknown as Logger;

        const githubTokenService = {
            getToken: jest.fn().mockResolvedValue({ token: 'gh-token' }),
        } as unknown as GitHubTokenService;

        service = new HelixService(mockLogger, githubTokenService);

        // Fire scheduled backoffs synchronously so the retry loop advances without
        // real waits; the recorded delays are asserted below.
        setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void) => {
            fn();
            return 0 as unknown as NodeJS.Timeout;
        }) as unknown as typeof setTimeout);

        abortTimeoutSpy = jest.spyOn(AbortSignal, 'timeout');
    });

    afterEach(() => jest.restoreAllMocks());

    const backoffDelays = () => setTimeoutSpy.mock.calls.map((c) => c[1]);

    it('resolves without retrying when the first attempt succeeds', async () => {
        mockFetch.mockResolvedValueOnce(res(200));

        await expect(service.previewCode('org', 'site', '/config.json')).resolves.toBeUndefined();

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(setTimeoutSpy).not.toHaveBeenCalled();
    });

    it('retries after a 400 and resolves once the mirror catches up (400 → 200)', async () => {
        mockFetch.mockResolvedValueOnce(res(400, 'Bad Request')).mockResolvedValueOnce(res(200));

        await expect(service.previewCode('org', 'site', '/config.json')).resolves.toBeUndefined();

        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(backoffDelays()).toEqual([1000]); // one backoff before the retry
    });

    it('throws after exhausting the 400 retries, preserving the error message', async () => {
        mockFetch.mockResolvedValue(res(400, 'Bad Request'));

        await expect(service.previewCode('org', 'site', '/config.json')).rejects.toThrow(
            'Failed to preview code: 400 Bad Request'
        );

        // initial attempt + 3 retries = 4 requests; backoff 1s/3s/7s before each retry
        expect(mockFetch).toHaveBeenCalledTimes(4);
        expect(backoffDelays()).toEqual([1000, 3000, 7000]);
    });

    it('does NOT retry on 401 (auth failure surfaces immediately)', async () => {
        mockFetch.mockResolvedValueOnce(res(401));

        await expect(service.previewCode('org', 'site', '/config.json')).rejects.toThrow(
            /Adobe rejected the request \(401\)/
        );

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(setTimeoutSpy).not.toHaveBeenCalled();
    });

    it('does NOT retry on 403 (access denied surfaces immediately)', async () => {
        mockFetch.mockResolvedValueOnce(res(403));

        await expect(service.previewCode('org', 'site', '/config.json')).rejects.toThrow(
            /Access denied/
        );

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(setTimeoutSpy).not.toHaveBeenCalled();
    });

    it('does NOT retry on 500 (server error is not the mirror race)', async () => {
        mockFetch.mockResolvedValueOnce(res(500, 'Server Error'));

        await expect(service.previewCode('org', 'site', '/config.json')).rejects.toThrow(
            'Failed to preview code: 500 Server Error'
        );

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(setTimeoutSpy).not.toHaveBeenCalled();
    });

    it('uses a fresh abort-timeout signal for each attempt', async () => {
        mockFetch.mockResolvedValueOnce(res(400, 'Bad Request')).mockResolvedValueOnce(res(200));

        await service.previewCode('org', 'site', '/config.json');

        // One AbortSignal.timeout per fetch attempt (no reused/aborted signal).
        expect(abortTimeoutSpy).toHaveBeenCalledTimes(2);
    });
});

/**
 * Admin-API auth: the DA.live IMS Bearer must ride along with the GitHub token.
 *
 * Measured 2026-08-14 against a throwaway site: writing any `access.admin` role
 * makes the Configuration Service set `requireAuth: "auto"`, and the whole admin
 * API then refuses the GitHub token — an identical bulk-preview POST returned 202
 * before the grant, 401 after, and 202 again once this Bearer was attached. Since
 * the extension now pins a site admin during setup, every admin-API call it makes
 * runs against a protected site.
 */
describe('HelixService — admin-API authorization', () => {
    const mockLogger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    } as unknown as Logger;

    const githubTokenService = {
        getToken: jest.fn().mockResolvedValue({ token: 'gh-token' }),
    } as unknown as GitHubTokenService;

    const headersOfLastCall = () => mockFetch.mock.calls.at(-1)?.[1]?.headers ?? {};

    beforeEach(() => {
        mockFetch.mockReset();
        mockFetch.mockResolvedValue(res(200));
    });

    it('sends the DA.live Bearer alongside the GitHub token', async () => {
        const daLive = {
            getAccessToken: jest.fn().mockResolvedValue('ims-token'),
        } as unknown as DaLiveTokenProvider;

        await new HelixService(mockLogger, githubTokenService, daLive).previewCode(
            'org',
            'site',
            '/config.json',
        );

        expect(headersOfLastCall()).toEqual({
            Authorization: 'Bearer ims-token',
            'x-auth-token': 'gh-token',
        });
    });

    it('degrades to the GitHub token alone when no DA.live session exists', async () => {
        // An unprotected site never needed the Bearer, so a missing DA.live
        // session must not turn a working call into a hard failure.
        await new HelixService(mockLogger, githubTokenService).previewCode(
            'org',
            'site',
            '/config.json',
        );

        expect(headersOfLastCall()).toEqual({ 'x-auth-token': 'gh-token' });
    });
});
