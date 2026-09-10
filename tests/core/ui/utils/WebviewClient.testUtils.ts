/**
 * Shared setup for the WebviewClient suites.
 *
 * The client is a module-level SINGLETON that acquires the VS Code API and
 * registers its `message` listener the moment the module is imported, so every
 * test needs a fresh module registry and its stubs in place first. `loadClient`
 * does both and hands back the three things a test drives it with: the client,
 * the API double it posted through, and a `deliver` that plays the extension's
 * side of the channel.
 *
 * Stub ONTO the real window, never over it — jsdom's window is a real global and
 * assigning `global.window = {...}` is silently ignored (see the note in
 * WebviewClient.test.ts).
 */

import type { Message } from '@/types/messages';

export interface VSCodeApiDouble {
    postMessage: jest.Mock;
    getState: jest.Mock;
    setState: jest.Mock;
}

export interface LoadedClient {
    /** The singleton under test. */
    client: typeof import('@/core/ui/utils/WebviewClient').webviewClient;
    /** What the client posts through. */
    api: VSCodeApiDouble;
    /** Play a message from the extension into the client's window listener. */
    deliver: (data: unknown) => void;
    /** Every message posted so far, oldest first. */
    posted: () => Message[];
    /** Messages posted so far of one type. */
    postedOfType: (type: string) => Message[];
}

/** Load a fresh WebviewClient singleton with a stubbed VS Code API. */
export function loadClient(): LoadedClient {
    jest.resetModules();

    const handlers: Array<(event: MessageEvent) => void> = [];
    const api: VSCodeApiDouble = {
        postMessage: jest.fn(),
        getState: jest.fn(),
        setState: jest.fn(),
    };

    (window as unknown as { acquireVsCodeApi: unknown }).acquireVsCodeApi = jest.fn(() => api);
    jest.spyOn(window, 'addEventListener').mockImplementation(((
        event: string,
        handler: (event: MessageEvent) => void,
    ) => {
        if (event === 'message') handlers.push(handler);
    }) as typeof window.addEventListener);

    const { webviewClient } = require('@/core/ui/utils/WebviewClient');

    const posted = () => api.postMessage.mock.calls.map((c) => c[0] as Message);

    return {
        client: webviewClient,
        api,
        deliver: (data: unknown) => {
            handlers.forEach((handler) => handler({ data } as MessageEvent));
        },
        posted,
        postedOfType: (type: string) => posted().filter((m) => m.type === type),
    };
}

/** Drop the stubs a `loadClient` put on the real window. */
export function unloadClient(): void {
    delete (window as unknown as { acquireVsCodeApi?: unknown }).acquireVsCodeApi;
    jest.restoreAllMocks();
}

/** Complete the handshake so the client stops queuing. */
export function completeHandshake(loaded: LoadedClient): void {
    loaded.deliver({ id: 'hc-1', type: '__handshake_complete__', timestamp: 1 });
}
