/**
 * The sidebar's handshake with its webview: how long it waits, and what a
 * handshake that never arrives is allowed to take down with it.
 *
 * The webview queues everything until the extension answers its ready signal,
 * so a missed handshake is not a slow sidebar, it is an empty one. The sibling
 * suites always announce the webview at once; these do not.
 */
import { makeProvider, createMockWebviewView, type MockWebviewView } from './sidebarProvider.testUtils';

import * as vscode from 'vscode';
import type { SidebarProvider } from '@/features/sidebar/providers/sidebarProvider';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

/** Resolve the view WITHOUT the webview announcing itself. */
function resolveSilently(provider: SidebarProvider): MockWebviewView {
    const view = createMockWebviewView();
    provider.resolveWebviewView(
        view as unknown as vscode.WebviewView,
        {} as vscode.WebviewViewResolveContext,
        { isCancellationRequested: false } as vscode.CancellationToken,
    );
    return view;
}

/** The message types a webview was sent. */
function sentTypes(view: MockWebviewView): string[] {
    return view.webview.postMessage.mock.calls.map(([m]) => (m as { type: string }).type);
}

describe('SidebarProvider handshake', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    // The bundle is large and a cold window is slow: the sidebar gets the same
    // budget the panels get, not the factory's short default.
    it('still completes a handshake that arrives after the short default budget', async () => {
        const view = resolveSilently(makeProvider().provider);

        await jest.advanceTimersByTimeAsync(TIMEOUTS.QUICK + 1000);
        await view.deliver!({ type: '__webview_ready__' });

        expect(sentTypes(view)).toContain('__handshake_complete__');
    });

    it('gives up once its own budget has passed, and lets go of the listener', async () => {
        const view = resolveSilently(makeProvider().provider);

        await jest.advanceTimersByTimeAsync(TIMEOUTS.NORMAL + 1000);
        await view.deliver!({ type: '__webview_ready__' });

        expect(view.listenerDisposal).toHaveBeenCalled();
        expect(sentTypes(view)).not.toContain('__handshake_complete__');
    });

    it('can still be disposed after a handshake that never arrived', async () => {
        const view = resolveSilently(makeProvider().provider);
        await jest.advanceTimersByTimeAsync(TIMEOUTS.NORMAL + 1000);

        expect(() => view.fireDisposal!()).not.toThrow();
    });

    // VS Code can resolve the view again before the first attempt has timed
    // out. The first attempt's failure must not take the working channel.
    it('keeps the newer channel when an older handshake times out', async () => {
        const { provider } = makeProvider();
        const stale = resolveSilently(provider);
        await jest.advanceTimersByTimeAsync(10_000);

        const live = resolveSilently(provider);
        await live.deliver!({ type: '__webview_ready__' });
        await jest.advanceTimersByTimeAsync(TIMEOUTS.NORMAL);
        live.webview.postMessage.mockClear();

        await provider.sendMessage('contextUpdate', { context: { type: 'projects' } });

        expect(stale.listenerDisposal).toHaveBeenCalled();
        expect(live.webview.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'contextUpdate',
                payload: { context: { type: 'projects' } },
            }),
        );
    });
});
