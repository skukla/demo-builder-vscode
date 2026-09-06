/**
 * WebviewCommunicationManager — the protocol decisions nothing else constrained.
 *
 * The existing suites drive the happy paths: a request resolves, a handshake
 * completes, a handler answers. What they do not do is separate a rule from its
 * absence — that a reply is sent ONLY when one was asked for, that an
 * acknowledgement is not sent back at an acknowledgement, that a disposed
 * manager stops writing to a webview that has gone. Each of those looks
 * identical from the happy path and is exactly the class of fault this transport
 * has shipped before: a request that never resolves and a log that says nothing.
 *
 * Split from the three existing suites, which together are already 1,181 lines.
 */

import {
    WebviewCommunicationManager,
    createWebviewCommunication,
    vscode,
    setupMocks,
    setupHandshakenManager,
} from './webviewCommunicationManager.testUtils';
import { Message } from '@/types/messages';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

/** Every message the manager has posted to the webview. */
function posted(webview: vscode.Webview): Message[] {
    return (webview.postMessage as jest.Mock).mock.calls.map((call) => call[0] as Message);
}

const typesPosted = (webview: vscode.Webview): string[] =>
    posted(webview).map((message) => message.type);

describe('WebviewCommunicationManager — protocol decisions', () => {
    let mockWebview: vscode.Webview;
    let manager: WebviewCommunicationManager;
    let listener: () => (message: Message) => void;

    beforeEach(async () => {
        jest.useFakeTimers();
        ({ mockWebview, manager, listener } = await setupHandshakenManager());
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    /**
     * `expectsResponse` is the whole of the contract. A webview that sent a
     * fire-and-forget message is not waiting for anything, and answering it
     * anyway puts a `__response__` on the wire that correlates to nothing.
     */
    describe('a reply is sent only when one was asked for', () => {
        it('does not answer a fire-and-forget message a handler served', async () => {
            manager.on('notify', () => 'ignored');

            await listener()({ id: 'm-1', type: 'notify', timestamp: Date.now() } as Message);

            expect(typesPosted(mockWebview)).not.toContain('__response__');
        });

        it('does not answer a fire-and-forget message whose handler threw', async () => {
            manager.on('notify', () => {
                throw new Error('handler exploded');
            });

            await listener()({ id: 'm-1', type: 'notify', timestamp: Date.now() } as Message);

            expect(typesPosted(mockWebview)).not.toContain('__response__');
        });

        it('does not answer a fire-and-forget message no handler serves', async () => {
            await listener()({ id: 'm-1', type: 'unknown-type', timestamp: Date.now() } as Message);

            expect(typesPosted(mockWebview)).not.toContain('__response__');
        });

        it('does not send a timeout hint for a fire-and-forget message', async () => {
            manager.on('get-projects', () => []);

            await listener()({
                id: 'm-1',
                type: 'get-projects',
                timestamp: Date.now(),
            } as Message);

            expect(typesPosted(mockWebview)).not.toContain('__timeout_hint__');
        });

        it('CONTROL — answers, and hints, when the webview did ask', async () => {
            manager.on('get-projects', () => ['a']);

            await listener()({
                id: 'm-1',
                type: 'get-projects',
                timestamp: Date.now(),
                expectsResponse: true,
            } as Message);

            expect(typesPosted(mockWebview)).toEqual(
                expect.arrayContaining(['__timeout_hint__', '__response__']),
            );
        });
    });

    describe('the acknowledgement rules', () => {
        it('does not acknowledge an acknowledgement', async () => {
            await listener()({
                id: 'ack-1',
                type: '__acknowledge__',
                timestamp: Date.now(),
            } as Message);

            expect(posted(mockWebview)).toHaveLength(0);
        });

        it('does not acknowledge a response to one of its own requests', async () => {
            const pending = manager.request('some-request');
            const sent = posted(mockWebview)[0];
            (mockWebview.postMessage as jest.Mock).mockClear();

            await listener()({
                id: 'r-1',
                type: '__response__',
                payload: { ok: true },
                timestamp: Date.now(),
                isResponse: true,
                responseToId: sent.id,
            } as Message);

            await expect(pending).resolves.toEqual({ ok: true });
            expect(typesPosted(mockWebview)).not.toContain('__acknowledge__');
        });

        it('does not acknowledge a response that carries no responseToId', async () => {
            await listener()({
                id: 'r-2',
                type: '__response__',
                timestamp: Date.now(),
                isResponse: true,
            } as Message);

            expect(typesPosted(mockWebview)).not.toContain('__acknowledge__');
        });

        it('still serves a normal message that happens to carry a responseToId', async () => {
            const handler = jest.fn(() => 'served');
            manager.on('notify', handler);

            await listener()({
                id: 'm-1',
                type: 'notify',
                timestamp: Date.now(),
                responseToId: 'something-else',
            } as Message);

            expect(handler).toHaveBeenCalledTimes(1);
        });
    });

    describe('a disposed manager stops writing to the webview', () => {
        it('sends nothing after dispose', async () => {
            manager.dispose();

            await manager.sendMessage('anything', { a: 1 });

            expect(posted(mockWebview)).toHaveLength(0);
        });

        it('clears the timeout of a request still in flight', async () => {
            const settled = jest.fn();
            manager.request('slow-request').then(settled, settled);

            manager.dispose();
            await jest.advanceTimersByTimeAsync(TIMEOUTS.NORMAL * 2);

            expect(settled).not.toHaveBeenCalled();
        });

        it('disposes the listener registration it made', async () => {
            const mocks = setupMocks();
            const disposable = { dispose: jest.fn() };
            (mocks.mockWebview.onDidReceiveMessage as jest.Mock).mockImplementation(
                (l, _thisArg, disposables: vscode.Disposable[]) => {
                    disposables.push(disposable);
                    void l;
                    return disposable;
                },
            );
            const fresh = new WebviewCommunicationManager(mocks.mockPanel);
            void fresh.initialize().catch(() => undefined);

            fresh.dispose();

            expect(disposable.dispose).toHaveBeenCalledTimes(1);
        });
    });

    /**
     * The retry loop, at both of its edges: it must WAIT the configured delay
     * before trying again, and it must stop after the configured number of
     * attempts. The existing suites prove a retry happens; neither edge was
     * pinned, so the delay could collapse to nothing and the ceiling could slip
     * by one with everything still green.
     */
    describe('the send retry loop', () => {
        /** Let the pending sleep and the recursive send settle. */
        async function drain(): Promise<void> {
            for (let i = 0; i < 4; i += 1) {
                await Promise.resolve();
            }
        }

        it('waits the retry delay before trying again', async () => {
            (mockWebview.postMessage as jest.Mock)
                .mockRejectedValueOnce(new Error('webview gone'))
                .mockResolvedValue(true);

            const sent = manager.sendMessage('retry-me');
            await drain();
            expect(mockWebview.postMessage).toHaveBeenCalledTimes(1);

            jest.advanceTimersByTime(TIMEOUTS.WEBVIEW_RETRY_DELAY - 1);
            await drain();
            expect(mockWebview.postMessage).toHaveBeenCalledTimes(1);

            jest.advanceTimersByTime(1);
            await drain();
            expect(mockWebview.postMessage).toHaveBeenCalledTimes(2);
            await sent;
        });

        it('gives up after the configured number of retries, and rethrows', async () => {
            (mockWebview.postMessage as jest.Mock).mockRejectedValue(new Error('webview gone'));
            const failed = jest.fn();

            const sent = manager.sendMessage('doomed').catch(failed);
            for (let attempt = 0; attempt < 6; attempt += 1) {
                await drain();
                jest.advanceTimersByTime(TIMEOUTS.WEBVIEW_RETRY_DELAY);
            }
            await drain();
            await sent;

            // The first attempt plus the three retries the default config allows.
            expect(mockWebview.postMessage).toHaveBeenCalledTimes(4);
            expect(failed).toHaveBeenCalledTimes(1);
        });
    });

    describe('the ready signal', () => {
        it('hands the ready handler the payload the webview sent', async () => {
            const handler = jest.fn();
            manager.on('__webview_ready__', handler);

            await listener()({
                id: 'w-2',
                type: '__webview_ready__',
                timestamp: Date.now(),
                payload: { stateVersion: 7 },
            } as Message);

            expect(handler).toHaveBeenCalledWith({ stateVersion: 7 });
        });

        it('ignores a second ready signal, which no longer has a handler', async () => {
            await expect(
                listener()({
                    id: 'w-2',
                    type: '__webview_ready__',
                    timestamp: Date.now(),
                } as Message),
            ).resolves.toBeUndefined();
        });
    });

    describe('onStreaming registers a handler like on does', () => {
        it('serves a message through a handler registered with onStreaming', async () => {
            const handler = jest.fn(() => 'streamed');
            manager.onStreaming('stream-me', handler);

            await listener()({
                id: 'm-1',
                type: 'stream-me',
                timestamp: Date.now(),
                expectsResponse: true,
            } as Message);

            expect(handler).toHaveBeenCalledTimes(1);
            const response = posted(mockWebview).find((m) => m.type === '__response__');
            expect(response?.payload).toBe('streamed');
        });
    });
});

describe('WebviewCommunicationManager — configuration', () => {
    afterEach(() => {
        jest.useRealTimers();
    });

    it('waits the CONFIGURED handshake budget, not the default one', async () => {
        jest.useFakeTimers();
        const mocks = setupMocks();
        const fresh = new WebviewCommunicationManager(mocks.mockPanel, {
            handshakeTimeout: TIMEOUTS.QUICK * 4,
        });
        const rejected = jest.fn();
        void fresh.initialize().catch(rejected);
        await Promise.resolve();

        await jest.advanceTimersByTimeAsync(TIMEOUTS.QUICK * 4 - 1);
        expect(rejected).not.toHaveBeenCalled();

        await jest.advanceTimersByTimeAsync(1);
        expect(rejected).toHaveBeenCalled();
    });

    it('holds a request for the CONFIGURED message budget, not a shorter one', async () => {
        jest.useFakeTimers();
        const mocks = setupMocks();
        let live: (message: Message) => void = () => {};
        (mocks.mockWebview.onDidReceiveMessage as jest.Mock).mockImplementation((l) => {
            live = l;
            return { dispose: jest.fn() };
        });
        const fresh = new WebviewCommunicationManager(mocks.mockPanel, {
            messageTimeout: TIMEOUTS.NORMAL * 2,
        });
        const init = fresh.initialize();
        await Promise.resolve();
        live({ id: 'w-1', type: '__webview_ready__', timestamp: Date.now() } as Message);
        await init;

        const settled = jest.fn();
        fresh.request('slow').then(settled, settled);

        await jest.advanceTimersByTimeAsync(TIMEOUTS.NORMAL * 2 - 1);
        expect(settled).not.toHaveBeenCalled();

        await jest.advanceTimersByTimeAsync(1);
        expect(settled).toHaveBeenCalled();
    });
});

describe('createWebviewCommunication cleans up after a failed handshake', () => {
    afterEach(() => {
        jest.useRealTimers();
    });

    it('disposes the manager and rethrows rather than returning a dead one', async () => {
        jest.useFakeTimers();
        const mocks = setupMocks();
        const disposable = { dispose: jest.fn() };
        (mocks.mockWebview.onDidReceiveMessage as jest.Mock).mockImplementation(
            (l, _thisArg, disposables: vscode.Disposable[]) => {
                disposables.push(disposable);
                void l;
                return disposable;
            },
        );

        const failure = jest.fn();
        const settled = createWebviewCommunication(mocks.mockPanel, {
            handshakeTimeout: 10,
        }).catch(failure);
        await jest.advanceTimersByTimeAsync(10);
        await settled;

        expect(failure).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Webview handshake timeout' }),
        );
        expect(disposable.dispose).toHaveBeenCalledTimes(1);
    });
});
