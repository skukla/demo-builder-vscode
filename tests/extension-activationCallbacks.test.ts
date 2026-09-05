/**
 * The callbacks activation registers, driven the way VS Code drives them.
 *
 * `activate()` hands eight functions to other objects and returns. Nothing else
 * calls them, so the only way to reach the decisions inside is to capture each
 * one from the mock it was handed to and invoke it — which is what a VS Code
 * event, a state change or a sign-in does in production.
 *
 * The sibling `-activationWiring` suite covers the trust gate, the commands and
 * the re-home decision. This one covers the subscriptions.
 */

import {
    activate,
    deactivate,
    vscode,
    createActivationContext,
    mockHasProject,
    mockGetCurrentProject,
    mockOnProjectChanged,
} from './extension.testUtils';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import { resolveProjectsRoot } from '@/core/utils/projectsRoot';
import * as os from 'os';
import * as path from 'path';

/**
 * The gate has no public reader — the resolver is consulted internally by
 * `aiDefaultsEntryApplies`. Mocking the setter is how the injected function
 * itself becomes readable, which is the decision this file is about.
 */
jest.mock('@/features/project-creation/services/aiBundle/aiToolingGate', () => ({
    ...jest.requireActual('@/features/project-creation/services/aiBundle/aiToolingGate'),
    setThirdPartyToolsResolver: jest.fn(),
}));

const mockExecuteCommand = vscode.commands.executeCommand as jest.Mock;

/**
 * `shouldAutoReopenProjectsList` compares against ~/.demo-builder/projects — the
 * literal it computes from homedir, NOT the DEMO_BUILDER_PROJECTS_DIR override
 * the re-home check uses. A path built from the other one reads as "outside the
 * base" and the reopen never fires.
 */
const REOPEN_BASE = path.join(os.homedir(), '.demo-builder', 'projects');

function setWorkspaceFolder(fsPath: string | undefined): void {
    (vscode.workspace as unknown as { workspaceFolders?: { uri: { fsPath: string } }[] })
        .workspaceFolders = fsPath === undefined ? undefined : [{ uri: { fsPath } }];
}

describe('the callbacks activate() registers', () => {
    afterEach(() => {
        deactivate();
        jest.restoreAllMocks();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockHasProject.mockResolvedValue(false);
        mockGetCurrentProject.mockResolvedValue(undefined);
        (vscode.workspace as unknown as { isTrusted: boolean }).isTrusted = true;
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn((_key: string, fallback: unknown) => fallback),
        });
        setWorkspaceFolder(undefined);
    });

    describe('the dashboard-disposal safety net', () => {
        function disposalCallback(): (id: string) => Promise<void> {
            const spy = BaseWebviewCommand.setDisposalCallback as unknown as jest.Mock;
            return spy.mock.calls[spy.mock.calls.length - 1][0];
        }

        beforeEach(() => {
            jest.spyOn(BaseWebviewCommand, 'setDisposalCallback').mockImplementation(() => {});
            jest.spyOn(BaseWebviewCommand, 'isWebviewTransitionInProgress').mockReturnValue(false);
        });

        it('reopens the projects list when the dashboard closes inside a project workspace', async () => {
            setWorkspaceFolder(path.join(REOPEN_BASE, 'some-project'));
            await activate(createActivationContext());
            mockExecuteCommand.mockClear();

            await disposalCallback()('demoBuilder.projectDashboard');

            // The safety net: a user inside a project must never be left with no
            // Demo Builder navigation surface at all.
            expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.showProjectsList');
        });

        it('does not reopen when no workspace folder is open', async () => {
            setWorkspaceFolder(undefined);
            await activate(createActivationContext());
            mockExecuteCommand.mockClear();

            await disposalCallback()('demoBuilder.projectDashboard');

            expect(mockExecuteCommand).not.toHaveBeenCalledWith('demoBuilder.showProjectsList');
        });

        it('does not reopen when workspaceFolders is an EMPTY list', async () => {
            (vscode.workspace as unknown as { workspaceFolders: unknown[] }).workspaceFolders = [];
            await activate(createActivationContext());
            mockExecuteCommand.mockClear();

            await disposalCallback()('demoBuilder.projectDashboard');

            expect(mockExecuteCommand).not.toHaveBeenCalledWith('demoBuilder.showProjectsList');
        });

        it('does not reopen for a workspace outside the projects base', async () => {
            setWorkspaceFolder('/somewhere/else');
            await activate(createActivationContext());
            mockExecuteCommand.mockClear();

            await disposalCallback()('demoBuilder.projectDashboard');

            expect(mockExecuteCommand).not.toHaveBeenCalledWith('demoBuilder.showProjectsList');
        });
    });

    describe('keeping the home AGENTS.md in step with the current project', () => {
        function projectChangedCallback(): (project: { name?: string } | undefined) => void {
            return mockOnProjectChanged.event.mock.calls[0][0];
        }

        it('subscribes to the current-project pointer', async () => {
            await activate(createActivationContext());

            // Subscribing is what makes naming a project at activation SAFE: the
            // file cannot go stale if it is rewritten whenever the pointer moves.
            expect(mockOnProjectChanged.event).toHaveBeenCalledWith(expect.any(Function));
        });

        it('survives the pointer being CLEARED, not only moved', async () => {
            await activate(createActivationContext());

            // `undefined` rewrites the fallback rather than leaving a name behind
            // that is no longer true.
            expect(() => projectChangedCallback()(undefined)).not.toThrow();
        });

        it('survives the pointer moving to a named project', async () => {
            await activate(createActivationContext());

            expect(() => projectChangedCallback()({ name: 'demo-a' })).not.toThrow();
        });
    });

    describe('the workspace-folder subscription', () => {
        it('rebinds without throwing when the folder changes', async () => {
            await activate(createActivationContext());
            const handler = (vscode.workspace.onDidChangeWorkspaceFolders as jest.Mock).mock
                .calls[0][0];

            // The MCP server is bound to the open folder; a change with no restart
            // leaves it serving a workspace the window has left.
            expect(() => handler()).not.toThrow();
        });
    });

    describe('the third-party tooling gate', () => {
        /** The resolver activation injected into the gate. */
        function injectedResolver(): () => boolean {
            const { setThirdPartyToolsResolver } = jest.requireMock(
                '@/features/project-creation/services/aiBundle/aiToolingGate',
            );
            return (setThirdPartyToolsResolver as jest.Mock).mock.calls[0][0];
        }

        it('reads the opt-out setting, defaulting to enabled', async () => {
            const readKeys: string[] = [];
            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
                get: jest.fn((key: string, fallback: unknown) => {
                    readKeys.push(key);
                    return fallback;
                }),
            });

            await activate(createActivationContext());

            // ONE code point for the gate: the setting is injected here so every
            // seam — creation, regenerate, activation sweep — reads one answer.
            expect(injectedResolver()()).toBe(true);
            expect(readKeys).toContain('ai.enableThirdPartyTools');
        });

        it('reports the gate closed when the setting says so', async () => {
            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
                get: jest.fn((key: string, fallback: unknown) =>
                    key === 'ai.enableThirdPartyTools' ? false : fallback,
                ),
            });

            await activate(createActivationContext());

            expect(injectedResolver()()).toBe(false);
        });
    });

    describe('the sidebar registration', () => {
        it('keeps the sidebar webview alive while it is hidden', async () => {
            await activate(createActivationContext());

            // Without this the sidebar re-renders from scratch every time the
            // Activity Bar loses focus, losing whatever the user was looking at.
            expect(vscode.window.registerWebviewViewProvider).toHaveBeenCalledWith(
                'demoBuilder.sidebar',
                expect.anything(),
                { webviewOptions: { retainContextWhenHidden: true } },
            );
        });
    });

    describe('the version it reports', () => {
        it('falls back when the manifest carries no version', async () => {
            const context = createActivationContext();
            (context as { extension: { packageJSON: Record<string, unknown> } }).extension = {
                packageJSON: {},
            };

            await activate(context);

            expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
        });
    });

    describe('re-homing creates the root it is about to open', () => {
        it('makes the projects directory before opening the folder', async () => {
            const fs = require('fs/promises');
            setWorkspaceFolder(path.join(resolveProjectsRoot(), 'some-project'));

            await activate(createActivationContext());

            // recursive: a first run has no ~/.demo-builder either, and opening a
            // folder that does not exist leaves VS Code on an empty window.
            expect(fs.mkdir).toHaveBeenCalledWith(resolveProjectsRoot(), { recursive: true });
        });
    });
});
