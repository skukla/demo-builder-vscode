/**
 * Shared test support for OpenInClaudeCommand suites.
 *
 * Extracted verbatim from openInClaude.test.ts so the split
 * `<module>.<aspect>.test.ts` files can share mock factories, the
 * `setupVscodeMocks` helper, and the action-label constants.
 *
 * NOT a `.test.ts` file, so Jest does not run it as a suite.
 *
 * Coverage (across the consuming suites):
 *  - 2 surfaces (`extension`, `terminal`) × extension installed / not-installed
 *  - Missing-extension error dialog (Install / Switch to Terminal actions)
 *  - Unified dock-to-right offer toast (`maybeOfferDockToRight`) — fires from
 *    both URI and terminal launches; atomically writes BOTH
 *    `demoBuilder.ai.dockToRight = true` AND `claudeCode.preferredLocation =
 *    'sidebar'` when accepted; dismissal / Keep current layout leave both
 *    settings untouched; flag set BEFORE the toast (race-safe)
 *  - Extension-detected offer toast (`maybeOfferExtensionSurface`) — fires on
 *    first prompt click when `surface='terminal'` + extension installed +
 *    flag unset; user choice routes the launch this click; flag set BEFORE
 *    the toast (race-safe)
 *  - Terminal find-or-spawn behavior + `claude --continue` on spawn
 *  - `launchTerminal` location selection: reads `demoBuilder.ai.dockToRight`
 *    to choose between default panel placement and
 *    `{ viewColumn: ViewColumn.Beside }`
 *  - Clipboard handoff for prompt + terminal surface
 *  - Workspace-mismatch warning (extension surface only, once-ever)
 *  - vscode.env.openExternal resolving to `false` surfaces a warning + logs
 *  - Logging assertions per decision branch
 */

import * as vscode from 'vscode';

import type { Project } from '@/types/base';

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
 * Sets up the vscode mock surface required for OpenInClaudeCommand.
 * Returns the per-test jest mocks so individual tests can assert behavior.
 */
export function setupVscodeMocks(opts: {
    surface: 'extension' | 'terminal';
    /** Engine setting. Defaults to `'claude-code'`. */
    engine?: 'claude-code';
    extensionInstalled: boolean;
    openExternalResult?: boolean;
    /**
     * Workspace folder path to expose via `vscode.workspace.workspaceFolders[0]`.
     * Defaults to `/projects/demo` so existing tests that assume workspace =
     * project keep their URI-launch expectations.
     */
    workspaceFolderPath?: string | null;
    /**
     * Existing terminals to expose via `vscode.window.terminals`. Defaults to
     * `[]` (no existing terminals; spawn a fresh one).
     */
    existingTerminals?: Array<{ name: string; exitStatus?: { code: number } | undefined }>;
    /**
     * Value of the `demoBuilder.ai.dockToRight` setting. Defaults to `false`.
     */
    dockToRight?: boolean;
    /**
     * Value of the `claudeCode.preferredLocation` setting (read-only here;
     * tests assert writes via `claudeCodeUpdateMock`). Defaults to `'panel'`.
     */
    claudeCodePreferredLocation?: string;
}): {
    getConfigMock: jest.Mock;
    configUpdateMock: jest.Mock;
    claudeCodeGetMock: jest.Mock;
    claudeCodeUpdateMock: jest.Mock;
    getExtensionMock: jest.Mock;
    openExternalMock: jest.Mock;
    createTerminalMock: jest.Mock;
    terminalShowMock: jest.Mock;
    terminalSendTextMock: jest.Mock;
    showInformationMessageMock: jest.Mock;
    showErrorMessageMock: jest.Mock;
    showWarningMessageMock: jest.Mock;
    clipboardWriteMock: jest.Mock;
    existingTerminalShowMocks: jest.Mock[];
} {
    // Default workspace = project.path so existing tests still URI-launch
    const wsPath = opts.workspaceFolderPath === undefined ? '/projects/demo' : opts.workspaceFolderPath;
    (vscode.workspace as unknown as { workspaceFolders: { uri: { fsPath: string } }[] | undefined }).workspaceFolders =
        wsPath === null ? undefined : [{ uri: { fsPath: wsPath } }];

    // demoBuilder.ai configuration mock
    const getConfigMock = jest.fn((key: string, defaultValue?: unknown) => {
        if (key === 'engine') return opts.engine ?? 'claude-code';
        if (key === 'surface') return opts.surface;
        if (key === 'dockToRight') return opts.dockToRight ?? false;
        return defaultValue;
    });
    const configUpdateMock = jest.fn().mockResolvedValue(undefined);

    // claudeCode configuration mock (for `preferredLocation` sync)
    const claudeCodeGetMock = jest.fn((key: string, defaultValue?: unknown) => {
        if (key === 'preferredLocation') return opts.claudeCodePreferredLocation ?? 'panel';
        return defaultValue;
    });
    const claudeCodeUpdateMock = jest.fn().mockResolvedValue(undefined);

    (vscode.workspace.getConfiguration as jest.Mock).mockImplementation((section: string) => {
        if (section === 'demoBuilder.ai') {
            return { get: getConfigMock, update: configUpdateMock };
        }
        if (section === 'claudeCode') {
            return { get: claudeCodeGetMock, update: claudeCodeUpdateMock };
        }
        return { get: jest.fn() };
    });

    const fakeExtension = opts.extensionInstalled
        ? { id: 'anthropic.claude-code', isActive: false, activate: jest.fn() }
        : undefined;
    const getExtensionMock = jest.fn((id: string) =>
        id === 'anthropic.claude-code' ? fakeExtension : undefined,
    );
    (vscode as unknown as { extensions: { getExtension: jest.Mock } }).extensions = {
        getExtension: getExtensionMock,
    };

    const openExternalMock = vscode.env.openExternal as jest.Mock;
    openExternalMock.mockReset();
    openExternalMock.mockResolvedValue(opts.openExternalResult ?? true);

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

    return {
        getConfigMock,
        configUpdateMock,
        claudeCodeGetMock,
        claudeCodeUpdateMock,
        getExtensionMock,
        openExternalMock,
        createTerminalMock,
        terminalShowMock,
        terminalSendTextMock,
        showInformationMessageMock,
        showErrorMessageMock,
        showWarningMessageMock,
        clipboardWriteMock,
        existingTerminalShowMocks,
    };
}

// ----------------------------------------------------------------------------
// Constants — kept in sync with src/commands/openInClaude.ts
// ----------------------------------------------------------------------------

/**
 * Same underlying globalState string as the legacy FIRST_TIP_KEY; symbol
 * was renamed to DOCK_OFFER_SHOWN_KEY but the string is preserved so
 * existing users don't see the new toast.
 */
export const DOCK_OFFER_KEY = 'demoBuilder.ai.firstClaudeOpenTipShown';
export const EXTENSION_OFFER_KEY = 'demoBuilder.ai.extensionAvailableOfferShown';

export const DOCK_ACTION_LABEL = 'Dock to right side';
export const USE_DEFAULT_LAYOUT_ACTION_LABEL = 'Use default';
export const USE_EXTENSION_ACTION_LABEL = 'Use the Extension';
export const STAY_IN_TERMINAL_ACTION_LABEL = 'Stay in Terminal';
export const OPEN_SETTINGS_ACTION_LABEL = 'Open Settings';
