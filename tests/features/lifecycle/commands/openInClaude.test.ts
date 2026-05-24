/**
 * OpenInClaudeCommand tests
 *
 * Coverage:
 *  - 2 surfaces (`extension`, `terminal`) × extension installed / not-installed
 *  - Missing-extension error dialog (Install / Switch to Terminal actions)
 *  - First-tip globalState behavior (write BEFORE message; once-only)
 *  - Terminal find-or-spawn behavior + `claude --continue` on spawn
 *  - Clipboard handoff for prompt + terminal surface
 *  - Workspace-mismatch warning (extension surface only, once-ever)
 *  - vscode.env.openExternal resolving to `false` surfaces a warning
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
 * Sets up the vscode mock surface required for OpenInClaudeCommand:
 *  - vscode.workspace.getConfiguration('demoBuilder.ai').get('engine'/'surface')
 *  - vscode.extensions.getExtension(id) -> ext if id matches and installed, else undefined
 *  - vscode.env.openExternal -> opens
 *  - vscode.window.createTerminal -> terminal
 *  - vscode.window.terminals -> list of existing terminals (for find-or-spawn)
 *  - vscode.env.clipboard.writeText -> clipboard handoff
 *
 * Returns the per-test jest mocks so individual tests can assert behavior.
 */
function setupVscodeMocks(opts: {
    surface: 'extension' | 'terminal';
    /** Engine setting. Defaults to `'claude-code'` (the only currently-supported engine). */
    engine?: 'claude-code';
    extensionInstalled: boolean;
    openExternalResult?: boolean;
    /**
     * Workspace folder path to expose via `vscode.workspace.workspaceFolders[0]`.
     * Defaults to `/projects/demo` (matches the default mock project path) so
     * existing tests that assume workspace = project keep their URI-launch
     * expectations.
     */
    workspaceFolderPath?: string | null;
    /**
     * Existing terminals to expose via `vscode.window.terminals`. Defaults to
     * `[]` (no existing terminals; spawn a fresh one).
     */
    existingTerminals?: Array<{ name: string; exitStatus?: { code: number } | undefined }>;
}): {
    getConfigMock: jest.Mock;
    configUpdateMock: jest.Mock;
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

    // Configuration mock — dispatches on the key name so `get('engine')` and
    // `get('surface')` return different values.
    const getConfigMock = jest.fn((key: string, defaultValue?: unknown) => {
        if (key === 'engine') return opts.engine ?? 'claude-code';
        if (key === 'surface') return opts.surface;
        return defaultValue;
    });
    const configUpdateMock = jest.fn().mockResolvedValue(undefined);
    (vscode.workspace.getConfiguration as jest.Mock).mockImplementation((section: string) => {
        if (section === 'demoBuilder.ai') {
            return { get: getConfigMock, update: configUpdateMock };
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

        it('extension mode warning fires only once ever (persistent globalState — matches first-tip pattern)', async () => {
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
        it('forces terminal launch even when extension is installed', async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: true });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.openExternalMock).not.toHaveBeenCalled();
            expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
            expect(mocks.terminalSendTextMock).toHaveBeenCalledWith('claude --continue');
        });

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

        it('shows a "Prompt copied to clipboard" info toast in terminal mode + prompt', async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute({ project: makeProject() as Project, prompt: 'do the thing' });

            expect(mocks.showInformationMessageMock).toHaveBeenCalled();
            const message = mocks.showInformationMessageMock.mock.calls[0][0] as string;
            expect(message.toLowerCase()).toMatch(/clipboard/);
            expect(message.toLowerCase()).toMatch(/paste/);
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
    // First-tip behavior
    // ------------------------------------------------------------------------

    describe('first-tip behavior', () => {
        const TIP_KEY = 'demoBuilder.ai.firstClaudeOpenTipShown';

        it('first successful URI launch sets globalState BEFORE showing the tip', async () => {
            const mocks = setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            const globalState = makeGlobalState();
            const command = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(globalState.update).toHaveBeenCalledWith(TIP_KEY, true);
            expect(mocks.showInformationMessageMock).toHaveBeenCalled();

            // update must have been called before showInformationMessage
            const updateOrder = (globalState.update as jest.Mock).mock.invocationCallOrder[0];
            const infoOrder = (mocks.showInformationMessageMock as jest.Mock).mock.invocationCallOrder[0];
            expect(updateOrder).toBeLessThan(infoOrder);
        });

        it('subsequent URI launches do NOT show the tip again', async () => {
            const mocks = setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            const globalState = makeGlobalState({ [TIP_KEY]: true });
            const command = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.openExternalMock).toHaveBeenCalledTimes(1);
            expect(mocks.showInformationMessageMock).not.toHaveBeenCalled();
        });

        it('terminal launches do NOT show the URI-launch tip', async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: true });
            const globalState = makeGlobalState();
            const command = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.showInformationMessageMock).not.toHaveBeenCalled();
            expect(globalState.update).not.toHaveBeenCalledWith(TIP_KEY, true);
        });

        it('two URI launches in quick succession only show the tip once (race-safe)', async () => {
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
            expect(mocks.showInformationMessageMock).toHaveBeenCalledTimes(1);
        });

        it('first-tip is NOT set when URI launch fails (openExternal returns false)', async () => {
            const mocks = setupVscodeMocks({
                surface: 'extension',
                extensionInstalled: true,
                openExternalResult: false,
            });
            const globalState = makeGlobalState();
            const command = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.showInformationMessageMock).not.toHaveBeenCalled();
            expect(globalState.update).not.toHaveBeenCalledWith(TIP_KEY, true);
            expect(mocks.showWarningMessageMock).toHaveBeenCalled();
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
            // BaseCommand.createTerminal(name, cwd) calls
            // vscode.window.createTerminal({ name, cwd }) under the hood.
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

        it('logs at extension-detection branch', async () => {
            setupVscodeMocks({ surface: 'extension', extensionInstalled: false });
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
                ...logger.warn.mock.calls,
            ].flat().join(' ');
            // Detection result is surfaced in the log stream (either "extension" or "terminal" branch wording).
            expect(allLogs).toMatch(/extension|terminal/i);
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
            // Either error or warning is acceptable user surface; both indicate failure.
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
    // Project resolution (no project arg → uses StateManager.getCurrentProject)
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
});
