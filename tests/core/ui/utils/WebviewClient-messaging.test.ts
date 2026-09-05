/**
 * WebviewClient — subscriptions, the pre-handshake queue, state, and the
 * fixed-shape helpers every surface calls instead of hand-writing a message.
 *
 * The client is a singleton created on import, so each test loads a fresh
 * module registry (see WebviewClient.testUtils).
 */

import {
    completeHandshake,
    loadClient,
    unloadClient,
    type LoadedClient,
} from './WebviewClient.testUtils';

describe('WebviewClient - messaging', () => {
    let loaded: LoadedClient;

    beforeEach(() => {
        loaded = loadClient();
    });

    afterEach(unloadClient);

    describe('initialisation', () => {
        it('acquires the API and announces itself exactly once', () => {
            expect(loaded.postedOfType('__webview_ready__')).toHaveLength(1);

            // Subscribing later must not re-run initialisation.
            loaded.client.onMessage('anything', jest.fn());
            loaded.client.onMessage('anything-else', jest.fn());

            expect(loaded.postedOfType('__webview_ready__')).toHaveLength(1);
        });

        it('fails loudly when the host hands back no API', () => {
            unloadClient();
            jest.resetModules();
            (window as unknown as { acquireVsCodeApi: unknown }).acquireVsCodeApi = jest.fn(
                () => undefined,
            );

            expect(() => {
                require('@/core/ui/utils/WebviewClient');
            }).toThrow('WebviewClient: vscodeApi failed to initialize');

            loaded = loadClient(); // restore for afterEach
        });
    });

    describe('the pre-handshake queue', () => {
        it('holds messages back until the handshake, then sends them in order', () => {
            loaded.api.postMessage.mockClear();

            loaded.client.postMessage('first', { n: 1 });
            loaded.client.postMessage('second', { n: 2 });
            expect(loaded.api.postMessage).not.toHaveBeenCalled();

            completeHandshake(loaded);

            expect(loaded.posted().map((m) => m.type)).toEqual(['first', 'second']);
            expect(loaded.posted()[0]).toMatchObject({ type: 'first', payload: { n: 1 } });
        });

        it('sends immediately once the handshake is done', () => {
            completeHandshake(loaded);
            loaded.api.postMessage.mockClear();

            loaded.client.postMessage('live', { n: 3 });

            expect(loaded.posted()).toHaveLength(1);
            expect(loaded.posted()[0]).toMatchObject({ type: 'live', payload: { n: 3 } });
        });

        it('starts empty and empties itself, so a second handshake flushes nothing', () => {
            loaded.api.postMessage.mockClear();

            completeHandshake(loaded);
            expect(loaded.api.postMessage).not.toHaveBeenCalled();

            loaded.client.postMessage('queued-once');
            completeHandshake(loaded);
            completeHandshake(loaded);

            expect(loaded.postedOfType('queued-once')).toHaveLength(1);
            expect(loaded.posted()).toHaveLength(1);
        });

        it('stamps every message with an id and a timestamp', () => {
            completeHandshake(loaded);
            loaded.api.postMessage.mockClear();

            loaded.client.postMessage('a');
            loaded.client.postMessage('b');

            const [a, b] = loaded.posted();
            expect(a.id).toEqual(expect.any(String));
            expect(a.timestamp).toEqual(expect.any(Number));
            expect(b.id).not.toBe(a.id);
        });
    });

    describe('subscriptions', () => {
        beforeEach(() => {
            completeHandshake(loaded);
            loaded.api.postMessage.mockClear();
        });

        it('delivers a message payload to a handler registered for its type', () => {
            const handler = jest.fn();
            loaded.client.onMessage('status', handler);

            loaded.deliver({ type: 'status', payload: { state: 'ready' } });

            expect(handler).toHaveBeenCalledWith({ state: 'ready' });
        });

        it('delivers to every handler registered for the same type', () => {
            const first = jest.fn();
            const second = jest.fn();
            loaded.client.onMessage('status', first);
            loaded.client.onMessage('status', second);

            loaded.deliver({ type: 'status', payload: 'x' });

            expect(first).toHaveBeenCalledWith('x');
            expect(second).toHaveBeenCalledWith('x');
        });

        it('does not deliver a message to handlers for another type', () => {
            const handler = jest.fn();
            loaded.client.onMessage('status', handler);

            loaded.deliver({ type: 'progress', payload: 'x' });

            expect(handler).not.toHaveBeenCalled();
        });

        it('ignores a message type nobody subscribed to', () => {
            expect(() => loaded.deliver({ type: 'unheard', payload: 1 })).not.toThrow();
        });

        it('stops delivering once unsubscribed, and leaves siblings subscribed', () => {
            const leaving = jest.fn();
            const staying = jest.fn();
            const unsubscribe = loaded.client.onMessage('status', leaving);
            loaded.client.onMessage('status', staying);

            unsubscribe();
            loaded.deliver({ type: 'status', payload: 'x' });

            expect(leaving).not.toHaveBeenCalled();
            expect(staying).toHaveBeenCalledWith('x');
        });

        it('survives being unsubscribed twice', () => {
            const handler = jest.fn();
            const unsubscribe = loaded.client.onMessage('status', handler);

            unsubscribe();
            expect(() => unsubscribe()).not.toThrow();

            loaded.deliver({ type: 'status', payload: 'x' });
            expect(handler).not.toHaveBeenCalled();
        });
    });

    describe('answering a message that expects a response', () => {
        beforeEach(() => {
            completeHandshake(loaded);
            loaded.api.postMessage.mockClear();
        });

        it('posts the handler’s return value back against the message id', () => {
            loaded.client.onMessage('ask', () => ({ answer: 42 }));

            loaded.deliver({ type: 'ask', id: 'q-1', expectsResponse: true, payload: null });

            const replies = loaded.postedOfType('__response__');
            expect(replies).toHaveLength(1);
            expect(replies[0]).toMatchObject({
                type: '__response__',
                payload: { answer: 42 },
                isResponse: true,
                responseToId: 'q-1',
            });
            expect(replies[0].id).toEqual(expect.any(String));
            expect(replies[0].timestamp).toEqual(expect.any(Number));
        });

        it('stays silent for a message that expects no response', () => {
            loaded.client.onMessage('tell', () => 'ignored');

            loaded.deliver({ type: 'tell', id: 'q-2', payload: null });

            expect(loaded.postedOfType('__response__')).toHaveLength(0);
        });

        it('stays silent when the message carries no id to answer', () => {
            loaded.client.onMessage('ask', () => 'ignored');

            loaded.deliver({ type: 'ask', expectsResponse: true, payload: null });

            expect(loaded.postedOfType('__response__')).toHaveLength(0);
        });
    });

    describe('state', () => {
        it('reads state straight from the host', () => {
            loaded.api.getState.mockReturnValue({ step: 'welcome' });

            expect(loaded.client.getState()).toEqual({ step: 'welcome' });
            expect(loaded.api.getState).toHaveBeenCalled();
        });

        it('writes state straight to the host', () => {
            loaded.client.setState({ step: 'review' });

            expect(loaded.api.setState).toHaveBeenCalledWith({ step: 'review' });
        });
    });

    describe('the fixed-shape helpers', () => {
        beforeEach(() => {
            completeHandshake(loaded);
            loaded.api.postMessage.mockClear();
        });

        const lastMessage = () => loaded.posted()[loaded.posted().length - 1];

        it('requestValidation names the field and its value', () => {
            loaded.client.requestValidation('projectName', 'my-demo');

            expect(lastMessage()).toMatchObject({
                type: 'validate',
                payload: { field: 'projectName', value: 'my-demo' },
            });
        });

        it('reportProgress carries step, percentage and optional message', () => {
            loaded.client.reportProgress('install', 40, 'installing');

            expect(lastMessage()).toMatchObject({
                type: 'progress',
                payload: { step: 'install', progress: 40, message: 'installing' },
            });
        });

        it('reportProgress leaves the message undefined when none is given', () => {
            loaded.client.reportProgress('install', 40);

            expect(lastMessage()).toMatchObject({
                type: 'progress',
                payload: { step: 'install', progress: 40, message: undefined },
            });
        });

        it('requestAuth does not force a re-login unless asked to', () => {
            loaded.client.requestAuth();

            expect(lastMessage()).toMatchObject({
                type: 'authenticate',
                payload: { force: false },
            });
        });

        it('requestAuth forces a re-login when asked to', () => {
            loaded.client.requestAuth(true);

            expect(lastMessage()).toMatchObject({
                type: 'authenticate',
                payload: { force: true },
            });
        });

        it('requestProjects names the org', () => {
            loaded.client.requestProjects('org-123');

            expect(lastMessage()).toMatchObject({
                type: 'get-projects',
                payload: { orgId: 'org-123' },
            });
        });

        it('reDetectContext carries no payload', () => {
            loaded.client.reDetectContext();

            expect(lastMessage()).toMatchObject({ type: 're-detect-context' });
            expect(lastMessage().payload).toBeUndefined();
        });

        it('createProject sends the config through unchanged', () => {
            const config = { projectName: 'demo', components: [] } as never;
            loaded.client.createProject(config);

            expect(lastMessage()).toMatchObject({ type: 'create-project' });
            expect(lastMessage().payload).toBe(config);
        });

        it('log carries the level with the text', () => {
            loaded.client.log('warn', 'something odd');

            expect(lastMessage()).toMatchObject({
                type: 'log',
                payload: { level: 'warn', message: 'something odd' },
            });
        });
    });
});
