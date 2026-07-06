import { DaLiveApiClient } from '@/features/eds/services/daLiveApiClient';
import { DaLiveError, DaLiveAuthError, DaLiveNetworkError } from '@/features/eds/services/types';

const makeLogger = () =>
    ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }) as never;

const makeClient = (token: string | null) =>
    new DaLiveApiClient({ getAccessToken: jest.fn().mockResolvedValue(token) }, makeLogger());

describe('DaLiveApiClient', () => {
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
            expect((err as DaLiveError).code).toBe(`HTTP_${status}`);
        });
    });
});
