/**
 * The canonical `vscode.WebviewPanel` fake.
 *
 * WHY IT EXISTS. The compiler asked for it: converting the HandlerContext casts on
 * 2026-09-01 left `WebviewPanel` blocking 5 files, and every hand-rolled version in
 * the corpus is `{ webview: { postMessage: jest.fn() } }` — enough for the one call
 * that suite makes, and not a WebviewPanel.
 *
 * WHAT PRODUCTION ACTUALLY TOUCHES, counted rather than guessed: `panel.webview` 28
 * times, `panel.dispose` 12, `panel.visible` 2, `panel.title` 1, `panel.onDidDispose`
 * 1. All of them are here, so a handler that disposes a panel or reads its title does
 * not die on `undefined` — a TypeError that reads like a bug in the code under test
 * rather than a hole in the fake.
 *
 * `postMessage` resolves TRUE, which is what the real one does on success. A bare
 * `jest.fn()` resolves undefined, and a caller that awaits the result and branches on
 * it takes the failure path for no reason — the shape of bug these builders exist to
 * stop.
 *
 * @param overrides - anything a suite genuinely varies.
 * @see .rptc/backlog/2026-09-01-cast-and-builder-worklog.md — section B
 */

import type * as vscode from 'vscode';

export function createMockWebviewPanel(
    overrides: Partial<vscode.WebviewPanel> = {}
): jest.Mocked<vscode.WebviewPanel> {
    return {
        webview: {
            postMessage: jest.fn().mockResolvedValue(true),
            html: '',
            options: {},
            cspSource: 'vscode-webview:',
            asWebviewUri: jest.fn((uri: unknown) => uri),
            onDidReceiveMessage: jest.fn(() => ({ dispose: jest.fn() })),
        },
        title: 'Mock Panel',
        viewType: 'mockPanel',
        visible: true,
        active: true,
        options: {},
        viewColumn: 1,
        // Both return a Disposable. A caller pushing the result into a
        // `subscriptions` array blows up on `undefined.dispose` otherwise.
        onDidDispose: jest.fn(() => ({ dispose: jest.fn() })),
        onDidChangeViewState: jest.fn(() => ({ dispose: jest.fn() })),
        reveal: jest.fn(),
        dispose: jest.fn(),
        ...overrides,
    } as unknown as jest.Mocked<vscode.WebviewPanel>;
}
