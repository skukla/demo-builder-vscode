// The retry loop sleeps between attempts (1s, then 2s). Mocked so the suite
// runs in milliseconds AND so the backoff itself becomes assertable — the delay
// is an argument this collaborator receives, not a side effect nothing sees.
jest.mock('@/core/utils/sleep', () => ({ sleep: jest.fn().mockResolvedValue(undefined) }));

import { DaLiveApiClient } from '@/features/eds/services/daLive/daLiveApiClient';
import { sleep } from '@/core/utils/sleep';
import { DaLiveError, DaLiveAuthError, DaLiveNetworkError } from '@/features/eds/services/types';
import { createMockLogger } from '../../../../helpers/loggerFake';

const makeLogger = () => createMockLogger();

const makeClient = (token: string | null) =>
    new DaLiveApiClient({ getAccessToken: jest.fn().mockResolvedValue(token) }, makeLogger());

describe('DaLiveApiClient', () => {
    beforeEach(() => (sleep as jest.Mock).mockClear());
    afterEach(() => jest.restoreAllMocks());

    describe('getImsToken', () => {
        it('returns the token when the provider yields one', async () => {
            await expect(makeClient('tok-123').getImsToken()).resolves.toBe('tok-123');
        });

        it('throws DaLiveAuthError when the provider yields null', async () => {
            await expect(makeClient(null).getImsToken()).rejects.toBeInstanceOf(DaLiveAuthError);
        });
    });

    describe('fetchWithRetry', () => {
        it('returns a successful response without retrying', async () => {
            const ok = { status: 200, ok: true } as Response;
            const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(ok);

            const res = await makeClient('t').fetchWithRetry('https://da/x', { method: 'GET' });

            expect(res).toBe(ok);
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it('throws DaLiveNetworkError with retryAfter on 429', async () => {
            const rateLimited = {
                status: 429,
                headers: { get: () => '30' },
            } as unknown as Response;
            jest.spyOn(global, 'fetch').mockResolvedValue(rateLimited);

            await expect(
                makeClient('t').fetchWithRetry('https://da/x', { method: 'GET' })
            ).rejects.toBeInstanceOf(DaLiveNetworkError);
        });

        // 2026-08-22 consolidation surface: content-copy call sites migrate
        // onto this client, and they need (a) fresh one-shot bodies per
        // attempt (a FormData stream cannot be resent) and (b) page-level
        // rate-limit tolerance (skip one page, never abort a 300-page copy).
        it('invokes a request factory once per attempt, so one-shot bodies are rebuilt', async () => {
            const failing = { status: 503, ok: false } as Response;
            const ok = { status: 200, ok: true } as Response;
            jest.spyOn(global, 'fetch').mockResolvedValueOnce(failing).mockResolvedValueOnce(ok);

            const factory = jest.fn(() => ({ method: 'POST' as const }));
            const res = await makeClient('t').fetchWithRetry('https://da/x', factory);

            expect(res).toBe(ok);
            expect(factory).toHaveBeenCalledTimes(2);
        });

        it('sends the caller options through, adding a timeout signal', async () => {
            // Losing the caller's own init is a silent GET-instead-of-PUT; losing
            // the signal is a request that can hang for the life of the process.
            const ok = { status: 200, ok: true } as Response;
            const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(ok);

            await makeClient('t').fetchWithRetry('https://da/x', {
                method: 'PUT',
                headers: { 'x-test': 'yes' },
            });

            expect(fetchMock).toHaveBeenCalledWith(
                'https://da/x',
                expect.objectContaining({
                    method: 'PUT',
                    headers: { 'x-test': 'yes' },
                    signal: expect.anything(),
                })
            );
        });

        it("carries the server's own Retry-After onto the 429 error", async () => {
            const rateLimited = {
                status: 429,
                headers: { get: jest.fn().mockReturnValue('120') },
            } as unknown as Response;
            const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(rateLimited);

            const thrown = await makeClient('t')
                .fetchWithRetry('https://da/x', { method: 'GET' })
                .then(
                    () => undefined,
                    (e: unknown) => e as DaLiveNetworkError
                );

            expect(thrown).toBeInstanceOf(DaLiveNetworkError);
            expect(thrown?.retryAfter).toBe(120);
            // Thrown, not retried: the wait is the caller's to schedule.
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it('falls back to a minute when the 429 names no Retry-After', async () => {
            const rateLimited = {
                status: 429,
                headers: { get: jest.fn().mockReturnValue(null) },
            } as unknown as Response;
            jest.spyOn(global, 'fetch').mockResolvedValue(rateLimited);

            const thrown = await makeClient('t')
                .fetchWithRetry('https://da/x', { method: 'GET' })
                .then(
                    () => undefined,
                    (e: unknown) => e as DaLiveNetworkError
                );

            expect(thrown?.retryAfter).toBe(60);
            // Reading the wrong header name would silently take this fallback
            // on every 429, whatever the server asked for.
            expect(rateLimited.headers.get).toHaveBeenCalledWith('Retry-After');
        });

        it('gives up on a retryable status and hands the last response back', async () => {
            // Not an exception: a 503 that never clears is the server's answer,
            // and the caller decides what it means for the operation.
            const failing = { status: 503, ok: false } as Response;
            const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(failing);

            const res = await makeClient('t').fetchWithRetry('https://da/x', { method: 'GET' });

            expect(res).toBe(failing);
            expect(fetchMock).toHaveBeenCalledTimes(3);
            expect(sleep).toHaveBeenNthCalledWith(1, 1000);
            expect(sleep).toHaveBeenNthCalledWith(2, 2000);
        });

        it('retries a network error and returns the attempt that works', async () => {
            const ok = { status: 200, ok: true } as Response;
            const fetchMock = jest
                .spyOn(global, 'fetch')
                .mockRejectedValueOnce(new Error('ECONNRESET'))
                .mockResolvedValueOnce(ok);

            const res = await makeClient('t').fetchWithRetry('https://da/x', { method: 'GET' });

            expect(res).toBe(ok);
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        it('reports a network error that never clears, naming the original cause', async () => {
            const fetchMock = jest
                .spyOn(global, 'fetch')
                .mockRejectedValue(new Error('ECONNRESET'));

            await expect(
                makeClient('t').fetchWithRetry('https://da/x', { method: 'GET' })
            ).rejects.toThrow('Network error: ECONNRESET');
            expect(fetchMock).toHaveBeenCalledTimes(3);
        });

        it('does NOT retry a timed-out attempt', async () => {
            // AbortSignal.timeout fires per attempt. Retrying an abort spends
            // three full timeouts before telling the SC anything.
            const fetchMock = jest
                .spyOn(global, 'fetch')
                .mockRejectedValue(new Error('The operation was aborted'));

            await expect(
                makeClient('t').fetchWithRetry('https://da/x', { method: 'GET' })
            ).rejects.toThrow('Network error: The operation was aborted');
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it('says "Unknown error" rather than nothing when the failure carries no message', async () => {
            jest.spyOn(global, 'fetch').mockRejectedValue(new Error(''));

            await expect(
                makeClient('t').fetchWithRetry('https://da/x', { method: 'GET' })
            ).rejects.toThrow('Network error: Unknown error');
        });

        it("returns the 429 response instead of throwing when rateLimit is 'return'", async () => {
            const rateLimited = {
                status: 429,
                headers: { get: () => '30' },
            } as unknown as Response;
            jest.spyOn(global, 'fetch').mockResolvedValue(rateLimited);

            const res = await makeClient('t').fetchWithRetry(
                'https://da/x',
                { method: 'POST' },
                { rateLimit: 'return' }
            );

            expect(res.status).toBe(429);
        });
    });

    describe('createErrorFromResponse', () => {
        const client = makeClient('t');

        it('throws DaLiveAuthError on 401', () => {
            expect(() =>
                client.createErrorFromResponse({ status: 401 } as Response, 'read')
            ).toThrow(DaLiveAuthError);
        });

        it.each([
            [403, 'Access denied'],
            [404, 'Resource not found'],
            [500, 'Server error'],
            [418, 'Unexpected error'],
        ])('returns a DaLiveError for %s', (status, fragment) => {
            const err = client.createErrorFromResponse({ status } as Response, 'read');
            expect(err).toBeInstanceOf(DaLiveError);
            expect(err.message).toContain(fragment);
            expect(err.code).toBe(`HTTP_${status}`);
        });
    });
});
