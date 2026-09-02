/**
 * WRITABLE typed views of the mocked `vscode` namespaces.
 *
 * Suites drive the faked module by assigning to it — `vscode.window.terminals = []`,
 * `vscode.workspace.isTrusted = false`. The real API declares those members readonly,
 * correctly, so assignment needs a cast; the module under test is a fake, so assigning
 * is the intended way to steer it.
 *
 * The question is only WHERE the cast lives. It had been living at 34 call sites
 * across 10 files as `(vscode.window as any).createTerminal = …`, and `as any`
 * disables checking of the ENTIRE statement to reach one member — so a misspelt name
 * silently creates a new property and the test carries on passing against nothing,
 * which is the failure this whole shape invites.
 *
 * Here it is one cast per namespace, naming exactly the members the suites write.
 * A typo now fails to compile.
 *
 * THE MEMBER LISTS ARE THE MEASURED UNION, not a guess: every member actually
 * assigned anywhere in `tests/` on 2026-09-01. Adding one is fine — add it here, and
 * the compiler will tell every suite that it exists.
 */

import * as vscode from 'vscode';

export interface MockedVscodeWindow {
    terminals: vscode.Terminal[];
    createTerminal: jest.Mock;
    withProgress: jest.Mock;
    setStatusBarMessage: jest.Mock;
    showWarningMessage: jest.Mock;
    showInformationMessage: jest.Mock;
    showErrorMessage: jest.Mock;
    activeColorTheme: vscode.ColorTheme;
}

export interface MockedVscodeWorkspace {
    getConfiguration: jest.Mock;
    isTrusted: boolean;
    workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined;
}

export interface MockedVscodeCommands {
    executeCommand: jest.Mock;
}

/** `vscode.window`, as these suites write it. */
export const mockWindow = vscode.window as unknown as MockedVscodeWindow;

/** `vscode.workspace`, as these suites write it. */
export const mockWorkspace = vscode.workspace as unknown as MockedVscodeWorkspace;

/** `vscode.commands`, as these suites write it. */
export const mockCommands = vscode.commands as unknown as MockedVscodeCommands;

/**
 * A `vscode.Terminal` fake.
 *
 * The real interface carries a dozen members and suites use two — `name` to identify
 * it and `dispose` to assert teardown. No literal can satisfy the interface, so the
 * cast is unavoidable; it lives here once instead of at every `terminals = [...]`.
 */
export function createMockTerminal(
    overrides: Partial<vscode.Terminal> = {}
): vscode.Terminal & { dispose: jest.Mock } {
    return {
        name: 'demo',
        dispose: jest.fn(),
        ...overrides,
        // `dispose` is named in the return type as a MOCK: suites assert on
        // `terminal.dispose.mock.calls`, and read back through `vscode.Terminal` it
        // is a plain `() => void`.
    } as unknown as vscode.Terminal & { dispose: jest.Mock };
}
