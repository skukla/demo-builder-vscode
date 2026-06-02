/**
 * Tests for selectProject handler navigation enhancement
 *
 * Tests that selectProject navigates to project dashboard after selecting a project.
 */

// Mock vscode - must be before imports due to hoisting
jest.mock('vscode', () => ({
    commands: {
        executeCommand: jest.fn(),
    },
    workspace: {
        workspaceFolders: undefined as { uri: { fsPath: string } }[] | undefined,
    },
    Uri: {
        file: jest.fn((p: string) => ({ fsPath: p, scheme: 'file' })),
    },
}), { virtual: true });

// Make filesystem path-safety checks deterministic and independent of the host.
// validateProjectPath() canonicalizes via fs.realpathSync; identity realpathSync
// lets valid in-tree project paths validate without requiring a real
// ~/.demo-builder/projects directory on disk (the security prefix check is
// unaffected — traversal paths still resolve outside the allowed base).
jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    realpathSync: jest.fn((p: string) => p),
}));

import * as vscode from 'vscode';
import {
    handleSelectProject,
} from '@/features/projects-dashboard/handlers/dashboardHandlers';
import {
    createMockProject,
    createMockHandlerContext,
} from '../testUtils';

const mockExecuteCommand = vscode.commands.executeCommand as jest.Mock;

/** Set the mocked workspaceFolders for a single test. */
function setMockWorkspaceFolder(path: string | null): void {
    const ws = vscode.workspace as unknown as { workspaceFolders: { uri: { fsPath: string } }[] | undefined };
    ws.workspaceFolders = path === null ? undefined : [{ uri: { fsPath: path } }];
}

describe('handleSelectProject - Navigation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        setMockWorkspaceFolder(null); // default: no workspace open
    });

    describe('showProjectDashboard command execution', () => {
        it('navigates to dashboard in-place on a plain selection (no browse reload)', async () => {
            // Given: A valid project and the workspace folder is already the project
            const project = createMockProject({ name: 'Navigation Test Project' });
            const context = createMockHandlerContext([project]);
            setMockWorkspaceFolder(project.path);

            // When: selectProject is called
            await handleSelectProject(context as any, {
                projectPath: project.path,
            });

            // Then: showProjectDashboard command should be executed (and openFolder NOT)
            expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.showProjectDashboard');
            expect(mockExecuteCommand).not.toHaveBeenCalledWith(
                'vscode.openFolder',
                expect.anything(),
                expect.anything(),
            );
        });

        it('should execute showProjectDashboard after saveProject completes', async () => {
            // Given: A valid project (plain selection → in-place, no openFolder reload)
            const project = createMockProject({ name: 'Order Test Project' });
            const context = createMockHandlerContext([project]);
            setMockWorkspaceFolder(project.path);
            const callOrder: string[] = [];

            context.stateManager.saveProject.mockImplementation(async () => {
                callOrder.push('saveProject');
            });
            mockExecuteCommand.mockImplementation(async (cmd: string) => {
                callOrder.push(`command:${cmd}`);
            });

            // When: selectProject is called
            await handleSelectProject(context as any, {
                projectPath: project.path,
            });

            // Then: saveProject should be called before showProjectDashboard
            expect(callOrder).toEqual([
                'saveProject',
                'command:demoBuilder.showProjectDashboard',
            ]);
        });

        it('should NOT execute showProjectDashboard if project not found', async () => {
            // Given: No projects exist at the valid path
            const context = createMockHandlerContext([]);
            const os = require('os');
            const path = require('path');
            const validPath = path.join(os.homedir(), '.demo-builder', 'projects', 'missing');

            // When: selectProject is called with valid but empty path
            const result = await handleSelectProject(context as any, {
                projectPath: validPath,
            });

            // Then: showProjectDashboard should NOT be executed
            expect(mockExecuteCommand).not.toHaveBeenCalled();
            expect(result.success).toBe(false);
        });

        it('should NOT execute showProjectDashboard if path validation fails', async () => {
            // Given: An invalid path (security violation)
            const context = createMockHandlerContext([]);

            // When: selectProject is called with invalid path
            const result = await handleSelectProject(context as any, {
                projectPath: '/etc/passwd',
            });

            // Then: showProjectDashboard should NOT be executed
            expect(mockExecuteCommand).not.toHaveBeenCalled();
            expect(result.success).toBe(false);
        });

        it('should return success even if showProjectDashboard fails', async () => {
            // Given: A valid project but showProjectDashboard command fails
            const project = createMockProject({ name: 'Error Test Project' });
            const context = createMockHandlerContext([project]);
            setMockWorkspaceFolder(project.path);
            mockExecuteCommand.mockRejectedValue(new Error('Command failed'));

            // When: selectProject is called
            const result = await handleSelectProject(context as any, {
                projectPath: project.path,
            });

            // Then: Should still return success (project was selected)
            // Navigation failure is non-critical
            expect(result.success).toBe(true);
            expect(context.logger.error).toHaveBeenCalled();
        });
    });

    describe('workspace anchoring', () => {
        it('does NOT reload on a plain selection when no workspace is open — renders in-place', async () => {
            // Given: A valid project AND no workspace folder open
            const project = createMockProject({ name: 'Anchor Test' });
            const context = createMockHandlerContext([project]);
            setMockWorkspaceFolder(null);

            // When: selectProject is called (plain, no forceNewWindow)
            await handleSelectProject(context as any, {
                projectPath: project.path,
            });

            // Then: NO openFolder reload — browsing never anchors the workspace.
            expect(mockExecuteCommand).not.toHaveBeenCalledWith(
                'vscode.openFolder',
                expect.anything(),
                expect.anything(),
            );
            // The dashboard is surfaced in-place instead.
            expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.showProjectDashboard');
        });

        it('does NOT reload on a plain selection when the workspace is a different folder — renders in-place', async () => {
            const project = createMockProject({ name: 'Anchor Test 2' });
            const context = createMockHandlerContext([project]);
            setMockWorkspaceFolder('/some/other/folder');

            await handleSelectProject(context as any, {
                projectPath: project.path,
            });

            // Plain selection never anchors, even when the open workspace differs.
            expect(mockExecuteCommand).not.toHaveBeenCalledWith(
                'vscode.openFolder',
                expect.anything(),
                expect.anything(),
            );
            expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.showProjectDashboard');
        });

        it('opens the project folder in a NEW window when forceNewWindow is true', async () => {
            const project = createMockProject({ name: 'New Window Test' });
            const context = createMockHandlerContext([project]);
            setMockWorkspaceFolder('/some/other/folder');

            await handleSelectProject(context as any, {
                projectPath: project.path,
                forceNewWindow: true,
            } as any);

            expect(mockExecuteCommand).toHaveBeenCalledWith(
                'vscode.openFolder',
                expect.objectContaining({ fsPath: project.path }),
                true,
            );
        });

        it('opens in NEW window even when workspace already matches if forceNewWindow=true', async () => {
            // Edge case: user is already in the project workspace but shift-clicks the tile.
            // Intent: spawn another window for the same project (rare but supported).
            const project = createMockProject({ name: 'Force New' });
            const context = createMockHandlerContext([project]);
            setMockWorkspaceFolder(project.path);

            await handleSelectProject(context as any, {
                projectPath: project.path,
                forceNewWindow: true,
            } as any);

            expect(mockExecuteCommand).toHaveBeenCalledWith(
                'vscode.openFolder',
                expect.objectContaining({ fsPath: project.path }),
                true,
            );
        });

        it('does NOT call openFolder when workspace already matches and forceNewWindow is absent/false', async () => {
            const project = createMockProject({ name: 'No Reload' });
            const context = createMockHandlerContext([project]);
            setMockWorkspaceFolder(project.path);

            await handleSelectProject(context as any, {
                projectPath: project.path,
            });

            expect(mockExecuteCommand).not.toHaveBeenCalledWith(
                'vscode.openFolder',
                expect.anything(),
                expect.anything(),
            );
            expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.showProjectDashboard');
        });
    });
});
