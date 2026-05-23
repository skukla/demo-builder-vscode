/**
 * OpenInClaudeCommand tests (Cycle D — Batch D2)
 *
 * Coverage:
 *  - 3 harness modes (`auto`, `extension`, `terminal`) × extension installed / not-installed
 *  - First-tip globalState behavior (write BEFORE message; once-only)
 *  - Terminal creation (name 'Claude Code', cwd = project.path, sendText('claude'), show())
 *  - Missing project.path surfaces an error
 *  - StepLogger action-level logging at each branch
 *  - vscode.env.openExternal resolving to `false` surfaces a warning (no terminal fallback)
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
 *  - vscode.workspace.getConfiguration('demoBuilder.ai').get('harness') -> harnessMode
 *  - vscode.extensions.getExtension(id) -> ext if id matches and installed, else undefined
 *  - vscode.env.openExternal -> opens
 *  - vscode.window.createTerminal -> terminal
 *
 * Returns the per-test jest mocks so individual tests can assert behavior.
 */
function setupVscodeMocks(opts: {
    harness: 'auto' | 'extension' | 'terminal';
    extensionInstalled: boolean;
    openExternalResult?: boolean;
}): {
    getHarnessMock: jest.Mock;
    getExtensionMock: jest.Mock;
    openExternalMock: jest.Mock;
    createTerminalMock: jest.Mock;
    terminalShowMock: jest.Mock;
    terminalSendTextMock: jest.Mock;
    showInformationMessageMock: jest.Mock;
    showErrorMessageMock: jest.Mock;
    showWarningMessageMock: jest.Mock;
} {
    const getHarnessMock = jest.fn().mockReturnValue(opts.harness);
    (vscode.workspace.getConfiguration as jest.Mock).mockImplementation((section: string) => {
        if (section === 'demoBuilder.ai') {
            return { get: getHarnessMock };
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
        getHarnessMock,
        getExtensionMock,
        openExternalMock,
        createTerminalMock,
        terminalShowMock,
        terminalSendTextMock,
        showInformationMessageMock,
        showErrorMessageMock,
        showWarningMessageMock,
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
    // Harness=auto
    // ------------------------------------------------------------------------

    describe("harness='auto'", () => {
        it('URI launches when extension is installed', async () => {
            const mocks = setupVscodeMocks({ harness: 'auto', extensionInstalled: true });
            const globalState = makeGlobalState();
            const command = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.openExternalMock).toHaveBeenCalledTimes(1);
            const uriArg = mocks.openExternalMock.mock.calls[0][0];
            expect(String(uriArg)).toBe('vscode://anthropic.claude-code/open');
            expect(mocks.createTerminalMock).not.toHaveBeenCalled();
        });

        it('falls back to terminal launch when extension is NOT installed', async () => {
            const mocks = setupVscodeMocks({ harness: 'auto', extensionInstalled: false });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.openExternalMock).not.toHaveBeenCalled();
            expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
            expect(mocks.terminalShowMock).toHaveBeenCalled();
            expect(mocks.terminalSendTextMock).toHaveBeenCalledWith('claude');
        });
    });

    // ------------------------------------------------------------------------
    // Harness=extension
    // ------------------------------------------------------------------------

    describe("harness='extension'", () => {
        it('URI launches when extension is installed', async () => {
            const mocks = setupVscodeMocks({ harness: 'extension', extensionInstalled: true });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.openExternalMock).toHaveBeenCalledTimes(1);
            expect(mocks.createTerminalMock).not.toHaveBeenCalled();
        });

        it("shows an error (no fallback) when extension is NOT installed", async () => {
            const mocks = setupVscodeMocks({ harness: 'extension', extensionInstalled: false });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.showErrorMessageMock).toHaveBeenCalled();
            expect(mocks.openExternalMock).not.toHaveBeenCalled();
            expect(mocks.createTerminalMock).not.toHaveBeenCalled();
        });

        it("error message mentions the harness setting hint when extension is missing", async () => {
            const mocks = setupVscodeMocks({ harness: 'extension', extensionInstalled: false });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const errorText = mocks.showErrorMessageMock.mock.calls[0][0] as string;
            expect(errorText).toMatch(/claude code/i);
            expect(errorText.toLowerCase()).toContain('terminal');
        });
    });

    // ------------------------------------------------------------------------
    // Harness=terminal
    // ------------------------------------------------------------------------

    describe("harness='terminal'", () => {
        it('forces terminal launch even when extension is installed', async () => {
            const mocks = setupVscodeMocks({ harness: 'terminal', extensionInstalled: true });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.openExternalMock).not.toHaveBeenCalled();
            expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
            expect(mocks.terminalSendTextMock).toHaveBeenCalledWith('claude');
        });

        it('forces terminal launch when extension is NOT installed', async () => {
            const mocks = setupVscodeMocks({ harness: 'terminal', extensionInstalled: false });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.openExternalMock).not.toHaveBeenCalled();
            expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
        });
    });

    // ------------------------------------------------------------------------
    // First-tip behavior
    // ------------------------------------------------------------------------

    describe('first-tip behavior', () => {
        const TIP_KEY = 'demoBuilder.ai.firstClaudeOpenTipShown';

        it('first successful URI launch sets globalState BEFORE showing the tip', async () => {
            const mocks = setupVscodeMocks({ harness: 'auto', extensionInstalled: true });
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
            const mocks = setupVscodeMocks({ harness: 'auto', extensionInstalled: true });
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
            const mocks = setupVscodeMocks({ harness: 'terminal', extensionInstalled: true });
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
            const mocks = setupVscodeMocks({ harness: 'auto', extensionInstalled: true });
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
                harness: 'auto',
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
            const mocks = setupVscodeMocks({ harness: 'terminal', extensionInstalled: false });
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

        it('calls term.show() before sendText("claude")', async () => {
            const mocks = setupVscodeMocks({ harness: 'terminal', extensionInstalled: false });
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
            const mocks = setupVscodeMocks({ harness: 'terminal', extensionInstalled: false });
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
            const mocks = setupVscodeMocks({ harness: 'terminal', extensionInstalled: false });
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
        it('logs the harness mode chosen', async () => {
            setupVscodeMocks({ harness: 'auto', extensionInstalled: true });
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
            expect(allLogs).toMatch(/harness/i);
        });

        it('logs project.name in the launch path', async () => {
            setupVscodeMocks({ harness: 'auto', extensionInstalled: true });
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
            setupVscodeMocks({ harness: 'auto', extensionInstalled: false });
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
                harness: 'auto',
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
            const mocks = setupVscodeMocks({ harness: 'auto', extensionInstalled: true });
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
            const mocks = setupVscodeMocks({ harness: 'terminal', extensionInstalled: false });
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
            const mocks = setupVscodeMocks({ harness: 'terminal', extensionInstalled: false });
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
    // Prompt argument (Batch E2)
    // ------------------------------------------------------------------------

    describe('prompt argument (Batch E2)', () => {
        it('URI includes the prompt query parameter when called with { prompt }', async () => {
            const mocks = setupVscodeMocks({ harness: 'auto', extensionInstalled: true });
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
            const mocks = setupVscodeMocks({ harness: 'auto', extensionInstalled: true });
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
            const mocks = setupVscodeMocks({ harness: 'auto', extensionInstalled: true });
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
            const mocks = setupVscodeMocks({ harness: 'auto', extensionInstalled: true });
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

        it('terminal-mode ignores the prompt (existing terminal launch behavior preserved)', async () => {
            const mocks = setupVscodeMocks({ harness: 'terminal', extensionInstalled: false });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute({ prompt: 'add a hero block', project: makeProject() as Project });

            expect(mocks.openExternalMock).not.toHaveBeenCalled();
            expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
            expect(mocks.terminalSendTextMock).toHaveBeenCalledWith('claude');
        });
    });
});
