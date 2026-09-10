/**
 * BaseCommand — the prompt helpers and the terminal working directory.
 *
 * `confirm` is the modal every destructive command goes through, and
 * `getTerminalCwd` decides where a command's terminal opens: the project's PARENT
 * directory, so an operation like a Homebrew install runs outside the project it is
 * about. Both were reachable only through their callers until now, so nothing pinned
 * the modal shape or the three-step fallback.
 */

import * as path from 'path';
import * as vscode from 'vscode';
import { BaseCommand } from '@/core/base/baseCommand';
import { createMockLogger } from '../../helpers/loggerFake';
import { createMockExtensionContext } from '../../helpers/extensionContextFake';
import { createMockProject } from '../../helpers/projectFake';
import { createMockStateManager } from '../../helpers/stateManagerFake';

class TestCommand extends BaseCommand {
    public async execute(): Promise<void> {
        // Nothing to do — the helpers below are the subject.
    }

    public runConfirm(message: string, detail?: string): Promise<boolean> {
        return this.confirm(message, detail);
    }

    public runShowQuickPick<T extends vscode.QuickPickItem>(
        items: T[],
        options?: vscode.QuickPickOptions
    ): Promise<T | undefined> {
        return this.showQuickPick(items, options);
    }

    public runShowInputBox(options?: vscode.InputBoxOptions): Promise<string | undefined> {
        return this.showInputBox(options);
    }

    public runCreateTerminal(
        name: string,
        cwd?: string,
        location?: vscode.TerminalEditorLocationOptions
    ): vscode.Terminal {
        return this.createTerminal(name, cwd, location);
    }

    public runGetTerminalCwd(): Promise<string> {
        return this.getTerminalCwd();
    }
}

describe('BaseCommand prompt helpers', () => {
    let command: TestCommand;
    let getCurrentProject: jest.Mock;

    /**
     * `workspaceFolders` is readonly on the real type; the manual mock makes it a
     * plain property, so it is written through the module object.
     */
    function setWorkspaceFolders(folders: unknown[] | undefined): void {
        (
            vscode.workspace as unknown as { workspaceFolders: unknown[] | undefined }
        ).workspaceFolders = folders;
    }

    beforeEach(() => {
        jest.clearAllMocks();
        getCurrentProject = jest.fn().mockResolvedValue(undefined);
        command = new TestCommand(
            createMockExtensionContext(),
            createMockStateManager({ getCurrentProject }),
            createMockLogger(),
        );
        setWorkspaceFolders([]);
    });

    afterEach(() => {
        setWorkspaceFolders([]);
    });

    describe('confirm', () => {
        it('asks modally with Yes and No, and reports true only for Yes', async () => {
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Yes');

            const answer = await command.runConfirm('Delete the project?', 'This cannot be undone');

            expect(answer).toBe(true);
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                'Delete the project?',
                { modal: true, detail: 'This cannot be undone' },
                'Yes',
                'No'
            );
        });

        it('reports false when the SC picks No', async () => {
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('No');

            expect(await command.runConfirm('Delete the project?')).toBe(false);
        });

        it('reports false when the modal is dismissed', async () => {
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);

            expect(await command.runConfirm('Delete the project?')).toBe(false);
        });
    });

    describe('the pass-through pickers', () => {
        it('hands the items and options to showQuickPick and returns the choice', async () => {
            const items = [{ label: 'alpha' }, { label: 'beta' }];
            const options = { placeHolder: 'Pick one' };
            (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(items[1]);

            const chosen = await command.runShowQuickPick(items, options);

            expect(chosen).toBe(items[1]);
            expect(vscode.window.showQuickPick).toHaveBeenCalledWith(items, options);
        });

        it('hands the options to showInputBox and returns what was typed', async () => {
            const options = { prompt: 'Commit message' };
            (vscode.window.showInputBox as jest.Mock).mockResolvedValue('fix: a thing');

            const typed = await command.runShowInputBox(options);

            expect(typed).toBe('fix: a thing');
            expect(vscode.window.showInputBox).toHaveBeenCalledWith(options);
        });
    });

    describe('createTerminal', () => {
        it('omits the location key entirely when no location is asked for', () => {
            command.runCreateTerminal('Build', '/projects/alpha');

            expect((vscode.window.createTerminal as jest.Mock).mock.calls[0][0]).toStrictEqual({
                name: 'Build',
                cwd: '/projects/alpha',
            });
        });

        it('treats an empty cwd as no cwd at all', () => {
            command.runCreateTerminal('Build', '');

            expect((vscode.window.createTerminal as jest.Mock).mock.calls[0][0]).toStrictEqual({
                name: 'Build',
                cwd: undefined,
            });
        });
    });

    describe('getTerminalCwd', () => {
        it("returns the project's PARENT directory when a project is loaded", async () => {
            getCurrentProject.mockResolvedValue(
                createMockProject({ path: path.join('/projects', 'alpha') }),
            );

            expect(await command.runGetTerminalCwd()).toBe('/projects');
            expect(vscode.window.createTerminal).not.toHaveBeenCalled();
        });

        it('falls back to the first workspace folder when no project is loaded', async () => {
            setWorkspaceFolders([{ uri: { fsPath: '/workspace/root' }, name: 'root', index: 0 }]);

            expect(await command.runGetTerminalCwd()).toBe('/workspace/root');
        });

        it('falls back to the workspace folder when the project has no path', async () => {
            getCurrentProject.mockResolvedValue(createMockProject({ path: '' }));
            setWorkspaceFolders([{ uri: { fsPath: '/workspace/root' }, name: 'root', index: 0 }]);

            expect(await command.runGetTerminalCwd()).toBe('/workspace/root');
        });

        it('falls back to the process cwd when the window has no folders open', async () => {
            setWorkspaceFolders([]);

            expect(await command.runGetTerminalCwd()).toBe(process.cwd());
        });

        it('falls back to the process cwd when there is no workspace at all', async () => {
            setWorkspaceFolders(undefined);

            expect(await command.runGetTerminalCwd()).toBe(process.cwd());
        });
    });
});
