/**
 * When the signed Commerce REST call sends a request again (datapack step 14, item 18).
 *
 * The rule, from the Data Installer service's own client (`httpClient.js` L86-94) narrowed to
 * what is safe here: a READ is sent again on a network failure, a 5xx or a 429; ANY method is
 * sent again on a 429, because Commerce answers that before processing anything; every other
 * write is sent once, because a write that may have landed must not be sent twice. A read that
 * ran out its own wait (TIMEOUTS.LONG) is not sent again either: it already waited minutes.
 *
 * `sleep` is mocked, so the backoff is asserted by the delays asked for, never by elapsed time.
 */

jest.mock('@/core/utils/sleep');

import { requestRest, type RestMethod, type RestTarget } from '@/features/ai/server/commerceRestClient';
import { REST_RETRIES, restRetryDelay } from '@/features/ai/server/commerceRestRetry';
import { storeWriteCount } from '@/core/utils/storeWrites';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

const mockedSleep = sleep as jest.MockedFunction<typeof sleep>;

const TARGET: RestTarget = {
    base: 'https://na1-sandbox.api.commerce.adobe.com/UoGYsHrcxMyeoVd2zUktZi',
    token: 'token',
    clientId: 'client',
    imsOrgCode: 'ORG@AdobeOrg',
};

type Reply = { status: number; body?: string } | { throws: Error };

/** A fetch answering each reply in turn, the last one for every call after. */
function fetchAnswering(...replies: Reply[]): jest.Mock {
    let call = 0;
    return jest.fn(async () => {
        const reply = replies[Math.min(call, replies.length - 1)];
        call += 1;
        if ('throws' in reply) throw reply.throws;
        return { ok: reply.status < 300, status: reply.status, text: async () => reply.body ?? '' };
    });
}

const send = (method: RestMethod, fetchImpl: jest.Mock) =>
    requestRest(method, TARGET, 'products/ABC', method === 'GET' ? undefined : { a: 1 }, fetchImpl as unknown as typeof fetch);

beforeEach(() => {
    mockedSleep.mockReset();
    mockedSleep.mockResolvedValue(undefined);
});

describe('requestRest retries', () => {
    it('sends a read again after a 5xx, and answers what the retry got', async () => {
        const fetchImpl = fetchAnswering({ status: 503, body: 'busy' }, { status: 200, body: '{"sku":"ABC"}' });

        const answer = await send('GET', fetchImpl);

        expect(answer).toStrictEqual({ ok: true, status: 200, text: '{"sku":"ABC"}' });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(mockedSleep).toHaveBeenCalledWith(TIMEOUTS.RETRY_INITIAL_DELAY);
    });

    it('sends a read again after a network failure', async () => {
        const fetchImpl = fetchAnswering({ throws: new TypeError('fetch failed') }, { status: 200, body: '[]' });

        expect(await send('GET', fetchImpl)).toStrictEqual({ ok: true, status: 200, text: '[]' });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('sends a read again after a 429', async () => {
        const fetchImpl = fetchAnswering({ status: 429 }, { status: 200, body: '{}' });

        expect(await send('GET', fetchImpl)).toStrictEqual({ ok: true, status: 200, text: '{}' });
    });

    it('gives up after three retries, backing off each time, and answers the last reply', async () => {
        const fetchImpl = fetchAnswering({ status: 500, body: 'still broken' });

        const answer = await send('GET', fetchImpl);

        expect(answer).toStrictEqual({ ok: false, status: 500, text: 'still broken' });
        expect(fetchImpl).toHaveBeenCalledTimes(4);
        expect(mockedSleep.mock.calls.map(([ms]) => ms)).toStrictEqual([
            TIMEOUTS.RETRY_INITIAL_DELAY,
            TIMEOUTS.RETRY_INITIAL_DELAY * 2,
            TIMEOUTS.RETRY_INITIAL_DELAY * 4,
        ]);
    });

    it('never waits longer than TIMEOUTS.RETRY_MAX_DELAY between tries', () => {
        expect(restRetryDelay('GET', { status: 503 }, REST_RETRIES - 1)).toBeLessThanOrEqual(TIMEOUTS.RETRY_MAX_DELAY);
        expect(restRetryDelay('GET', { status: 503 }, REST_RETRIES)).toBeUndefined();
    });

    it.each([400, 401, 403, 404])('answers a read refused with %i at once', async (status) => {
        const fetchImpl = fetchAnswering({ status, body: 'no' });

        expect(await send('GET', fetchImpl)).toStrictEqual({ ok: false, status, text: 'no' });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(mockedSleep).not.toHaveBeenCalled();
    });

    it.each<RestMethod>(['POST', 'PUT', 'DELETE'])('sends a %s again after a 429: Commerce processed nothing', async (method) => {
        const fetchImpl = fetchAnswering({ status: 429 }, { status: 200, body: 'true' });

        expect(await send(method, fetchImpl)).toStrictEqual({ ok: true, status: 200, text: 'true' });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it.each<RestMethod>(['POST', 'PUT', 'DELETE'])('never sends a %s again after a 5xx: it may have landed', async (method) => {
        const fetchImpl = fetchAnswering({ status: 503, body: 'busy' }, { status: 200 });

        expect(await send(method, fetchImpl)).toStrictEqual({ ok: false, status: 503, text: 'busy' });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it.each<RestMethod>(['POST', 'PUT', 'DELETE'])('never sends a %s again after a network failure', async (method) => {
        const fetchImpl = fetchAnswering({ throws: new TypeError('socket hang up') }, { status: 200 });

        expect(await send(method, fetchImpl)).toStrictEqual({ failed: 'socket hang up' });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('counts a write once, however many times a 429 makes it go', async () => {
        const before = storeWriteCount();

        await send('POST', fetchAnswering({ status: 429 }, { status: 429 }, { status: 200 }));

        expect(storeWriteCount() - before).toBe(1);
    });

    describe('a read that ran out its own wait', () => {
        beforeEach(() => jest.useFakeTimers());
        afterEach(() => jest.useRealTimers());

        it('is not sent again: it already waited TIMEOUTS.LONG', async () => {
            const fetchImpl = jest.fn(
                (_url: string, init: { signal: AbortSignal }) =>
                    new Promise((_resolve, reject) => {
                        init.signal.addEventListener('abort', () => reject(new Error('This operation was aborted')));
                    }),
            );

            const pending = requestRest('GET', TARGET, 'orders', undefined, fetchImpl as unknown as typeof fetch);
            await jest.advanceTimersByTimeAsync(TIMEOUTS.LONG);

            expect(await pending).toStrictEqual({ failed: 'This operation was aborted' });
            expect(fetchImpl).toHaveBeenCalledTimes(1);
        });
    });
});
