/**
 * The module wall a webview COMMAND suite needs, in one place.
 *
 * A `BaseWebviewCommand` subclass reaches three modules on the way to a panel:
 * the communication manager, the loading-HTML writer, and `vscode` itself. Two
 * suites in different features — the wizard's context test and the projects-list
 * sidebar test — carried a byte-identical 118-line copy of all three (found
 * 2026-09-02 by the clone ledger; it was the largest genuine cross-file
 * duplicate in the tree).
 *
 * IMPORTING THIS FILE REGISTERS THE MOCKS. `jest.mock` hoists above the imports
 * of the module it appears in, so the calls below run when a suite imports this
 * helper — before that suite's own imports resolve. A suite must therefore reach
 * its command through its own import placed AFTER this one, or the command binds
 * to the real `vscode`.
 *
 * The panel this hands back is deliberately NOT `createMockWebviewPanel`: that
 * builder returns a panel, and what a command suite needs is a `vscode` module
 * whose `createWebviewPanel` MINTS one and remembers the dispose callback, so a
 * test can fire disposal and watch the command clean up.
 */

jest.mock('@/core/communication/webviewCommunicationManager', () => ({
    createWebviewCommunication: jest.fn().mockResolvedValue({
        on: jest.fn(),
        onStreaming: jest.fn(),
        sendMessage: jest.fn().mockResolvedValue(undefined),
        request: jest.fn().mockResolvedValue({}),
        dispose: jest.fn(),
        incrementStateVersion: jest.fn(),
        getStateVersion: jest.fn().mockReturnValue(1),
    }),
}));

jest.mock('@/core/utils/loadingHTML', () => ({
    setLoadingState: jest.fn().mockResolvedValue(undefined),
}));

/**
 * The most recently minted panel, and the callback the command registered for
 * its disposal. Module-level because the `vscode` factory below cannot close
 * over anything a test creates later — the factory is hoisted above every
 * statement in the importing suite.
 */
let mockPanel: MintedPanel | undefined;
let mockDisposeCallback: (() => void) | undefined;

/** The shape `createWebviewPanel` mints. Loose on purpose — it stands in for a
 * `vscode.WebviewPanel`, and suites read only these members. */
export interface MintedPanel {
    webview: {
        html: string;
        postMessage: jest.Mock;
        onDidReceiveMessage: jest.Mock;
        asWebviewUri: jest.Mock;
        cspSource: string;
    };
    onDidDispose: jest.Mock;
    onDidChangeViewState: jest.Mock;
    dispose: jest.Mock;
    reveal: jest.Mock;
    visible: boolean;
}

/** The panel the command under test was handed, or undefined before it opened one. */
export function lastMintedPanel(): MintedPanel | undefined {
    return mockPanel;
}

/** Fire the disposal the command registered, as VS Code would when a user closes the tab. */
export function firePanelDisposal(): void {
    mockDisposeCallback?.();
}

/** Forget the panel between tests. Call from `beforeEach` alongside `clearAllMocks`. */
export function resetPanelState(): void {
    mockPanel = undefined;
    mockDisposeCallback = undefined;
}

