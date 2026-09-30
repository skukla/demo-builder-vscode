/**
 * Shared setup for the openUrlHandlers suites (Dev Console, AEM Assets).
 *
 * Both drive a handler whose only observable effect is the URL handed to
 * `vscode.env.openExternal`, through the shared `tests/__mocks__/vscode.ts`.
 */

import * as vscode from 'vscode';

/** The URL handed to the browser — from Uri.parse's argument, else the Uri itself. */
export function opened(): string | undefined {
    const [uri] = (vscode.env.openExternal as jest.Mock).mock.calls[0] ?? [];
    return (vscode.Uri.parse as jest.Mock).mock.calls.at(-1)?.[0] ?? (uri && String(uri));
}

/** Make every `getConfiguration(...).get(...)` read answer `value`. */
export function settingReads(value: unknown): void {
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn().mockReturnValue(value),
    });
}
