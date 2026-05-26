/**
 * OpenInClaudeCommand tests
 *
 * Coverage:
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

import { OpenInClaudeCommand } from '@/commands/openInClaude';
import type { Project } from '@/types/base';

// ----------------------------------------------------------------------------
// Mock helpers
// ----------------------------------------------------------------------------

interface MockLogger {
    info: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    debug: jest.Mock;
}

function makeLogger(): MockLogger {
    return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function makeStateManager(project: Partial<Project> | null): { getCurrentProject: jest.Mock } {
    return { getCurrentProject: jest.fn().mockResolvedValue(project) };
}

interface MockGlobalState {
    get: jest.Mock;
    update: jest.Mock;
    _store: Record<string, unknown>;
}

function makeGlobalState(initial: Record<string, unknown> = {}): MockGlobalState {
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

function makeContext(globalState: MockGlobalState): vscode.ExtensionContext {
    return {
        globalState,
        subscriptions: [],
        extensionMode: 1,
    } as unknown as vscode.ExtensionContext;
}

function makeProject(overrides: Partial<Project> = {}): Partial<Project> {
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
function setupVscodeMocks(opts: {
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
const DOCK_OFFER_KEY = 'demoBuilder.ai.firstClaudeOpenTipShown';
const EXTENSION_OFFER_KEY = 'demoBuilder.ai.extensionAvailableOfferShown';

const DOCK_ACTION_LABEL = 'Dock to right side';
const USE_DEFAULT_LAYOUT_ACTION_LABEL = 'Use default';
const USE_EXTENSION_ACTION_LABEL = 'Use the Extension';
const STAY_IN_TERMINAL_ACTION_LABEL = 'Stay in Terminal';
const OPEN_SETTINGS_ACTION_LABEL = 'Open Settings';

// ----------------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------------

describe('OpenInClaudeCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ------------------------------------------------------------------------
    // Surface=extension
    // ------------------------------------------------------------------------

    describe("surface='extension'", () => {
        it('URI launches when extension is installed', async () => {
            const mocks = setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.openExternalMock).toHaveBeenCalledTimes(1);
            expect(mocks.createTerminalMock).not.toHaveBeenCalled();
        });

        it("shows an error dialog with Install + Switch actions when extension is NOT installed", async () => {
            const mocks = setupVscodeMocks({ surface: 'extension', extensionInstalled: false });
            mocks.showErrorMessageMock.mockResolvedValueOnce(undefined); // user dismisses
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.showErrorMessageMock).toHaveBeenCalled();
            const args = mocks.showErrorMessageMock.mock.calls[0];
            const message = args[0] as string;
            const actionButtons = args.slice(1) as string[];
            expect(message.toLowerCase()).toMatch(/claude code/);
            expect(actionButtons).toEqual(
                expect.arrayContaining([
                    expect.stringMatching(/install/i),
                    expect.stringMatching(/terminal/i),
                ]),
            );
            // No launch happened (user dismissed)
            expect(mocks.openExternalMock).not.toHaveBeenCalled();
            expect(mocks.createTerminalMock).not.toHaveBeenCalled();
        });

        it("Install action opens the marketplace entry for the Claude Code extension", async () => {
            const mocks = setupVscodeMocks({ surface: 'extension', extensionInstalled: false });
            mocks.showErrorMessageMock.mockResolvedValueOnce('Install Claude Code Extension');
            const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            executeCommandMock.mockResolvedValue(undefined);

            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(executeCommandMock).toHaveBeenCalledWith('extension.open', 'anthropic.claude-code');
        });

        it("Switch to Terminal Mode action updates the setting AND launches the terminal", async () => {
            const mocks = setupVscodeMocks({ surface: 'extension', extensionInstalled: false });
            mocks.showErrorMessageMock.mockResolvedValueOnce('Switch to Terminal Mode');

            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.configUpdateMock).toHaveBeenCalledWith(
                'surface',
                'terminal',
                expect.anything(),
            );
            // Terminal launches after the switch
            expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
            expect(mocks.terminalSendTextMock).toHaveBeenCalledWith('claude --continue');
        });
    });

    // ------------------------------------------------------------------------
    // Workspace anchoring (extension-mode mismatch warning)
    // ------------------------------------------------------------------------

    describe('workspace anchoring', () => {
        it('extension mode shows a one-time mismatch warning when workspace !== project, then URI-launches anyway', async () => {
            const mocks = setupVscodeMocks({
                surface: 'extension',
                extensionInstalled: true,
                workspaceFolderPath: '/some/other/repo',
            });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            // Warning toast surfaces the trade-off the user implicitly accepted
            expect(mocks.showWarningMessageMock).toHaveBeenCalled();
            const warningText = mocks.showWarningMessageMock.mock.calls[0][0] as string;
            expect(warningText.toLowerCase()).toMatch(/(workspace|project context)/);

            // URI launch still happens — user explicitly forced extension mode
            expect(mocks.openExternalMock).toHaveBeenCalledTimes(1);
            expect(mocks.createTerminalMock).not.toHaveBeenCalled();
        });

        it('extension mode does NOT warn when workspace === project.path', async () => {
            const mocks = setupVscodeMocks({
                surface: 'extension',
                extensionInstalled: true,
                workspaceFolderPath: '/projects/demo',
            });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.showWarningMessageMock).not.toHaveBeenCalled();
            expect(mocks.openExternalMock).toHaveBeenCalledTimes(1);
        });

        it('extension mode warning fires only once ever (persistent globalState)', async () => {
            const mocks = setupVscodeMocks({
                surface: 'extension',
                extensionInstalled: true,
                workspaceFolderPath: '/some/other/repo',
            });
            const globalState = makeGlobalState();
            const command = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);
            await command.execute(makeProject() as Project);

            // Only one warning across two invocations
            expect(mocks.showWarningMessageMock).toHaveBeenCalledTimes(1);
            // Both URI launches still happen
            expect(mocks.openExternalMock).toHaveBeenCalledTimes(2);
        });
    });

    // ------------------------------------------------------------------------
    // Surface=terminal
    // ------------------------------------------------------------------------

    describe("surface='terminal'", () => {
        it('forces terminal launch when extension is NOT installed', async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.openExternalMock).not.toHaveBeenCalled();
            expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
        });

        it('uses `claude --continue` instead of plain `claude`', async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.terminalSendTextMock).toHaveBeenCalledWith('claude --continue');
        });
    });

    // ------------------------------------------------------------------------
    // Terminal find-or-spawn
    // ------------------------------------------------------------------------

    describe('terminal find-or-spawn', () => {
        it('reuses an existing live "Claude Code" terminal instead of spawning a new one', async () => {
            const mocks = setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: false,
                existingTerminals: [{ name: 'Claude Code', exitStatus: undefined }],
            });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            // Did NOT spawn a new terminal
            expect(mocks.createTerminalMock).not.toHaveBeenCalled();
            // Focused the existing one
            expect(mocks.existingTerminalShowMocks[0]).toHaveBeenCalled();
            // Did NOT re-run claude in the existing terminal
            expect(mocks.terminalSendTextMock).not.toHaveBeenCalled();
        });

        it('spawns a new terminal if the only matching terminal has exited', async () => {
            const mocks = setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: false,
                existingTerminals: [{ name: 'Claude Code', exitStatus: { code: 0 } }],
            });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
            expect(mocks.terminalSendTextMock).toHaveBeenCalledWith('claude --continue');
        });

        it('ignores terminals with non-matching names', async () => {
            const mocks = setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: false,
                existingTerminals: [{ name: 'bash', exitStatus: undefined }, { name: 'zsh', exitStatus: undefined }],
            });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
        });
    });

    // ------------------------------------------------------------------------
    // Terminal + prompt: clipboard handoff
    // ------------------------------------------------------------------------

    describe('terminal mode + prompt: clipboard handoff', () => {
        // Spawn-case prompt clicks schedule a setTimeout for bracketed-paste
        // injection. Use fake timers so the timer doesn't leak past the test.
        beforeEach(() => {
            jest.useFakeTimers();
        });
        afterEach(() => {
            jest.runOnlyPendingTimers();
            jest.useRealTimers();
        });

        it('writes the prompt to the clipboard before launching the terminal', async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute({ project: makeProject() as Project, prompt: 'do the thing' });

            expect(mocks.clipboardWriteMock).toHaveBeenCalledWith('do the thing');
        });

        it('shows the soft "prompt sent + clipboard fallback" tip on first terminal-mode prompt click', async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute({ project: makeProject() as Project, prompt: 'do the thing' });

            // Find the clipboard-fallback tip — references sending to Claude AND mentions clipboard fallback
            const tipCall = mocks.showInformationMessageMock.mock.calls.find(c =>
                /clipboard/i.test(String(c[0])) && /sent to claude/i.test(String(c[0])),
            );
            expect(tipCall).toBeDefined();
        });

        it('does NOT write clipboard when no prompt is provided', async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.clipboardWriteMock).not.toHaveBeenCalled();
        });
    });

    // ------------------------------------------------------------------------
    // Bracketed-paste injection (reuse + spawn) + clipboard-fallback tip
    // ------------------------------------------------------------------------

    describe('bracketed-paste prompt injection', () => {
        const PASTE_START = '[200~';
        const PASTE_END = '[201~';
        const CLIPBOARD_TIP_KEY = 'demoBuilder.ai.clipboardFallbackTipShown';
        const SPAWN_INJECT_DELAY_MS = 800;

        // The spawn-case uses setTimeout for the delayed inject. Fake timers
        // let us advance time deterministically without leaking real timers.
        beforeEach(() => {
            jest.useFakeTimers();
        });
        afterEach(() => {
            jest.runOnlyPendingTimers();
            jest.useRealTimers();
        });

        it('reuse case: injects the prompt via sendSequence immediately (no setTimeout)', async () => {
            const mocks = setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: false,
                existingTerminals: [{ name: 'Claude Code', exitStatus: undefined }],
            });
            const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            executeCommandMock.mockClear();
            executeCommandMock.mockResolvedValue(undefined);
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute({ project: makeProject() as Project, prompt: 'hello world' });

            const sendSequenceCall = executeCommandMock.mock.calls.find(c =>
                c[0] === 'workbench.action.terminal.sendSequence',
            );
            expect(sendSequenceCall).toBeDefined();
            const payload = sendSequenceCall![1] as { text: string };
            expect(payload.text).toBe(PASTE_START + 'hello world' + PASTE_END);
            // No spawn — createTerminal not called
            expect(mocks.createTerminalMock).not.toHaveBeenCalled();
        });

        it('spawn case: injects the prompt after a delay (waits for claude to bootstrap)', async () => {
            setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
            const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            executeCommandMock.mockClear();
            executeCommandMock.mockResolvedValue(undefined);
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute({ project: makeProject() as Project, prompt: 'spawn-time prompt' });

            // No inject yet — the spawn-inject is scheduled, not fired
            let sendSequenceCall = executeCommandMock.mock.calls.find(c =>
                c[0] === 'workbench.action.terminal.sendSequence',
            );
            expect(sendSequenceCall).toBeUndefined();

            // Advance past the delay
            jest.advanceTimersByTime(SPAWN_INJECT_DELAY_MS);

            sendSequenceCall = executeCommandMock.mock.calls.find(c =>
                c[0] === 'workbench.action.terminal.sendSequence',
            );
            expect(sendSequenceCall).toBeDefined();
            const payload = sendSequenceCall![1] as { text: string };
            expect(payload.text).toBe(PASTE_START + 'spawn-time prompt' + PASTE_END);
        });

        it('spawn case: skips inject if the terminal has exited before the delay fires', async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
            const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            executeCommandMock.mockClear();
            executeCommandMock.mockResolvedValue(undefined);
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute({ project: makeProject() as Project, prompt: 'spawn prompt' });

            // Simulate the terminal exiting (kill -9 / window close / whatever)
            const spawnedTerminal = mocks.createTerminalMock.mock.results[0]?.value as {
                exitStatus?: unknown;
            };
            spawnedTerminal.exitStatus = { code: 0 };

            // Advance past the delay — inject should be skipped
            jest.advanceTimersByTime(SPAWN_INJECT_DELAY_MS);

            const sendSequenceCall = executeCommandMock.mock.calls.find(c =>
                c[0] === 'workbench.action.terminal.sendSequence',
            );
            expect(sendSequenceCall).toBeUndefined();
        });

        it('multi-line prompt: bracketed-paste markers wrap the whole block (including newlines)', async () => {
            setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: false,
                existingTerminals: [{ name: 'Claude Code', exitStatus: undefined }],
            });
            const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            executeCommandMock.mockClear();
            executeCommandMock.mockResolvedValue(undefined);
            const multiLine = 'line one\nline two\nline three';
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute({ project: makeProject() as Project, prompt: multiLine });

            const sendSequenceCall = executeCommandMock.mock.calls.find(c =>
                c[0] === 'workbench.action.terminal.sendSequence',
            );
            expect(sendSequenceCall).toBeDefined();
            const payload = sendSequenceCall![1] as { text: string };
            // Whole multi-line block is wrapped — newlines stay inside the brackets
            expect(payload.text).toBe(PASTE_START + multiLine + PASTE_END);
            // Verify newlines were preserved (not stripped)
            expect(payload.text).toContain('\n');
        });

        it('clipboard-fallback tip fires once-ever (gated by globalState flag)', async () => {
            const mocks = setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: false,
                existingTerminals: [{ name: 'Claude Code', exitStatus: undefined }],
            });
            const globalState = makeGlobalState();
            const command = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute({ project: makeProject() as Project, prompt: 'first' });

            // First click — tip shown, flag set
            const firstTipCalls = mocks.showInformationMessageMock.mock.calls.filter(c =>
                /sent to claude/i.test(String(c[0])),
            );
            expect(firstTipCalls.length).toBe(1);
            expect(globalState.update).toHaveBeenCalledWith(CLIPBOARD_TIP_KEY, true);

            // Second click — flag already set, tip should NOT fire again
            mocks.showInformationMessageMock.mockClear();
            (globalState.get as jest.Mock).mockImplementation((key: string, fallback?: unknown) => {
                if (key === CLIPBOARD_TIP_KEY) return true;
                return fallback;
            });
            await command.execute({ project: makeProject() as Project, prompt: 'second' });
            const secondTipCalls = mocks.showInformationMessageMock.mock.calls.filter(c =>
                /sent to claude/i.test(String(c[0])),
            );
            expect(secondTipCalls.length).toBe(0);
        });

        it('does NOT inject anything when no prompt is provided', async () => {
            setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: false,
                existingTerminals: [{ name: 'Claude Code', exitStatus: undefined }],
            });
            const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            executeCommandMock.mockClear();
            executeCommandMock.mockResolvedValue(undefined);
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const sendSequenceCall = executeCommandMock.mock.calls.find(c =>
                c[0] === 'workbench.action.terminal.sendSequence',
            );
            expect(sendSequenceCall).toBeUndefined();
        });
    });

    // ------------------------------------------------------------------------
    // Dock-to-right offer toast — extension launch context
    // ------------------------------------------------------------------------

    describe("dock offer toast (extension-context)", () => {
        it('first successful URI launch sets the dock-offer flag BEFORE showing the toast', async () => {
            const mocks = setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            const globalState = makeGlobalState();
            const command = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(globalState.update).toHaveBeenCalledWith(DOCK_OFFER_KEY, true);
            // The toast must be the dock-offer (with 2 buttons)
            const dockCall = mocks.showInformationMessageMock.mock.calls.find(c =>
                c.slice(1).some(b => String(b) === DOCK_ACTION_LABEL),
            );
            expect(dockCall).toBeDefined();

            // update must have been called before showInformationMessage(dockCall)
            const updateOrder = (globalState.update as jest.Mock).mock.invocationCallOrder[0];
            const infoOrder = (mocks.showInformationMessageMock as jest.Mock).mock.invocationCallOrder[0];
            expect(updateOrder).toBeLessThan(infoOrder);
        });

        it('toast wording mentions editor tab + right side for extension-context', async () => {
            const mocks = setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const dockCall = mocks.showInformationMessageMock.mock.calls.find(c =>
                c.slice(1).some(b => String(b) === DOCK_ACTION_LABEL),
            );
            expect(dockCall).toBeDefined();
            const body = String(dockCall![0]).toLowerCase();
            // Predictive wording — describes what dock-right actually does:
            // chats in a right editor split + sessions browser in the sidebar.
            expect(body).toMatch(/right/);
            expect(body).toMatch(/editor split/);
            expect(body).toMatch(/sessions browser/);
            // Has both buttons
            const buttons = dockCall!.slice(1).map(String);
            expect(buttons).toEqual(expect.arrayContaining([DOCK_ACTION_LABEL, USE_DEFAULT_LAYOUT_ACTION_LABEL]));
        });

        it('clicking "Dock to right side" writes BOTH dockToRight=true AND preferredLocation=sidebar atomically', async () => {
            const mocks = setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            mocks.showInformationMessageMock.mockResolvedValueOnce(DOCK_ACTION_LABEL);

            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.configUpdateMock).toHaveBeenCalledWith(
                'dockToRight',
                true,
                vscode.ConfigurationTarget.Global,
            );
            expect(mocks.claudeCodeUpdateMock).toHaveBeenCalledWith(
                'preferredLocation',
                'sidebar',
                vscode.ConfigurationTarget.Global,
            );
        });

        it('clicking "Use default" writes dockToRight=false explicitly (persists choice) and leaves claudeCode.preferredLocation alone', async () => {
            const mocks = setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            mocks.showInformationMessageMock.mockResolvedValueOnce(USE_DEFAULT_LAYOUT_ACTION_LABEL);

            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            // dockToRight=false is written explicitly — persists the user's intent
            // so a future package.json default flip wouldn't override their choice.
            expect(mocks.configUpdateMock).toHaveBeenCalledWith(
                'dockToRight',
                false,
                vscode.ConfigurationTarget.Global,
            );
            // We do NOT touch claudeCode.preferredLocation — user may have set it
            // for their own reasons; "use default" only writes our own setting.
            expect(mocks.claudeCodeUpdateMock).not.toHaveBeenCalled();
        });

        it('dismissal writes NEITHER setting', async () => {
            const mocks = setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            mocks.showInformationMessageMock.mockResolvedValueOnce(undefined);

            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const dockUpdateCall = mocks.configUpdateMock.mock.calls.find(c => c[0] === 'dockToRight');
            expect(dockUpdateCall).toBeUndefined();
            expect(mocks.claudeCodeUpdateMock).not.toHaveBeenCalled();
        });

        it('subsequent URI launches do NOT show the dock toast again', async () => {
            const mocks = setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            const globalState = makeGlobalState({ [DOCK_OFFER_KEY]: true });
            const command = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.openExternalMock).toHaveBeenCalledTimes(1);
            const dockCall = mocks.showInformationMessageMock.mock.calls.find(c =>
                c.slice(1).some(b => String(b) === DOCK_ACTION_LABEL),
            );
            expect(dockCall).toBeUndefined();
        });

        it('two URI launches in quick succession only show the dock toast once (race-safe)', async () => {
            const mocks = setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            const globalState = makeGlobalState();
            const command = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);
            await command.execute(makeProject() as Project);

            expect(mocks.openExternalMock).toHaveBeenCalledTimes(2);
            const dockCalls = mocks.showInformationMessageMock.mock.calls.filter(c =>
                c.slice(1).some(b => String(b) === DOCK_ACTION_LABEL),
            );
            expect(dockCalls.length).toBe(1);
        });

        it('dock toast fires BEFORE openExternal so the launch lands at the chosen location', async () => {
            const mocks = setupVscodeMocks({
                surface: 'extension',
                extensionInstalled: true,
            });
            // User picks "Use default" — covers the fire-before-launch order
            mocks.showInformationMessageMock.mockResolvedValueOnce(USE_DEFAULT_LAYOUT_ACTION_LABEL);
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            // Dock toast fired
            const dockCallIdx = mocks.showInformationMessageMock.mock.calls.findIndex(c =>
                c.slice(1).some(b => String(b) === DOCK_ACTION_LABEL),
            );
            expect(dockCallIdx).toBeGreaterThanOrEqual(0);
            // openExternal also fired (the launch happened after the toast)
            expect(mocks.openExternalMock).toHaveBeenCalled();
            // Ordering: dock toast resolved before openExternal was invoked
            const dockOrder = mocks.showInformationMessageMock.mock.invocationCallOrder[dockCallIdx];
            const openExternalOrder = mocks.openExternalMock.mock.invocationCallOrder[0];
            expect(dockOrder).toBeLessThan(openExternalOrder);
        });

        it('does NOT fire when dockToRight is already true', async () => {
            const mocks = setupVscodeMocks({
                surface: 'extension',
                extensionInstalled: true,
                dockToRight: true,
            });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const dockCall = mocks.showInformationMessageMock.mock.calls.find(c =>
                c.slice(1).some(b => String(b) === DOCK_ACTION_LABEL),
            );
            expect(dockCall).toBeUndefined();
        });
    });

    // ------------------------------------------------------------------------
    // Dock-to-right offer toast — terminal launch context
    // ------------------------------------------------------------------------

    describe("dock offer toast (terminal-context)", () => {
        it('toast wording mentions bottom panel terminal + right side for terminal-context', async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const dockCall = mocks.showInformationMessageMock.mock.calls.find(c =>
                c.slice(1).some(b => String(b) === DOCK_ACTION_LABEL),
            );
            expect(dockCall).toBeDefined();
            const body = String(dockCall![0]).toLowerCase();
            // Predictive wording — references the terminal and bottom-panel default
            expect(body).toMatch(/terminal/);
            expect(body).toMatch(/bottom panel/);
            expect(body).toMatch(/right/);
            const buttons = dockCall!.slice(1).map(String);
            expect(buttons).toEqual(expect.arrayContaining([DOCK_ACTION_LABEL, USE_DEFAULT_LAYOUT_ACTION_LABEL]));
        });

        it('terminal launch sets the dock-offer flag BEFORE showing the toast', async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
            const globalState = makeGlobalState();
            const command = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(globalState.update).toHaveBeenCalledWith(DOCK_OFFER_KEY, true);
            // Flag-write must precede toast-show
            const updateCalls = (globalState.update as jest.Mock).mock.calls;
            const flagIdx = updateCalls.findIndex(c => c[0] === DOCK_OFFER_KEY);
            expect(flagIdx).toBeGreaterThanOrEqual(0);
            const flagOrder = (globalState.update as jest.Mock).mock.invocationCallOrder[flagIdx];
            const dockCallIdx = mocks.showInformationMessageMock.mock.calls.findIndex(c =>
                c.slice(1).some(b => String(b) === DOCK_ACTION_LABEL),
            );
            const dockOrder = (mocks.showInformationMessageMock as jest.Mock).mock.invocationCallOrder[dockCallIdx];
            expect(flagOrder).toBeLessThan(dockOrder);
        });

        it('clicking "Dock to right side" in terminal context writes BOTH settings', async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
            // showInformationMessage returns DOCK_ACTION_LABEL — but we may also get the
            // clipboard toast first if a prompt is provided; here no prompt → only dock toast
            mocks.showInformationMessageMock.mockResolvedValueOnce(DOCK_ACTION_LABEL);
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.configUpdateMock).toHaveBeenCalledWith(
                'dockToRight',
                true,
                vscode.ConfigurationTarget.Global,
            );
            expect(mocks.claudeCodeUpdateMock).toHaveBeenCalledWith(
                'preferredLocation',
                'sidebar',
                vscode.ConfigurationTarget.Global,
            );
        });

        it('dock toast fires regardless of reuse-vs-spawn (gated by flag, not by launch outcome)', async () => {
            // Pre-existing terminal: launch will reuse, not spawn. The dock toast
            // still fires because it's a layout preference asked once-ever via flag.
            const mocks = setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: false,
                existingTerminals: [{ name: 'Claude Code', exitStatus: undefined }],
            });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const dockCall = mocks.showInformationMessageMock.mock.calls.find(c =>
                c.slice(1).some(b => String(b) === DOCK_ACTION_LABEL),
            );
            expect(dockCall).toBeDefined();
        });
    });

    // ------------------------------------------------------------------------
    // launchTerminal location selection
    // ------------------------------------------------------------------------

    describe('launchTerminal location selection', () => {
        it('when dockToRight=true, createTerminal is called with location: { viewColumn: ViewColumn.Beside }', async () => {
            const mocks = setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: false,
                dockToRight: true,
            });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
            const createArg = mocks.createTerminalMock.mock.calls[0][0];
            expect(createArg).toMatchObject({
                name: 'Claude Code',
                cwd: '/projects/demo',
                location: { viewColumn: vscode.ViewColumn.Beside },
            });
        });

        it('when dockToRight=false, createTerminal is called WITHOUT location property', async () => {
            const mocks = setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: false,
                dockToRight: false,
            });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
            const createArg = mocks.createTerminalMock.mock.calls[0][0];
            expect(createArg.location).toBeUndefined();
        });
    });

    // ------------------------------------------------------------------------
    // Extension-detected offer toast
    // ------------------------------------------------------------------------

    describe('extension-detected offer toast', () => {
        it("fires when surface='terminal' + extension installed + flag unset", async () => {
            const mocks = setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: true,
            });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const offerCall = mocks.showInformationMessageMock.mock.calls.find(c =>
                c.slice(1).some(b => String(b) === USE_EXTENSION_ACTION_LABEL),
            );
            expect(offerCall).toBeDefined();
            const buttons = offerCall!.slice(1).map(String);
            expect(buttons).toEqual(
                expect.arrayContaining([USE_EXTENSION_ACTION_LABEL, STAY_IN_TERMINAL_ACTION_LABEL]),
            );
        });

        it('does NOT fire when extension is missing', async () => {
            const mocks = setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: false,
            });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const offerCall = mocks.showInformationMessageMock.mock.calls.find(c =>
                c.slice(1).some(b => String(b) === USE_EXTENSION_ACTION_LABEL),
            );
            expect(offerCall).toBeUndefined();
            // Terminal launch proceeded
            expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
        });

        it("does NOT fire when surface='extension'", async () => {
            const mocks = setupVscodeMocks({
                surface: 'extension',
                extensionInstalled: true,
            });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const offerCall = mocks.showInformationMessageMock.mock.calls.find(c =>
                c.slice(1).some(b => String(b) === USE_EXTENSION_ACTION_LABEL),
            );
            expect(offerCall).toBeUndefined();
            // URI launch proceeded
            expect(mocks.openExternalMock).toHaveBeenCalledTimes(1);
        });

        it('does NOT fire when the flag is already set', async () => {
            const mocks = setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: true,
            });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState({ [EXTENSION_OFFER_KEY]: true })),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const offerCall = mocks.showInformationMessageMock.mock.calls.find(c =>
                c.slice(1).some(b => String(b) === USE_EXTENSION_ACTION_LABEL),
            );
            expect(offerCall).toBeUndefined();
            // Terminal launch proceeded
            expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
        });

        it('flag is set BEFORE the toast displays (race-safe)', async () => {
            const mocks = setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: true,
            });
            const globalState = makeGlobalState();
            const command = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const updateCalls = (globalState.update as jest.Mock).mock.calls;
            const offerFlagIdx = updateCalls.findIndex(c => c[0] === EXTENSION_OFFER_KEY);
            expect(offerFlagIdx).toBeGreaterThanOrEqual(0);
            const flagOrder = (globalState.update as jest.Mock).mock.invocationCallOrder[offerFlagIdx];
            const offerCallIdx = mocks.showInformationMessageMock.mock.calls.findIndex(c =>
                c.slice(1).some(b => String(b) === USE_EXTENSION_ACTION_LABEL),
            );
            const offerOrder = (mocks.showInformationMessageMock as jest.Mock).mock.invocationCallOrder[offerCallIdx];
            expect(flagOrder).toBeLessThan(offerOrder);
        });

        it('"Use the Extension" writes surface=extension AND re-dispatches via URI launch this click', async () => {
            const mocks = setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: true,
            });
            mocks.showInformationMessageMock.mockResolvedValueOnce(USE_EXTENSION_ACTION_LABEL);

            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            // surface written
            expect(mocks.configUpdateMock).toHaveBeenCalledWith(
                'surface',
                'extension',
                vscode.ConfigurationTarget.Global,
            );
            // URI launched, terminal did NOT
            expect(mocks.openExternalMock).toHaveBeenCalledTimes(1);
            expect(mocks.createTerminalMock).not.toHaveBeenCalled();
        });

        it('"Stay in Terminal" leaves surface unchanged AND launches the terminal', async () => {
            const mocks = setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: true,
            });
            mocks.showInformationMessageMock.mockResolvedValueOnce(STAY_IN_TERMINAL_ACTION_LABEL);

            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            // surface NOT written
            const surfaceWriteCall = mocks.configUpdateMock.mock.calls.find(c => c[0] === 'surface');
            expect(surfaceWriteCall).toBeUndefined();
            // Terminal launched, URI did NOT
            expect(mocks.openExternalMock).not.toHaveBeenCalled();
            expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
        });

        it('dismissal leaves surface unchanged AND launches the terminal', async () => {
            const mocks = setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: true,
            });
            mocks.showInformationMessageMock.mockResolvedValueOnce(undefined);

            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const surfaceWriteCall = mocks.configUpdateMock.mock.calls.find(c => c[0] === 'surface');
            expect(surfaceWriteCall).toBeUndefined();
            expect(mocks.openExternalMock).not.toHaveBeenCalled();
            expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
        });

        it('"Open Settings" opens the demoBuilder.ai.surface settings filter without changing the surface', async () => {
            const mocks = setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: true,
            });
            mocks.showInformationMessageMock.mockResolvedValueOnce(OPEN_SETTINGS_ACTION_LABEL);
            const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            executeCommandMock.mockClear();
            executeCommandMock.mockResolvedValue(undefined);

            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            // executeCommand was called to open settings with the surface filter
            expect(executeCommandMock).toHaveBeenCalledWith(
                'workbench.action.openSettings',
                'demoBuilder.ai.surface',
            );
            // Surface was NOT changed
            const surfaceWriteCall = mocks.configUpdateMock.mock.calls.find(c => c[0] === 'surface');
            expect(surfaceWriteCall).toBeUndefined();
            // Click falls through with current surface — terminal launches
            expect(mocks.openExternalMock).not.toHaveBeenCalled();
            expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
        });

        it('toast offers Open Settings as a third action with title-case wording', async () => {
            const mocks = setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: true,
            });
            mocks.showInformationMessageMock.mockResolvedValueOnce(STAY_IN_TERMINAL_ACTION_LABEL);

            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const calls = mocks.showInformationMessageMock.mock.calls;
            const extensionOfferCall = calls.find(c =>
                typeof c[0] === 'string' && c[0].includes('The Claude Code extension is installed'),
            );
            expect(extensionOfferCall).toBeDefined();
            // Three action labels are passed after the message
            expect(extensionOfferCall).toContain(USE_EXTENSION_ACTION_LABEL);
            expect(extensionOfferCall).toContain(STAY_IN_TERMINAL_ACTION_LABEL);
            expect(extensionOfferCall).toContain(OPEN_SETTINGS_ACTION_LABEL);
            // Body no longer references the raw setting key
            expect(extensionOfferCall![0]).not.toMatch(/demoBuilder\.ai\.surface/);
        });
    });

    // ------------------------------------------------------------------------
    // Cross-surface flag behavior
    // ------------------------------------------------------------------------

    describe('AI onboarding completion flag', () => {
        const AI_ONBOARDING_COMPLETED_KEY = 'demoBuilder.ai.onboardingCompleted';

        it('sets the flag after both offers settle (terminal-surface launch)', async () => {
            setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
            const globalState = makeGlobalState();
            const command = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(globalState.update).toHaveBeenCalledWith(AI_ONBOARDING_COMPLETED_KEY, true);
        });

        it('sets the flag after both offers settle (extension-surface launch)', async () => {
            setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            executeCommandMock.mockClear();
            executeCommandMock.mockResolvedValue(undefined);
            const globalState = makeGlobalState();
            const command = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(globalState.update).toHaveBeenCalledWith(AI_ONBOARDING_COMPLETED_KEY, true);
        });

        it('flag-write happens BEFORE the launch (so the AI dashboard reflects completion immediately after the launch returns)', async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
            const globalState = makeGlobalState();
            const command = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const updateCalls = (globalState.update as jest.Mock).mock.calls;
            const onboardingIdx = updateCalls.findIndex(c => c[0] === AI_ONBOARDING_COMPLETED_KEY);
            expect(onboardingIdx).toBeGreaterThanOrEqual(0);
            const onboardingOrder = (globalState.update as jest.Mock).mock.invocationCallOrder[onboardingIdx];
            // Terminal spawn is the launch — its createTerminal call comes
            // after the onboarding flag write.
            const createTerminalOrder = mocks.createTerminalMock.mock.invocationCallOrder[0];
            expect(onboardingOrder).toBeLessThan(createTerminalOrder);
        });
    });

    describe('cross-surface dock-offer flag', () => {
        it('terminal launch sets the dock-offer flag; subsequent extension-surface click does NOT re-show', async () => {
            // First call — terminal surface, accept the dock offer
            const mocksA = setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: false,
            });
            mocksA.showInformationMessageMock.mockResolvedValueOnce(DOCK_ACTION_LABEL);
            const globalState = makeGlobalState();
            const commandA = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await commandA.execute(makeProject() as Project);

            // Dock toast fired (terminal context)
            const dockCallA = mocksA.showInformationMessageMock.mock.calls.find(c =>
                c.slice(1).some(b => String(b) === DOCK_ACTION_LABEL),
            );
            expect(dockCallA).toBeDefined();
            // Flag now set
            expect(globalState._store[DOCK_OFFER_KEY]).toBe(true);

            // Second call — extension surface; share the same globalState
            const mocksB = setupVscodeMocks({
                surface: 'extension',
                extensionInstalled: true,
            });
            const commandB = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await commandB.execute(makeProject() as Project);

            // Dock toast did NOT fire again
            const dockCallB = mocksB.showInformationMessageMock.mock.calls.find(c =>
                c.slice(1).some(b => String(b) === DOCK_ACTION_LABEL),
            );
            expect(dockCallB).toBeUndefined();
            expect(mocksB.openExternalMock).toHaveBeenCalledTimes(1);
        });
    });

    // ------------------------------------------------------------------------
    // Sessions browser auto-open (post-launch, extension surface only)
    // ------------------------------------------------------------------------

    describe('sessions browser auto-open', () => {
        const SESSIONS_BROWSER_AUTO_SHOWN_KEY = 'demoBuilder.ai.sessionsBrowserAutoShown';

        it('fires after a successful URI launch when extension installed + flag unset', async () => {
            setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            executeCommandMock.mockClear();
            executeCommandMock.mockResolvedValue(undefined);
            const globalState = makeGlobalState();
            const command = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            // Primary focus command was called
            expect(executeCommandMock).toHaveBeenCalledWith(
                'workbench.view.extension.claude-sessions-sidebar',
            );
            // Flag was set after successful open
            expect(globalState.update).toHaveBeenCalledWith(
                SESSIONS_BROWSER_AUTO_SHOWN_KEY,
                true,
            );
        });

        it('does NOT fire on terminal launch (avoids mixed-surface UX)', async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: true });
            const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            executeCommandMock.mockClear();
            executeCommandMock.mockResolvedValue(undefined);
            // First toast (extension-detected offer): user picks Stay in Terminal
            mocks.showInformationMessageMock.mockResolvedValueOnce(STAY_IN_TERMINAL_ACTION_LABEL);
            const globalState = makeGlobalState();
            const command = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            // Sessions browser was NOT opened
            const sessionsCall = executeCommandMock.mock.calls.find(c =>
                c[0] === 'workbench.view.extension.claude-sessions-sidebar'
                || c[0] === 'claudeVSCodeSessionsList.focus',
            );
            expect(sessionsCall).toBeUndefined();
            // Flag was NOT set
            const flagWrite = (globalState.update as jest.Mock).mock.calls.find(c =>
                c[0] === SESSIONS_BROWSER_AUTO_SHOWN_KEY,
            );
            expect(flagWrite).toBeUndefined();
        });

        it('does NOT fire when the flag is already set', async () => {
            setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            executeCommandMock.mockClear();
            executeCommandMock.mockResolvedValue(undefined);
            // Flag already set (this user has already had the auto-open fire)
            const globalState = makeGlobalState({
                [SESSIONS_BROWSER_AUTO_SHOWN_KEY]: true,
            });
            const command = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const sessionsCall = executeCommandMock.mock.calls.find(c =>
                c[0] === 'workbench.view.extension.claude-sessions-sidebar',
            );
            expect(sessionsCall).toBeUndefined();
        });

        it('falls back to claudeVSCodeSessionsList.focus when primary command throws', async () => {
            setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            executeCommandMock.mockClear();
            executeCommandMock.mockImplementation(async (cmd: string) => {
                if (cmd === 'workbench.view.extension.claude-sessions-sidebar') {
                    throw new Error('container not found');
                }
                return undefined;
            });
            const globalState = makeGlobalState();
            const command = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            // Both commands attempted
            expect(executeCommandMock).toHaveBeenCalledWith(
                'workbench.view.extension.claude-sessions-sidebar',
            );
            expect(executeCommandMock).toHaveBeenCalledWith('claudeVSCodeSessionsList.focus');
            // Flag set after fallback succeeds
            expect(globalState.update).toHaveBeenCalledWith(
                SESSIONS_BROWSER_AUTO_SHOWN_KEY,
                true,
            );
        });

        it('leaves flag unset when BOTH primary and fallback commands fail (retry next launch)', async () => {
            setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            executeCommandMock.mockClear();
            executeCommandMock.mockImplementation(async (cmd: string) => {
                if (
                    cmd === 'workbench.view.extension.claude-sessions-sidebar'
                    || cmd === 'claudeVSCodeSessionsList.focus'
                ) {
                    throw new Error('not available');
                }
                return undefined;
            });
            const globalState = makeGlobalState();
            const command = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            // Both attempted
            expect(executeCommandMock).toHaveBeenCalledWith(
                'workbench.view.extension.claude-sessions-sidebar',
            );
            expect(executeCommandMock).toHaveBeenCalledWith('claudeVSCodeSessionsList.focus');
            // Flag NOT set — next launch gets another chance
            const flagWrite = (globalState.update as jest.Mock).mock.calls.find(c =>
                c[0] === SESSIONS_BROWSER_AUTO_SHOWN_KEY,
            );
            expect(flagWrite).toBeUndefined();
        });

        it('does NOT fire when extension is not installed (even on extension surface)', async () => {
            // surface=extension but extension missing → recovery dialog path,
            // not the URI launch path; sessions browser is irrelevant here.
            setupVscodeMocks({ surface: 'extension', extensionInstalled: false });
            const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            executeCommandMock.mockClear();
            executeCommandMock.mockResolvedValue(undefined);
            const globalState = makeGlobalState();
            const command = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const sessionsCall = executeCommandMock.mock.calls.find(c =>
                c[0] === 'workbench.view.extension.claude-sessions-sidebar'
                || c[0] === 'claudeVSCodeSessionsList.focus',
            );
            expect(sessionsCall).toBeUndefined();
        });
    });

    // ------------------------------------------------------------------------
    // Terminal behavior
    // ------------------------------------------------------------------------

    describe('terminal behavior', () => {
        it("creates a terminal named 'Claude Code' with cwd = project.path", async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
            const project = makeProject({ path: '/projects/demo' });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(project) as never,
                makeLogger() as never,
            );

            await command.execute(project as Project);

            expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
            const createArg = mocks.createTerminalMock.mock.calls[0][0];
            expect(createArg).toMatchObject({ name: 'Claude Code', cwd: '/projects/demo' });
        });

        it('calls term.show() before sendText("claude --continue")', async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const showOrder = mocks.terminalShowMock.mock.invocationCallOrder[0];
            const sendOrder = mocks.terminalSendTextMock.mock.invocationCallOrder[0];
            expect(showOrder).toBeLessThan(sendOrder);
        });

        it('surfaces an error when project.path is missing (no terminal created)', async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
            const project = makeProject({ path: '' });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(project) as never,
                makeLogger() as never,
            );

            await command.execute(project as Project);

            expect(mocks.createTerminalMock).not.toHaveBeenCalled();
            expect(mocks.showErrorMessageMock).toHaveBeenCalled();
        });

        it('surfaces an error when no project is provided (no terminal created)', async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(null) as never,
                makeLogger() as never,
            );

            await command.execute(undefined as unknown as Project);

            expect(mocks.createTerminalMock).not.toHaveBeenCalled();
            expect(mocks.showErrorMessageMock).toHaveBeenCalled();
        });
    });

    // ------------------------------------------------------------------------
    // Logging
    // ------------------------------------------------------------------------

    describe('logging', () => {
        it('logs the engine and surface chosen', async () => {
            setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            const logger = makeLogger();
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                logger as never,
            );

            await command.execute(makeProject() as Project);

            const allLogs = [
                ...logger.info.mock.calls,
                ...logger.debug.mock.calls,
            ].flat().join(' ');
            expect(allLogs).toMatch(/surface/i);
        });

        it('logs project.name in the launch path', async () => {
            setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            const logger = makeLogger();
            const project = makeProject({ name: 'my-demo-project' });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(project) as never,
                logger as never,
            );

            await command.execute(project as Project);

            const allLogs = [
                ...logger.info.mock.calls,
                ...logger.debug.mock.calls,
            ].flat().join(' ');
            expect(allLogs).toContain('my-demo-project');
        });

        it('logs the dock offer outcome=accepted when user clicks Dock to right side', async () => {
            const mocks = setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            mocks.showInformationMessageMock.mockResolvedValueOnce(DOCK_ACTION_LABEL);
            const logger = makeLogger();
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                logger as never,
            );

            await command.execute(makeProject() as Project);

            const allInfo = logger.info.mock.calls.flat().join(' ');
            expect(allInfo).toMatch(/\[Open in Claude\] dock offer outcome: accepted/);
        });

        it('logs the dock offer outcome=use-default when user clicks Use default', async () => {
            const mocks = setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            mocks.showInformationMessageMock.mockResolvedValueOnce(USE_DEFAULT_LAYOUT_ACTION_LABEL);
            const logger = makeLogger();
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                logger as never,
            );

            await command.execute(makeProject() as Project);

            const allInfo = logger.info.mock.calls.flat().join(' ');
            expect(allInfo).toMatch(/\[Open in Claude\] dock offer outcome: use-default/);
        });

        it('logs the extension offer outcome=use-extension when user accepts', async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: true });
            mocks.showInformationMessageMock.mockResolvedValueOnce(USE_EXTENSION_ACTION_LABEL);
            const logger = makeLogger();
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                logger as never,
            );

            await command.execute(makeProject() as Project);

            const allInfo = logger.info.mock.calls.flat().join(' ');
            expect(allInfo).toMatch(/\[Open in Claude\] extension offer outcome: use-extension/);
        });

        it('logs warn when openExternal returns false', async () => {
            setupVscodeMocks({
                surface: 'extension',
                extensionInstalled: true,
                openExternalResult: false,
            });
            const logger = makeLogger();
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                logger as never,
            );

            await command.execute(makeProject() as Project);

            const allWarn = logger.warn.mock.calls.flat().join(' ');
            expect(allWarn).toMatch(/\[Open in Claude\] openExternal returned false/);
        });

        it('logs terminal spawned + location=panel when dockToRight=false', async () => {
            setupVscodeMocks({ surface: 'terminal', extensionInstalled: false, dockToRight: false });
            const logger = makeLogger();
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                logger as never,
            );

            await command.execute(makeProject() as Project);

            const allInfo = logger.info.mock.calls.flat().join(' ');
            expect(allInfo).toMatch(/terminal spawned/);
            expect(allInfo).toMatch(/location=panel/);
        });

        it('logs terminal spawned + location=editor-beside when dockToRight=true', async () => {
            setupVscodeMocks({ surface: 'terminal', extensionInstalled: false, dockToRight: true });
            const logger = makeLogger();
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                logger as never,
            );

            await command.execute(makeProject() as Project);

            const allInfo = logger.info.mock.calls.flat().join(' ');
            expect(allInfo).toMatch(/terminal spawned/);
            expect(allInfo).toMatch(/location=editor-beside/);
        });

        it('logs terminal reused (no spawn) when existing terminal found', async () => {
            setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: false,
                existingTerminals: [{ name: 'Claude Code', exitStatus: undefined }],
            });
            const logger = makeLogger();
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                logger as never,
            );

            await command.execute(makeProject() as Project);

            const allInfo = logger.info.mock.calls.flat().join(' ');
            expect(allInfo).toMatch(/terminal reused/);
        });
    });

    // ------------------------------------------------------------------------
    // Error surfaces
    // ------------------------------------------------------------------------

    describe('error surfaces', () => {
        it('shows a warning when openExternal returns false (does NOT fall back to terminal)', async () => {
            const mocks = setupVscodeMocks({
                surface: 'extension',
                extensionInstalled: true,
                openExternalResult: false,
            });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.openExternalMock).toHaveBeenCalledTimes(1);
            expect(mocks.showWarningMessageMock).toHaveBeenCalled();
            expect(mocks.createTerminalMock).not.toHaveBeenCalled();
        });

        it('logs and surfaces a user-visible error when openExternal throws', async () => {
            const mocks = setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            mocks.openExternalMock.mockRejectedValueOnce(new Error('boom'));

            const logger = makeLogger();
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                logger as never,
            );

            await command.execute(makeProject() as Project);

            expect(logger.error).toHaveBeenCalled();
            const errorShown =
                mocks.showErrorMessageMock.mock.calls.length > 0 ||
                mocks.showWarningMessageMock.mock.calls.length > 0;
            expect(errorShown).toBe(true);
            expect(mocks.createTerminalMock).not.toHaveBeenCalled();
        });

        it('logs and surfaces an error when createTerminal throws', async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
            mocks.createTerminalMock.mockImplementationOnce(() => {
                throw new Error('terminal denied');
            });

            const logger = makeLogger();
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                logger as never,
            );

            await command.execute(makeProject() as Project);

            expect(logger.error).toHaveBeenCalled();
            const errorShown =
                mocks.showErrorMessageMock.mock.calls.length > 0 ||
                mocks.showWarningMessageMock.mock.calls.length > 0;
            expect(errorShown).toBe(true);
        });
    });

    // ------------------------------------------------------------------------
    // Project resolution
    // ------------------------------------------------------------------------

    describe('project resolution', () => {
        it('falls back to StateManager.getCurrentProject() when invoked without a project argument', async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
            const project = makeProject({ name: 'from-state', path: '/p/state' });
            const stateManager = makeStateManager(project);
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                stateManager as never,
                makeLogger() as never,
            );

            await command.execute();

            expect(stateManager.getCurrentProject).toHaveBeenCalled();
            expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
            const createArg = mocks.createTerminalMock.mock.calls[0][0];
            expect(createArg.cwd).toBe('/p/state');
        });
    });

    // ------------------------------------------------------------------------
    // Prompt argument
    // ------------------------------------------------------------------------

    describe('prompt argument', () => {
        it('URI includes the prompt query parameter when called with { prompt }', async () => {
            const mocks = setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute({ prompt: 'foo' });

            expect(mocks.openExternalMock).toHaveBeenCalledTimes(1);
            const uriArg = mocks.openExternalMock.mock.calls[0][0];
            expect(String(uriArg)).toBe('vscode://anthropic.claude-code/open?prompt=foo');
        });

        it('URL-encodes a prompt with spaces and special characters', async () => {
            const mocks = setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            const promptText = 'has spaces & special=chars';
            await command.execute({ prompt: promptText });

            expect(mocks.openExternalMock).toHaveBeenCalledTimes(1);
            const uriArg = mocks.openExternalMock.mock.calls[0][0];
            expect(String(uriArg)).toBe(
                `vscode://anthropic.claude-code/open?prompt=${encodeURIComponent(promptText)}`,
            );
        });

        it('URI is the bare open URL when called with { project } only (no prompt)', async () => {
            const mocks = setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute({ project: makeProject() as Project });

            expect(mocks.openExternalMock).toHaveBeenCalledTimes(1);
            const uriArg = mocks.openExternalMock.mock.calls[0][0];
            expect(String(uriArg)).toBe('vscode://anthropic.claude-code/open');
        });

        it('URI is the bare open URL when called with no argument', async () => {
            const mocks = setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute();

            expect(mocks.openExternalMock).toHaveBeenCalledTimes(1);
            const uriArg = mocks.openExternalMock.mock.calls[0][0];
            expect(String(uriArg)).toBe('vscode://anthropic.claude-code/open');
        });

        it('terminal-mode hands the prompt off via the clipboard (rather than URI args)', async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute({ prompt: 'add a hero block', project: makeProject() as Project });

            // URI handler never used in terminal mode
            expect(mocks.openExternalMock).not.toHaveBeenCalled();
            // Prompt copied to clipboard
            expect(mocks.clipboardWriteMock).toHaveBeenCalledWith('add a hero block');
            // Terminal spawned with --continue (prompt NOT injected via sendText)
            expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
            expect(mocks.terminalSendTextMock).toHaveBeenCalledWith('claude --continue');
        });
    });

    // ------------------------------------------------------------------------
    // Dock-to-right: extension surface chat-tab placement
    //
    // Claude Code's URI handler always opens the chat as a new editor tab in
    // the active group. To put the chat in a right-side editor split (matching
    // the dock-to-right layout the user opted into), we ensure a second editor
    // group exists and focus it BEFORE the URI launch.
    // ------------------------------------------------------------------------

    describe('launchViaUri respects dockToRight by placing the chat in a right editor split', () => {
        const FOCUS_SECOND = 'workbench.action.focusSecondEditorGroup';
        const SPLIT_RIGHT = 'workbench.action.splitEditorRight';

        function setTabGroups(columns: number[]): void {
            (vscode.window as unknown as {
                tabGroups: { all: { viewColumn: number }[] };
            }).tabGroups.all = columns.map(c => ({ viewColumn: c }));
        }

        it('splits the editor right when only one group exists, then focuses the new group before the URI launch', async () => {
            const mocks = setupVscodeMocks({
                surface: 'extension',
                extensionInstalled: true,
                dockToRight: true,
            });
            setTabGroups([1]);
            const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            executeCommandMock.mockResolvedValue(undefined);

            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const cmdCalls = executeCommandMock.mock.calls.map(c => c[0] as string);
            const splitIdx = executeCommandMock.mock.calls.findIndex(c => c[0] === SPLIT_RIGHT);
            const focusIdx = executeCommandMock.mock.calls.findIndex(c => c[0] === FOCUS_SECOND);
            const launchOrder = mocks.openExternalMock.mock.invocationCallOrder[0];

            expect(cmdCalls).toEqual(expect.arrayContaining([SPLIT_RIGHT, FOCUS_SECOND]));
            const splitInvocation = executeCommandMock.mock.invocationCallOrder[splitIdx];
            const focusInvocation = executeCommandMock.mock.invocationCallOrder[focusIdx];
            expect(splitInvocation).toBeLessThan(focusInvocation); // split before focus
            expect(focusInvocation).toBeLessThan(launchOrder); // focus before launch
            expect(mocks.openExternalMock).toHaveBeenCalledTimes(1);
        });

        it('skips the split when a second editor group already exists, but still focuses it before launch', async () => {
            const mocks = setupVscodeMocks({
                surface: 'extension',
                extensionInstalled: true,
                dockToRight: true,
            });
            setTabGroups([1, 2]);
            const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            executeCommandMock.mockResolvedValue(undefined);

            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const cmdCalls = executeCommandMock.mock.calls.map(c => c[0] as string);
            expect(cmdCalls).not.toContain(SPLIT_RIGHT);
            expect(cmdCalls).toContain(FOCUS_SECOND);
            const focusIdx = executeCommandMock.mock.calls.findIndex(c => c[0] === FOCUS_SECOND);
            const focusInvocation = executeCommandMock.mock.invocationCallOrder[focusIdx];
            const launchOrder = mocks.openExternalMock.mock.invocationCallOrder[0];
            expect(focusInvocation).toBeLessThan(launchOrder);
        });

        it('does NOT split or focus when dockToRight is false', async () => {
            const mocks = setupVscodeMocks({
                surface: 'extension',
                extensionInstalled: true,
                dockToRight: false,
            });
            setTabGroups([1]);
            const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            executeCommandMock.mockResolvedValue(undefined);

            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const cmdCalls = executeCommandMock.mock.calls.map(c => c[0] as string);
            expect(cmdCalls).not.toContain(SPLIT_RIGHT);
            expect(cmdCalls).not.toContain(FOCUS_SECOND);
            expect(mocks.openExternalMock).toHaveBeenCalledTimes(1);
        });
    });
});
