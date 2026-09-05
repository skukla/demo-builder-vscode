/**
 * WebviewClient — request/response correlation and the timeout it enforces.
 *
 * A request is a message that expects an answer: the client keeps it pending
 * under its own id, arms a timer, and settles the caller's promise when a
 * message comes back carrying that id in `responseToId`. The backend may also
 * send a `__timeout_hint__` to replace the timer with a longer one, because
 * some operations (a mesh deploy) legitimately take minutes.
 */

import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';
import {
    completeHandshake,
    loadClient,
    unloadClient,
    type LoadedClient,
} from './WebviewClient.testUtils';

/** Let queued microtasks run without moving fake time. */
const flush = () => Promise.resolve().then(() => undefined);

/**
 * Attach handlers immediately and report the rejection MESSAGE (or null if it
 * resolved). Doing this before the clock moves keeps the rejection handled, so
 * a timeout under test never surfaces as an unhandled-rejection warning.
 */
const settlement = (promise: Promise<unknown>) =>
    promise.then(
        () => null,
        (error: Error) => error.message,
    );

describe('WebviewClient - requests', () => {
    let loaded: LoadedClient;

    beforeEach(() => {
        loaded = loadClient();
        completeHandshake(loaded);
        loaded.api.postMessage.mockClear();
    });

    afterEach(unloadClient);

    /** Send a request and hand back its promise plus the id it went out under. */
    const sendRequest = (type = 'get-thing', payload?: unknown, timeoutMs?: number) => {
        const promise =
            timeoutMs === undefined
                ? loaded.client.request(type, payload)
                : loaded.client.request(type, payload, timeoutMs);
        const sent = loaded.postedOfType(type);
        return { promise, sent };
    };

    describe('sending', () => {
        it('sends the request synchronously once the handshake is done', () => {
            const { promise, sent } = sendRequest('get-thing', { id: 7 });

            expect(sent).toHaveLength(1);
            expect(sent[0]).toMatchObject({
                type: 'get-thing',
                payload: { id: 7 },
                expectsResponse: true,
            });
            expect(sent[0].id).toEqual(expect.any(String));

            loaded.deliver({ isResponse: true, responseToId: sent[0].id, payload: null });
            return promise;
        });

        it('waits for the handshake before sending', async () => {
            const fresh = loadClient();
            fresh.api.postMessage.mockClear();

            const promise = fresh.client.request('early');
            await flush();
            expect(fresh.postedOfType('early')).toHaveLength(0);

            completeHandshake(fresh);
            await flush();
            const sent = fresh.postedOfType('early');
            expect(sent).toHaveLength(1);

            fresh.deliver({ isResponse: true, responseToId: sent[0].id, payload: 'ok' });
            await expect(promise).resolves.toBe('ok');
        });
    });

    describe('responses', () => {
        it('resolves with the response payload', async () => {
            const { promise, sent } = sendRequest();

            loaded.deliver({
                isResponse: true,
                responseToId: sent[0].id,
                payload: { name: 'demo' },
            });

            await expect(promise).resolves.toEqual({ name: 'demo' });
        });

        it('rejects with the error the response carries', async () => {
            const { promise, sent } = sendRequest();

            loaded.deliver({
                isResponse: true,
                responseToId: sent[0].id,
                error: 'workspace not found',
                payload: { ignored: true },
            });

            await expect(promise).rejects.toThrow('workspace not found');
        });

        it('cancels the timer, so a settled request never rejects later', async () => {
            const { promise, sent } = sendRequest();
            loaded.deliver({ isResponse: true, responseToId: sent[0].id, payload: 'done' });
            await expect(promise).resolves.toBe('done');

            jest.advanceTimersByTime(FRONTEND_TIMEOUTS.REQUEST_TIMEOUT * 2);

            // A second response for the same id must find nothing pending.
            expect(() =>
                loaded.deliver({ isResponse: true, responseToId: sent[0].id, payload: 'again' }),
            ).not.toThrow();
        });

        it('ignores a response for an id it is not waiting on', async () => {
            const { promise, sent } = sendRequest();

            expect(() =>
                loaded.deliver({ isResponse: true, responseToId: 'nobody-asked', payload: 1 }),
            ).not.toThrow();

            loaded.deliver({ isResponse: true, responseToId: sent[0].id, payload: 'mine' });
            await expect(promise).resolves.toBe('mine');
        });

        it('treats a response flag with no responseToId as an ordinary message', () => {
            const handler = jest.fn();
            loaded.client.onMessage('half-response', handler);

            loaded.deliver({ type: 'half-response', isResponse: true, payload: { a: 1 } });

            expect(handler).toHaveBeenCalledWith({ a: 1 });
        });
    });

    describe('timeouts', () => {
        it('rejects naming the request type once the default timeout elapses', async () => {
            const settled = settlement(sendRequest('slow-thing').promise);

            jest.advanceTimersByTime(FRONTEND_TIMEOUTS.REQUEST_TIMEOUT);

            expect(await settled).toBe('Request timeout: slow-thing');
        });

        it('honours a caller-supplied timeout instead of the default', async () => {
            const settled = settlement(sendRequest('brief', undefined, 1000).promise);

            jest.advanceTimersByTime(999);
            await flush();
            jest.advanceTimersByTime(1);

            expect(await settled).toBe('Request timeout: brief');
        });

        it('does not reject before its timeout is up', async () => {
            const { promise, sent } = sendRequest('patient', undefined, 5000);
            const seen = jest.fn();
            promise.then(seen, seen);

            jest.advanceTimersByTime(4999);
            await flush();

            expect(seen).not.toHaveBeenCalled();

            loaded.deliver({ isResponse: true, responseToId: sent[0].id, payload: 'ok' });
            await expect(promise).resolves.toBe('ok');
        });
    });

    describe('backend timeout hints', () => {
        const hint = (requestId: string, timeout: number) =>
            loaded.deliver({ type: '__timeout_hint__', payload: { requestId, timeout } });

        it('replaces the pending timer with the backend’s longer one', async () => {
            const { promise, sent } = sendRequest('deploy', undefined, 1000);
            const settled = settlement(promise);

            hint(sent[0].id, 60000);

            // The original deadline passes and nothing happens — it was cleared.
            jest.advanceTimersByTime(1000);
            await flush();

            jest.advanceTimersByTime(59000);
            expect(await settled).toBe('Request timeout (60000ms)');
        });

        it('leaves the request alive right up to the new deadline', async () => {
            const { promise, sent } = sendRequest('deploy', undefined, 1000);
            const seen = jest.fn();
            promise.then(seen, seen);

            hint(sent[0].id, 60000);
            jest.advanceTimersByTime(59999);
            await flush();

            expect(seen).not.toHaveBeenCalled();

            loaded.deliver({ isResponse: true, responseToId: sent[0].id, payload: 'deployed' });
            await expect(promise).resolves.toBe('deployed');
        });

        it('ignores a hint for a request it is not waiting on', async () => {
            const { promise, sent } = sendRequest('deploy', undefined, 5000);
            const settled = settlement(promise);

            expect(() => hint('nobody-asked', 60000)).not.toThrow();

            // The real request keeps its ORIGINAL deadline.
            jest.advanceTimersByTime(5000);
            expect(await settled).toBe('Request timeout: deploy');
            expect(sent[0].id).not.toBe('nobody-asked');
        });

        it('ignores a hint that carries no payload', () => {
            const handler = jest.fn();
            loaded.client.onMessage('__timeout_hint__', handler);

            loaded.deliver({ type: '__timeout_hint__' });

            // No payload -> not treated as a hint, so it falls through to listeners.
            expect(handler).toHaveBeenCalledWith(undefined);
        });
    });
});
