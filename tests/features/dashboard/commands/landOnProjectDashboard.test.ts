/**
 * Tests for the post-reload "land on the project Dashboard" activation routing.
 *
 * When the extension re-activates in a window anchored to a Demo Builder project
 * (after a `vscode.openFolder` reload, File -> Open Recent, or `code <dir>`), we
 * want to land on THAT project's Dashboard instead of the projects-list start
 * screen. `workspaceFolders[0]` is the ground truth for which project; state is
 * reconciled from it when stale.
 *
 * Ordering is the crux: the Dashboard panel must be opened BEFORE the Activity
 * Bar is focused, so the tree-view visibility handler's projects-list auto-open
 * sees a non-zero panel count and stays out of the way.
 */

import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { landOnProjectDashboardForWorkspace } from '@/features/dashboard/commands/showDashboard';
import type { Project } from '@/types';

const PROJECTS_BASE = path.join(os.homedir(), '.demo-builder', 'projects');
const PROJECT_PATH = path.join(PROJECTS_BASE, 'my-demo');

const mockExecuteCommand = vscode.commands.executeCommand as jest.Mock;

interface MockStateManager {
    getCurrentProject: jest.Mock;
    loadProjectFromPath: jest.Mock;
    saveProject: jest.Mock;
}

function createMockStateManager(): MockStateManager {
    return {
        getCurrentProject: jest.fn(),
        loadProjectFromPath: jest.fn(),
        saveProject: jest.fn(),
    };
}

function createMockLogger() {
    return { warn: jest.fn(), info: jest.fn(), debug: jest.fn(), error: jest.fn() };
}

function projectAt(p: string): Project {
    return { name: 'My Demo', path: p } as Project;
}

describe('landOnProjectDashboardForWorkspace', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns false and does nothing when the workspace folder is undefined', async () => {
        const stateManager = createMockStateManager();

        const landed = await landOnProjectDashboardForWorkspace(undefined, stateManager as any, createMockLogger() as any);

        expect(landed).toBe(false);
        expect(stateManager.getCurrentProject).not.toHaveBeenCalled();
        expect(mockExecuteCommand).not.toHaveBeenCalled();
    });

    it('returns false and does nothing when the workspace folder is not a Demo Builder project', async () => {
        const stateManager = createMockStateManager();

        const landed = await landOnProjectDashboardForWorkspace(
            '/Users/test/some-other-repo',
            stateManager as any,
            createMockLogger() as any,
        );

        expect(landed).toBe(false);
        expect(stateManager.getCurrentProject).not.toHaveBeenCalled();
        expect(mockExecuteCommand).not.toHaveBeenCalled();
    });

    it('shows the Dashboard then focuses the Activity Bar (in that order) when state already matches', async () => {
        const stateManager = createMockStateManager();
        stateManager.getCurrentProject.mockResolvedValue(projectAt(PROJECT_PATH));
        const callOrder: string[] = [];
        mockExecuteCommand.mockImplementation(async (cmd: string) => {
            callOrder.push(cmd);
        });

        const landed = await landOnProjectDashboardForWorkspace(PROJECT_PATH, stateManager as any, createMockLogger() as any);

        expect(landed).toBe(true);
        // No reconciliation needed when the cached project already matches.
        expect(stateManager.loadProjectFromPath).not.toHaveBeenCalled();
        expect(stateManager.saveProject).not.toHaveBeenCalled();
        // Dashboard panel created BEFORE the Activity Bar focus (ordering guard).
        expect(callOrder).toEqual([
            'demoBuilder.showProjectDashboard',
            'workbench.view.extension.demoBuilder',
        ]);
    });

    it('reconciles state from the workspace folder when the cached project is stale', async () => {
        const stateManager = createMockStateManager();
        const stalePath = path.join(PROJECTS_BASE, 'a-different-project');
        stateManager.getCurrentProject.mockResolvedValue(projectAt(stalePath));
        stateManager.loadProjectFromPath.mockResolvedValue(projectAt(PROJECT_PATH));

        const landed = await landOnProjectDashboardForWorkspace(PROJECT_PATH, stateManager as any, createMockLogger() as any);

        expect(landed).toBe(true);
        expect(stateManager.loadProjectFromPath).toHaveBeenCalledWith(PROJECT_PATH);
        expect(stateManager.saveProject).toHaveBeenCalledWith(projectAt(PROJECT_PATH));
        expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.showProjectDashboard');
        expect(mockExecuteCommand).toHaveBeenCalledWith('workbench.view.extension.demoBuilder');
    });

    it('reconciles state when there is no cached current project at all', async () => {
        const stateManager = createMockStateManager();
        stateManager.getCurrentProject.mockResolvedValue(undefined);
        stateManager.loadProjectFromPath.mockResolvedValue(projectAt(PROJECT_PATH));

        const landed = await landOnProjectDashboardForWorkspace(PROJECT_PATH, stateManager as any, createMockLogger() as any);

        expect(landed).toBe(true);
        expect(stateManager.loadProjectFromPath).toHaveBeenCalledWith(PROJECT_PATH);
        expect(stateManager.saveProject).toHaveBeenCalledWith(projectAt(PROJECT_PATH));
    });

    it('falls back (returns false, no Dashboard) when the project cannot be loaded', async () => {
        const stateManager = createMockStateManager();
        const logger = createMockLogger();
        stateManager.getCurrentProject.mockResolvedValue(undefined);
        stateManager.loadProjectFromPath.mockResolvedValue(null);

        const landed = await landOnProjectDashboardForWorkspace(PROJECT_PATH, stateManager as any, logger as any);

        expect(landed).toBe(false);
        expect(stateManager.saveProject).not.toHaveBeenCalled();
        expect(mockExecuteCommand).not.toHaveBeenCalledWith('demoBuilder.showProjectDashboard');
        expect(logger.warn).toHaveBeenCalled();
    });
});
