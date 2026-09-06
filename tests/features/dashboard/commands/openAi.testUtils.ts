/**
 * Shared harness for the `openAi` suite family (2 suites).
 *
 * MEASURED 2026-09-06 — the mock both suites carried, deleted from both and the
 * family re-run:
 *
 *   aiHandlers   NEEDED — the registration test fails without it
 *
 * The AI handler map is the family's real shared setup: both suites assert on
 * what the command does with it, and neither can use the production map, whose
 * membership is the thing being counted. It is a mock of a module the SUBJECT
 * imports, so it can live here — the command binds to the mocked map because
 * `jest.mock` hoists above the re-export below.
 *
 * WHAT STAYED LOCAL, and why. `openAi-execute` mocks `dispatchHandler` and
 * `handlerContextFactory`, and it IMPORTS both to assert on their arguments. A
 * `jest.mock` only hoists above the imports of the module it appears in, so
 * moved here it would apply too late and the spec would hold the real functions.
 * That is the same constraint the deployMesh family's `fs/promises` mock
 * documents.
 *
 * @see tests/sop/test-family-setup.test.ts
 */

import type * as vscode from 'vscode';

jest.mock('@/features/dashboard/handlers/aiHandlers', () => ({
    aiHandlers: {
        'verify-ai-setup': jest.fn(),
        'regenerate-ai-files': jest.fn(),
        openInClaude: jest.fn(),
    },
}));

// Below the mock on purpose — it hoists above this, so the command binds to the
// mocked handler map. `import/first` is not a registered eslint rule here.
export { ShowAiCommand } from '@/features/dashboard/commands/openAi';

/**
 * The message types the mocked map registers.
 *
 * 4 → 3: inspect-mcp removed 2026-08-05. It was registered but unreachable —
 * the AI surface has no Refresh action to send it.
 */
export const AI_MESSAGE_TYPES = ['verify-ai-setup', 'regenerate-ai-files', 'openInClaude'];

/** A panel whose webview answers the three things the command asks it. */
export function createAiPanel(): vscode.WebviewPanel {
    const webview = {
        asWebviewUri: jest.fn(
            (uri: vscode.Uri) =>
                ({
                    toString: () => `vscode-webview://authority${uri.fsPath}`,
                    fsPath: uri.fsPath,
                }) as vscode.Uri,
        ),
        cspSource: 'vscode-webview:',
        postMessage: jest.fn(),
        onDidReceiveMessage: jest.fn(),
    } as unknown as vscode.Webview;

    return {
        webview,
        dispose: jest.fn(),
        onDidDispose: jest.fn(),
        reveal: jest.fn(),
    } as unknown as vscode.WebviewPanel;
}
