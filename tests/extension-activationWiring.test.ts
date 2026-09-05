/**
 * What `activate()` actually WIRES — read past the workspace-trust gate.
 *
 * The two sibling activation suites stop at that gate: neither sets
 * `workspace.isTrusted`, so `!undefined` is true and activation returns at line
 * 322 with two thirds of its body unexecuted. That is what held this module at
 * 8.77% while its suites passed.
 *
 * Three mock gaps were fixed to get here, and each had the same shape — an API
 * the real VS Code has and the fake did not, throwing INSIDE activation's own
 * try/catch so the error was logged and swallowed and every later line silently
 * never ran: `workspace.onDidChangeWorkspaceFolders`, the ServiceLocator's
 * READERS, and `fs/promises.rm`. They are recorded in extension.testUtils and in
 * the vscode mock, next to what they broke.
 *
 * This suite asserts the DECISIONS in the callbacks activation registers, by
 * capturing each callback from the mock it was handed to and invoking it — which
 * is the only way to reach them, and is what a VS Code event does in production.
 */

import {
    activate,
    deactivate,
    vscode,
    createActivationContext,
    mockHasProject,
    mockGetCurrentProject,
} from './extension.testUtils';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import { resolveProjectsRoot } from '@/core/utils/projectsRoot';
import * as path from 'path';

const mockExecuteCommand = vscode.commands.executeCommand as jest.Mock;
const mockRegisterCommand = vscode.commands.registerCommand as jest.Mock;

/** Set the mocked workspace folder for one test. */
function setWorkspaceFolder(fsPath: string | undefined): void {
    (vscode.workspace as unknown as { workspaceFolders?: { uri: { fsPath: string } }[] })
        .workspaceFolders = fsPath === undefined ? undefined : [{ uri: { fsPath } }];
}

/** The callback registered for a command id, or a failure naming what was. */
function commandCallback(id: string): (...args: unknown[]) => unknown {
    const call = mockRegisterCommand.mock.calls.find((c) => c[0] === id);
    if (!call) {
        throw new Error(
            `no command registered for ${id}; got ${mockRegisterCommand.mock.calls
                .map((c) => c[0])
                .join(', ')}`,
        );
    }
    return call[1];
}

describe('activate() past the workspace-trust gate', () => {
    afterEach(() => {
        deactivate();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockHasProject.mockResolvedValue(false);
        mockGetCurrentProject.mockResolvedValue(undefined);
        (vscode.workspace as unknown as { isTrusted: boolean }).isTrusted = true;
        // Answer every setting with the caller's OWN default, so a test that does
        // not care about a setting gets the shipped behaviour rather than 3000.
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn((_key: string, fallback: unknown) => fallback),
        });
        setWorkspaceFolder(undefined);
    });

    describe('the workspace-trust gate itself', () => {
        it('warns and registers NOTHING in an untrusted workspace', async () => {
            (vscode.workspace as unknown as { isTrusted: boolean }).isTrusted = false;

            await activate(createActivationContext());

            expect(vscode.window.showWarningMessage).toHaveBeenCalled();
            // The runtime commands live past the gate — none of them exist.
            expect(mockRegisterCommand).not.toHaveBeenCalled();
        });

        it('registers the runtime commands in a trusted one', async () => {
            await activate(createActivationContext());

            expect(mockRegisterCommand.mock.calls.map((c) => c[0])).toEqual(
                expect.arrayContaining([
                    'demoBuilder.showLogs',
                    'demoBuilder.showDebugLogs',
                    'demoBuilder.restartDemo',
                    'demoBuilder.openBrowser',
                    'demoBuilder.cleanupDaLiveSites',
                    'demoBuilder.manageGitHubRepos',
                ]),
            );
        });

        it('completes without reporting an activation failure', async () => {
            // The catch swallows everything, so a green activation test proves
            // nothing unless it also checks that nothing was caught.
            await activate(createActivationContext());

            expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
        });
    });

    describe('auto zoom', () => {
        it('does NOT reset zoom by default — it would undo a presenter\'s own setting', async () => {
            // The config fake answers with the CALLER's default, so this asserts the
            // default the source declares rather than one the test supplied.
            await activate(createActivationContext());

            expect(mockExecuteCommand).not.toHaveBeenCalledWith('workbench.action.zoomReset');
        });

        it('resets zoom when the setting is explicitly enabled', async () => {
            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
                get: jest.fn((key: string, fallback: unknown) =>
                    key === 'autoZoom' ? true : fallback,
                ),
            });

            await activate(createActivationContext());

            expect(mockExecuteCommand).toHaveBeenCalledWith('workbench.action.zoomReset');
        });
    });

    describe('the dashboard-disposal safety net', () => {
        /** The callback activation handed to the webview manager. */
        function disposalCallback(): (id: string) => Promise<void> {
            const spy = BaseWebviewCommand.setDisposalCallback as unknown as jest.Mock;
            return spy.mock.calls[spy.mock.calls.length - 1][0];
        }

        beforeEach(() => {
            jest.spyOn(BaseWebviewCommand, 'setDisposalCallback').mockImplementation(() => {});
        });

        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('ignores a webview that is not the project dashboard', async () => {
            setWorkspaceFolder('/anything');
            await activate(createActivationContext());
            mockExecuteCommand.mockClear();

            await disposalCallback()('demoBuilder.configure');

            expect(mockExecuteCommand).not.toHaveBeenCalled();
        });

        it('does nothing while a webview transition is in progress', async () => {
            setWorkspaceFolder('/anything');
            await activate(createActivationContext());
            mockExecuteCommand.mockClear();
            jest.spyOn(BaseWebviewCommand, 'isWebviewTransitionInProgress').mockReturnValue(true);

            await disposalCallback()('demoBuilder.projectDashboard');

            // The user is mid-navigation; reopening would fight the handoff.
            expect(mockExecuteCommand).not.toHaveBeenCalledWith('demoBuilder.showProjectsList');
        });
    });

    describe('the commands it registers', () => {
        it('showLogs and showDebugLogs each open their own channel', async () => {
            await activate(createActivationContext());
            const { initializeLogger } = jest.requireMock('@/core/logging/debugLogger');
            const debugLogger = (initializeLogger as jest.Mock).mock.results[0].value;

            commandCallback('demoBuilder.showLogs')();
            commandCallback('demoBuilder.showDebugLogs')();

            // Two channels, two commands: the palette entries are not aliases.
            expect(debugLogger.show).toHaveBeenCalled();
            expect(debugLogger.showDebug).toHaveBeenCalled();
        });

        it('openBrowser opens nothing when the project has no running frontend', async () => {
            mockGetCurrentProject.mockResolvedValue({ name: 'demo', componentInstances: {} });
            await activate(createActivationContext());

            await commandCallback('demoBuilder.openBrowser')();

            expect(vscode.env.openExternal).not.toHaveBeenCalled();
        });

        it('openBrowser opens localhost on the frontend port when there is one', async () => {
            mockGetCurrentProject.mockResolvedValue({
                name: 'demo',
                componentInstances: {
                    headless: { id: 'headless', type: 'frontend', status: 'running', port: 4321 },
                },
            });
            await activate(createActivationContext());

            await commandCallback('demoBuilder.openBrowser')();

            expect(String((vscode.env.openExternal as jest.Mock).mock.calls[0][0])).toBe(
                'http://localhost:4321',
            );
        });

        it('restartDemo stops before it starts', async () => {
            await activate(createActivationContext());
            mockExecuteCommand.mockClear();

            await commandCallback('demoBuilder.restartDemo')();

            const ids = mockExecuteCommand.mock.calls.map((c) => c[0]);
            expect(ids.indexOf('demoBuilder.stopDemo')).toBeLessThan(
                ids.indexOf('demoBuilder.startDemo'),
            );
        });
    });

    describe('the workspace-folder subscription', () => {
        it('subscribes so the MCP server can be rebound when the folder changes', async () => {
            await activate(createActivationContext());

            // Bound to the open folder: a folder change with no restart leaves the
            // server serving a workspace the window has left.
            expect(vscode.workspace.onDidChangeWorkspaceFolders).toHaveBeenCalledWith(
                expect.any(Function),
            );
        });
    });

    describe('the always-root home model', () => {
        it('re-homes a window anchored to a project subdirectory', async () => {
            // resolveProjectsRoot, not a homedir guess: the test environment sets
            // DEMO_BUILDER_PROJECTS_DIR, and deriving the path independently
            // tests a root the extension is not using.
            setWorkspaceFolder(path.join(resolveProjectsRoot(), 'some-project'));

            await activate(createActivationContext());

            expect(mockExecuteCommand).toHaveBeenCalledWith(
                'vscode.openFolder',
                expect.anything(),
                false,
            );
        });

        it('leaves a window already at the projects root alone', async () => {
            setWorkspaceFolder(resolveProjectsRoot());

            await activate(createActivationContext());

            expect(mockExecuteCommand).not.toHaveBeenCalledWith(
                'vscode.openFolder',
                expect.anything(),
                expect.anything(),
            );
        });

        it('leaves an unrelated workspace alone', async () => {
            setWorkspaceFolder('/somewhere/else');

            await activate(createActivationContext());

            expect(mockExecuteCommand).not.toHaveBeenCalledWith(
                'vscode.openFolder',
                expect.anything(),
                expect.anything(),
            );
            // ...and does not focus the Demo Builder view either: this is not a
            // Demo Builder context, so there is nothing to reopen toward.
            expect(mockExecuteCommand).not.toHaveBeenCalledWith(
                'workbench.view.extension.demoBuilder',
            );
        });

        it('treats an EMPTY workspaceFolders list as no workspace', async () => {
            // VS Code reports an empty array, not undefined, for a window with no
            // folder — the read is chained twice for exactly that.
            (vscode.workspace as unknown as { workspaceFolders: unknown[] }).workspaceFolders = [];

            await activate(createActivationContext());

            expect(mockExecuteCommand).not.toHaveBeenCalledWith(
                'vscode.openFolder',
                expect.anything(),
                expect.anything(),
            );
            expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
        });

        it('focuses the Demo Builder view on a cold start at the projects root', async () => {
            const os = require('os');
            // shouldAutoReopenProjectsList compares against the homedir base, which
            // is NOT the DEMO_BUILDER_PROJECTS_DIR the re-home check uses — so this
            // path reaches the cold-start branch without re-homing first.
            setWorkspaceFolder(path.join(os.homedir(), '.demo-builder', 'projects'));

            await activate(createActivationContext());

            // The sidebar's visibility handler then opens the projects list.
            expect(mockExecuteCommand).toHaveBeenCalledWith(
                'workbench.view.extension.demoBuilder',
            );
        });
    });
});
