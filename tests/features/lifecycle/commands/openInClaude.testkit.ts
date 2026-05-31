/**
 * Shared test support for OpenInClaudeCommand suites.
 *
 * Extracted from the original openInClaude.test.ts so the split
 * `<module>.<aspect>.test.ts` files share mock factories and the
 * `setupVscodeMocks` helper.
 *
 * NOT a `.test.ts` file, so Jest does not run it as a suite.
 *
 * Coverage (across the consuming suites — terminal-only):
 *  - Terminal find-or-spawn behavior + cold-start vs warm-start launch
 *  - Bracketed-paste injection on reuse
 *  - Clipboard handoff for prompt + one-time fallback tip
 *  - Logging assertions per decision branch
 */

import * as vscode from 'vscode';

import { hasConversation as hasClaudeConversation } from '@/commands/claudeSessionStore';
import type { Project } from '@/types/base';

// NOTE: each consuming test file MUST declare its own
//   `jest.mock('@/commands/claudeSessionStore', () => ({ hasConversation: jest.fn(() => false) }))`
// at the top. Jest only hoists `jest.mock` calls within a single file —
// placing the mock here would not apply to imports that already resolved
// when the testkit module loaded.

// ----------------------------------------------------------------------------
// Mock helpers
// ----------------------------------------------------------------------------

export interface MockLogger {
    info: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    debug: jest.Mock;
}

export function makeLogger(): MockLogger {
    return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

export function makeStateManager(project: Partial<Project> | null): { getCurrentProject: jest.Mock } {
    return { getCurrentProject: jest.fn().mockResolvedValue(project) };
}

export interface MockGlobalState {
    get: jest.Mock;
    update: jest.Mock;
    _store: Record<string, unknown>;
}

export function makeGlobalState(initial: Record<string, unknown> = {}): MockGlobalState {
    const store: Record<string, unknown> = { ...initial };
    return {
        _store: store,
        get: jest.fn((key: string, defaultValue?: unknown) => {
            if (key in store) {
                return store[key];
            }
            return defaultValue;
        }),
        update: jest.fn(async (key: string, value: unknown) => {
            store[key] = value;
        }),
    };
}

export function makeContext(globalState: MockGlobalState): vscode.ExtensionContext {
    return {
        globalState,
        subscriptions: [],
        extensionMode: 1,
    } as unknown as vscode.ExtensionContext;
}

export function makeProject(overrides: Partial<Project> = {}): Partial<Project> {
    return {
        name: 'demo',
        path: '/projects/demo',
        ...overrides,
    };
}

// ----------------------------------------------------------------------------
// vscode mock state setup
// ----------------------------------------------------------------------------

/**
 * Sets up the vscode mock surface required for OpenInClaudeCommand. With the
 * extension surface retired, the command only opens a terminal — the helper
 * therefore only configures terminal-related mocks (creation, find-or-spawn,
 * clipboard, message toasts).
 */
export function setupVscodeMocks(opts: {
    /** Engine setting. Defaults to `'claude-code'`. */
    engine?: 'claude-code';
    /**
     * Workspace folder path to expose via `vscode.workspace.workspaceFolders[0]`.
     * Defaults to `/projects/demo` so existing tests that assume workspace =
     * project keep their assertions intact.
     */
    workspaceFolderPath?: string | null;
    /**
     * Existing terminals to expose via `vscode.window.terminals`. Defaults to
     * `[]` (no existing terminals; spawn a fresh one).
     */
    existingTerminals?: Array<{ name: string; exitStatus?: { code: number } | undefined }>;
    /**
     * Whether a prior Claude conversation exists for the project's cwd.
     * Defaults to `false` (cold start — launch with bare `claude`).
     * Set to `true` to exercise the warm-start path (launch with
     * `claude --continue`).
     */
    hasClaudeConversation?: boolean;
} = {}): {
    getConfigMock: jest.Mock;
    configUpdateMock: jest.Mock;
    createTerminalMock: jest.Mock;
    terminalShowMock: jest.Mock;
    terminalSendTextMock: jest.Mock;
    showInformationMessageMock: jest.Mock;
    showErrorMessageMock: jest.Mock;
    showWarningMessageMock: jest.Mock;
    clipboardWriteMock: jest.Mock;
    existingTerminalShowMocks: jest.Mock[];
    hasClaudeConversationMock: jest.Mock;
} {
    // Default workspace = project.path so existing tests still pass.
    const wsPath = opts.workspaceFolderPath === undefined ? '/projects/demo' : opts.workspaceFolderPath;
    (vscode.workspace as unknown as { workspaceFolders: { uri: { fsPath: string } }[] | undefined }).workspaceFolders =
        wsPath === null ? undefined : [{ uri: { fsPath: wsPath } }];

    // demoBuilder.ai configuration mock — only `engine` survives.
    const getConfigMock = jest.fn((key: string, defaultValue?: unknown) => {
        if (key === 'engine') return opts.engine ?? 'claude-code';
        return defaultValue;
    });
    const configUpdateMock = jest.fn().mockResolvedValue(undefined);

    (vscode.workspace.getConfiguration as jest.Mock).mockImplementation((section: string) => {
        if (section === 'demoBuilder.ai') {
            return { get: getConfigMock, update: configUpdateMock };
        }
        return { get: jest.fn() };
    });

    const terminalShowMock = jest.fn();
    const terminalSendTextMock = jest.fn();
    const terminal = {
        name: '',
        show: terminalShowMock,
        sendText: terminalSendTextMock,
        dispose: jest.fn(),
    };
    const createTerminalMock = vscode.window.createTerminal as jest.Mock;
    createTerminalMock.mockReset();
    createTerminalMock.mockReturnValue(terminal);

    // Mock existing terminals (for find-or-spawn behavior)
    const existingTerminalShowMocks: jest.Mock[] = [];
    const terminalsList = (opts.existingTerminals ?? []).map(t => {
        const showMock = jest.fn();
        existingTerminalShowMocks.push(showMock);
        return {
            name: t.name,
            exitStatus: t.exitStatus,
            show: showMock,
            sendText: jest.fn(),
            dispose: jest.fn(),
        };
    });
    (vscode.window as unknown as { terminals: unknown[] }).terminals = terminalsList;

    // Mock clipboard
    const clipboardWriteMock = jest.fn().mockResolvedValue(undefined);
    (vscode.env as unknown as { clipboard: { writeText: jest.Mock } }).clipboard = {
        writeText: clipboardWriteMock,
    };

    const showInformationMessageMock = vscode.window.showInformationMessage as jest.Mock;
    showInformationMessageMock.mockReset();
    showInformationMessageMock.mockResolvedValue(undefined);

    const showErrorMessageMock = vscode.window.showErrorMessage as jest.Mock;
    showErrorMessageMock.mockReset();
    showErrorMessageMock.mockResolvedValue(undefined);

    const showWarningMessageMock = vscode.window.showWarningMessage as jest.Mock;
    showWarningMessageMock.mockReset();
    showWarningMessageMock.mockResolvedValue(undefined);

    // Configure the Claude session-store probe for this run. Default is
    // `false` (cold start); tests opt into the warm path explicitly.
    const hasClaudeConversationMock = hasClaudeConversation as jest.Mock;
    hasClaudeConversationMock.mockReset();
    hasClaudeConversationMock.mockReturnValue(opts.hasClaudeConversation ?? false);

    return {
        getConfigMock,
        configUpdateMock,
        createTerminalMock,
        terminalShowMock,
        terminalSendTextMock,
        showInformationMessageMock,
        showErrorMessageMock,
        showWarningMessageMock,
        clipboardWriteMock,
        existingTerminalShowMocks,
        hasClaudeConversationMock,
    };
}
