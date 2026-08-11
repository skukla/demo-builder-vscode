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
            /GitHub authentication failed/
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
