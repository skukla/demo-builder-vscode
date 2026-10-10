/**
 * meshEndpoint — asking a mesh address whether it answers (PL-70).
 *
 * `meshAnswersAt` is the question itself: one GraphQL POST, where anything but a
 * 404 or no reply counts as an answer. `answeringEndpoint` is the search built on
 * it; its host-switching cases live in meshEndpoint.test.ts, and the ones here pin
 * what it will NOT probe and how often it waits between rounds.
 */

import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { answeringEndpoint, meshAnswersAt, mockSleep } from './meshEndpoint.testUtils';

const SANDBOX = 'https://edge-sandbox-graph.adobe.io/api/mesh-1/graphql';

describe('meshAnswersAt', () => {
    const realFetch = global.fetch;
    const fetchMock = jest.fn();

    beforeEach(() => {
        fetchMock.mockReset();
        global.fetch = fetchMock;
    });

    afterAll(() => {
        global.fetch = realFetch;
    });

    it('asks with one small GraphQL POST, under a time limit', async () => {
        fetchMock.mockResolvedValue({ status: 200 });

        await meshAnswersAt(SANDBOX);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe(SANDBOX);
        expect(init).toMatchObject({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: '{ __typename }' }),
        });
        expect(init.signal).toBeInstanceOf(AbortSignal);
    });

    it('counts a 200 as an answer', async () => {
        fetchMock.mockResolvedValue({ status: 200 });

        await expect(meshAnswersAt(SANDBOX)).resolves.toBe(true);
    });

    // A mesh that is there but unhappy (an auth refusal, a server error) is still
    // a mesh at this address; only "no such mesh" means look elsewhere.
    it('counts an error status other than 404 as an answer', async () => {
        fetchMock.mockResolvedValue({ status: 500 });

        await expect(meshAnswersAt(SANDBOX)).resolves.toBe(true);
    });

    it('counts a 404 as no mesh at this address', async () => {
        fetchMock.mockResolvedValue({ status: 404 });

        await expect(meshAnswersAt(SANDBOX)).resolves.toBe(false);
    });

    it('counts no reply at all as no mesh, rather than throwing', async () => {
        fetchMock.mockRejectedValue(new Error('timed out'));

        await expect(meshAnswersAt(SANDBOX)).resolves.toBe(false);
    });
});

describe('answeringEndpoint — what it will not probe', () => {
    it('leaves alone an address that only CONTAINS a mesh address', async () => {
        const ask = jest.fn(async () => true);
        const wrapped = `proxy:${SANDBOX}`;

        await expect(answeringEndpoint(wrapped, ask)).resolves.toBe(wrapped);
        expect(ask).not.toHaveBeenCalled();
    });

    it('leaves alone a mesh address with anything after it', async () => {
        const ask = jest.fn(async () => true);
        const trailing = `${SANDBOX} (stale)`;

        await expect(answeringEndpoint(trailing, ask)).resolves.toBe(trailing);
        expect(ask).not.toHaveBeenCalled();
    });
});

describe('answeringEndpoint — the wait between rounds', () => {
    beforeEach(() => {
        mockSleep.mockClear();
    });

    // Three rounds, so two waits: after the last round there is nothing left to
    // wait for, and a third wait would only delay the answer.
    it('waits between rounds, and not after the last one', async () => {
        const ask = jest.fn(async () => false);

        await answeringEndpoint(SANDBOX, ask);

        expect(mockSleep).toHaveBeenCalledTimes(2);
        expect(mockSleep).toHaveBeenCalledWith(TIMEOUTS.MESH_ENDPOINT_PROBE_INTERVAL);
    });

    it('does not wait at all when the first round answers', async () => {
        const ask = jest.fn(async () => true);

        await answeringEndpoint(SANDBOX, ask);

        expect(mockSleep).not.toHaveBeenCalled();
    });
});
