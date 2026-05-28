/**
 * openProjectAsWorkspace — opens a freshly-created project as the current
 * window's VS Code workspace so Claude Code (and other workspace-scoped
 * tooling) sees the project's `.claude/`, `.mcp.json`, and `AGENTS.md`.
 *
 * Called as the final step of project creation, after AI context files and
 * MCP registration complete. Skips the openFolder call when the workspace
 * already matches the project (rare but possible — defends against an
 * unnecessary window reload).
 */

import * as vscode from 'vscode';
import { openProjectAsWorkspace } from '@/features/project-creation/services/projectFinalizationService';

function makeLogger(): { info: jest.Mock; warn: jest.Mock; error: jest.Mock; debug: jest.Mock } {
    return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function setMockWorkspaceFolder(path: string | null): void {
    (vscode.workspace as unknown as { workspaceFolders: { uri: { fsPath: string } }[] | undefined }).workspaceFolders =
        path === null ? undefined : [{ uri: { fsPath: path } }];
}

describe('openProjectAsWorkspace', () => {
    const mockExecuteCommand = vscode.commands.executeCommand as jest.Mock;
    const mockUriFile = vscode.Uri.file as jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        setMockWorkspaceFolder(null);
    });

    it('opens the project folder as workspace (current window) when no workspace is open', async () => {
        const logger = makeLogger();
        setMockWorkspaceFolder(null);

        await openProjectAsWorkspace('/projects/new-demo', logger as never);

        expect(mockUriFile).toHaveBeenCalledWith('/projects/new-demo');
        expect(mockExecuteCommand).toHaveBeenCalledWith(
            'vscode.openFolder',
            expect.objectContaining({ fsPath: '/projects/new-demo' }),
            false,
        );
    });

    it('opens the project folder as workspace when current workspace is a different folder', async () => {
        const logger = makeLogger();
        setMockWorkspaceFolder('/some/other/repo');

        await openProjectAsWorkspace('/projects/new-demo', logger as never);

        expect(mockExecuteCommand).toHaveBeenCalledWith(
            'vscode.openFolder',
            expect.objectContaining({ fsPath: '/projects/new-demo' }),
            false,
        );
    });

    it('does NOT call openFolder when workspace already matches the project (no unnecessary reload)', async () => {
        const logger = makeLogger();
        setMockWorkspaceFolder('/projects/new-demo');

        await openProjectAsWorkspace('/projects/new-demo', logger as never);

        expect(mockExecuteCommand).not.toHaveBeenCalled();
    });

    it('logs and swallows errors when openFolder throws (project creation succeeded; window switch is best-effort)', async () => {
        const logger = makeLogger();
        setMockWorkspaceFolder(null);
        mockExecuteCommand.mockRejectedValueOnce(new Error('Cannot open folder'));

        await expect(openProjectAsWorkspace('/projects/new-demo', logger as never)).resolves.toBeUndefined();
        expect(logger.warn).toHaveBeenCalled();
    });
});
