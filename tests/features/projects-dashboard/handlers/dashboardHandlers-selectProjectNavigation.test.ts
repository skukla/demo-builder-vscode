/**
 * Tests for selectProject handler navigation enhancement
 *
 * Tests that selectProject navigates to project dashboard after selecting a project.
 */


import * as vscode from 'vscode';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import {
    handleSelectProject,
} from '@/features/projects-dashboard/handlers/dashboardHandlers';
import {
    createProjectsDashboardProject,
    createProjectsDashboardContext,
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
            const project = createProjectsDashboardProject({ name: 'Navigation Test Project' });
            const context = createProjectsDashboardContext([project]);
            setMockWorkspaceFolder(project.path);

            // When: selectProject is called
            await handleSelectProject(context, {
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
            const project = createProjectsDashboardProject({ name: 'Order Test Project' });
            const context = createProjectsDashboardContext([project]);
            setMockWorkspaceFolder(project.path);
            const callOrder: string[] = [];

            context.stateManager.saveProject.mockImplementation(async () => {
                callOrder.push('saveProject');
            });
            mockExecuteCommand.mockImplementation(async (cmd: string) => {
                callOrder.push(`command:${cmd}`);
            });

            // When: selectProject is called
            await handleSelectProject(context, {
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
            const context = createProjectsDashboardContext([]);
            const os = require('os');
            const path = require('path');
            const validPath = path.join(os.homedir(), '.demo-builder', 'projects', 'missing');

            // When: selectProject is called with valid but empty path
            const result = await handleSelectProject(context, {
                projectPath: validPath,
            });

            // Then: showProjectDashboard should NOT be executed
            expect(mockExecuteCommand).not.toHaveBeenCalled();
            expect(result.success).toBe(false);
        });

        it('should NOT execute showProjectDashboard if path validation fails', async () => {
            // Given: An invalid path (security violation)
            const context = createProjectsDashboardContext([]);

            // When: selectProject is called with invalid path
            const result = await handleSelectProject(context, {
                projectPath: '/etc/passwd',
            });

            // Then: showProjectDashboard should NOT be executed
            expect(mockExecuteCommand).not.toHaveBeenCalled();
            expect(result.success).toBe(false);
        });

        it('should return success even if showProjectDashboard fails', async () => {
            // Given: A valid project but showProjectDashboard command fails
            const project = createProjectsDashboardProject({ name: 'Error Test Project' });
            const context = createProjectsDashboardContext([project]);
            setMockWorkspaceFolder(project.path);
            mockExecuteCommand.mockRejectedValue(new Error('Command failed'));

            // When: selectProject is called
            const result = await handleSelectProject(context, {
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
            const project = createProjectsDashboardProject({ name: 'Anchor Test' });
            const context = createProjectsDashboardContext([project]);
            setMockWorkspaceFolder(null);

            // When: selectProject is called (plain, no forceNewWindow)
            await handleSelectProject(context, {
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
            const project = createProjectsDashboardProject({ name: 'Anchor Test 2' });
            const context = createProjectsDashboardContext([project]);
            setMockWorkspaceFolder('/some/other/folder');

            await handleSelectProject(context, {
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
            const project = createProjectsDashboardProject({ name: 'New Window Test' });
            const context = createProjectsDashboardContext([project]);
            setMockWorkspaceFolder('/some/other/folder');

            await handleSelectProject(context, {
                projectPath: project.path,
                forceNewWindow: true,
            });

            expect(mockExecuteCommand).toHaveBeenCalledWith(
                'vscode.openFolder',
                expect.objectContaining({ fsPath: project.path }),
                true,
            );
        });

        it('opens in NEW window even when workspace already matches if forceNewWindow=true', async () => {
            // Edge case: user is already in the project workspace but shift-clicks the tile.
            // Intent: spawn another window for the same project (rare but supported).
            const project = createProjectsDashboardProject({ name: 'Force New' });
            const context = createProjectsDashboardContext([project]);
            setMockWorkspaceFolder(project.path);

            await handleSelectProject(context, {
                projectPath: project.path,
                forceNewWindow: true,
            });

            expect(mockExecuteCommand).toHaveBeenCalledWith(
                'vscode.openFolder',
                expect.objectContaining({ fsPath: project.path }),
                true,
            );
        });

        it('does NOT call openFolder when workspace already matches and forceNewWindow is absent/false', async () => {
            const project = createProjectsDashboardProject({ name: 'No Reload' });
            const context = createProjectsDashboardContext([project]);
            setMockWorkspaceFolder(project.path);

            await handleSelectProject(context, {
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

    describe('unexpected failures', () => {
        it('reports a failure rather than throwing when the load itself rejects', async () => {
            const project = createProjectsDashboardProject({ name: 'Load Failure' });
            const context = createProjectsDashboardContext([project]);
            context.stateManager.loadProjectFromPath.mockRejectedValue(new Error('io error'));

            const result = await handleSelectProject(context, { projectPath: project.path });

            expect(mockExecuteCommand).not.toHaveBeenCalled();
            expect(result).toEqual({ success: false, error: 'Failed to select project' });
        });

        it('reports a failure when setting the current-project pointer rejects', async () => {
            const project = createProjectsDashboardProject({ name: 'Save Failure' });
            const context = createProjectsDashboardContext([project]);
            context.stateManager.saveProject.mockRejectedValue(new Error('disk full'));

            const result = await handleSelectProject(context, { projectPath: project.path });

            // Navigation must not happen off a pointer that was never written.
            expect(mockExecuteCommand).not.toHaveBeenCalled();
            expect(result).toEqual({ success: false, error: 'Failed to select project' });
        });
    });

    describe('surface selection and the webview transition', () => {
        it('opens the Integrations webview when the payload names that surface', async () => {
            const project = createProjectsDashboardProject({ name: 'Integrations Target' });
            const context = createProjectsDashboardContext([project]);

            await handleSelectProject(context, {
                projectPath: project.path,
                surface: 'integrations',
            });

            // Selection is otherwise identical — only WHICH webview opens changes.
            expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.showIntegrations');
            expect(mockExecuteCommand).not.toHaveBeenCalledWith(
                'demoBuilder.showProjectDashboard',
            );
            expect(context.stateManager.saveProject).toHaveBeenCalledWith(project);
        });

        it('holds the transition open across the navigation and closes it afterwards', async () => {
            const project = createProjectsDashboardProject({ name: 'Transition Target' });
            const context = createProjectsDashboardContext([project]);
            let openDuringNavigation: boolean | undefined;
            mockExecuteCommand.mockImplementation(async () => {
                openDuringNavigation = BaseWebviewCommand.isWebviewTransitionInProgress();
            });

            await handleSelectProject(context, { projectPath: project.path });

            // The outgoing Projects List must not dispose mid-handoff...
            expect(openDuringNavigation).toBe(true);
            // ...and the flag must not be left set once the handoff is done.
            expect(BaseWebviewCommand.isWebviewTransitionInProgress()).toBe(false);
        });

        it('closes the transition even when the navigation command rejects', async () => {
            const project = createProjectsDashboardProject({ name: 'Transition Failure' });
            const context = createProjectsDashboardContext([project]);
            mockExecuteCommand.mockRejectedValue(new Error('no webview'));

            await handleSelectProject(context, { projectPath: project.path });

            // A stuck flag would block every later webview handoff for the session.
            expect(BaseWebviewCommand.isWebviewTransitionInProgress()).toBe(false);
        });
    });
});
