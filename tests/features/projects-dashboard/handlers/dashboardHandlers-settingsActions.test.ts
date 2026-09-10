/**
 * Dashboard handlers — settings, view mode, and demo-control actions.
 *
 * These handlers are thin by design: their whole job is WHICH collaborator they
 * call and WITH WHAT. So every assertion here reads the arguments a collaborator
 * received, not the answer a mock gave back — a mock returns the same value
 * however it is called, so asserting the answer would test the mock.
 */

import * as vscode from 'vscode';
import { sessionUIState } from '@/core/state/sessionUIState';
import {
    handleCopyFromExisting,
    handleExportProject,
    handleImportFromFile,
    handleOpenBrowser,
    handleOpenHelp,
    handleOpenSettings,
    handleSetProjectPinned,
    handleSetViewModeOverride,
    handleStartDemo,
    handleStopDemo,
    mockCopySettingsFromProject,
    mockExportProjectSettings,
    mockImportSettingsFromFile,
} from './dashboardHandlers-actions.testUtils';
import { createProjectsDashboardContext, createProjectsDashboardProject } from '../testUtils';

const mockExecuteCommand = vscode.commands.executeCommand as jest.Mock;
const mockOpenExternal = vscode.env.openExternal as jest.Mock;

const OUTSIDE_PATH = '/tmp/not-a-demo-builder-project';

/**
 * A pin payload as it can actually ARRIVE — off the webview wire, where nothing
 * has checked it. The handler's runtime guard exists precisely for shapes the
 * declared type says are impossible, so the suite has to be able to send one.
 * `as unknown as` keeps the target type NAMED, so every use below is still
 * checked against it.
 */
function malformedPin(payload: object): { projectPath: string; pinned: boolean } {
    return payload as unknown as { projectPath: string; pinned: boolean };
}

beforeEach(() => {
    jest.clearAllMocks();
    sessionUIState.reset();
    mockExecuteCommand.mockResolvedValue(undefined);
    mockOpenExternal.mockResolvedValue(true);
});

describe('handleOpenHelp', () => {
    it('opens the issues URL externally and reports success', async () => {
        const context = createProjectsDashboardContext([]);

        const result = await handleOpenHelp(context);

        expect(mockOpenExternal).toHaveBeenCalledTimes(1);
        // `Uri.parse` in the vscode fake keeps the string on `.toString()`.
        expect(String(mockOpenExternal.mock.calls[0][0])).toContain('/issues');
        expect(result).toEqual({ success: true });
    });

    it('reports failure without throwing when the browser cannot be opened', async () => {
        const context = createProjectsDashboardContext([]);
        mockOpenExternal.mockRejectedValue(new Error('no browser'));

        const result = await handleOpenHelp(context);

        expect(result).toEqual({ success: false, error: 'Failed to open help' });
    });
});

describe('handleOpenSettings', () => {
    it('opens VS Code settings scoped to this extension', async () => {
        const context = createProjectsDashboardContext([]);

        const result = await handleOpenSettings(context);

        // Both arguments matter: the command AND the filter that scopes it to us.
        expect(mockExecuteCommand).toHaveBeenCalledWith(
            'workbench.action.openSettings',
            '@ext:adobe.demo-builder',
        );
        expect(result).toEqual({ success: true });
    });

    it('reports failure when the settings command rejects', async () => {
        const context = createProjectsDashboardContext([]);
        mockExecuteCommand.mockRejectedValue(new Error('no settings'));

        const result = await handleOpenSettings(context);

        expect(result).toEqual({ success: false, error: 'Failed to open settings' });
    });
});

describe('handleSetViewModeOverride', () => {
    it('records the requested view mode on the session state', async () => {
        const context = createProjectsDashboardContext([]);

        const result = await handleSetViewModeOverride(context, { viewMode: 'rows' });

        expect(sessionUIState.viewModeOverride).toBe('rows');
        expect(result).toEqual({ success: true });
    });

    it('leaves the existing override alone when no payload is given', async () => {
        const context = createProjectsDashboardContext([]);
        sessionUIState.viewModeOverride = 'cards';

        const result = await handleSetViewModeOverride(context);

        expect(sessionUIState.viewModeOverride).toBe('cards');
        expect(result).toEqual({ success: true });
    });
});

describe('settings transfer delegation', () => {
    it('handleImportFromFile hands the context straight to importSettingsFromFile', async () => {
        const context = createProjectsDashboardContext([]);
        mockImportSettingsFromFile.mockResolvedValue({ success: true, data: { imported: 1 } });

        const result = await handleImportFromFile(context);

        expect(mockImportSettingsFromFile).toHaveBeenCalledWith(context);
        expect(result).toEqual({ success: true, data: { imported: 1 } });
    });

    it('handleCopyFromExisting hands the context straight to copySettingsFromProject', async () => {
        const context = createProjectsDashboardContext([]);
        mockCopySettingsFromProject.mockResolvedValue({ success: false, error: 'cancelled' });

        const result = await handleCopyFromExisting(context);

        expect(mockCopySettingsFromProject).toHaveBeenCalledWith(context);
        expect(result).toEqual({ success: false, error: 'cancelled' });
    });
});

describe('handleExportProject', () => {
    it('exports the LOADED project, loaded without persisting the pointer', async () => {
        const project = createProjectsDashboardProject();
        const context = createProjectsDashboardContext([project]);
        mockExportProjectSettings.mockResolvedValue({ success: true });

        const result = await handleExportProject(context, { projectPath: project.path });

        expect(context.stateManager.loadProjectFromPath).toHaveBeenCalledWith(
            project.path,
            undefined,
            { persistAfterLoad: false },
        );
        // Exporting must never move the current-project pointer.
        expect(context.stateManager.saveProject).not.toHaveBeenCalled();
        expect(mockExportProjectSettings).toHaveBeenCalledWith(context, project);
        expect(result).toEqual({ success: true });
    });

    it('refuses a missing path before touching the state manager', async () => {
        const context = createProjectsDashboardContext([]);

        const result = await handleExportProject(context);

        expect(context.stateManager.loadProjectFromPath).not.toHaveBeenCalled();
        expect(mockExportProjectSettings).not.toHaveBeenCalled();
        expect(result).toEqual({ success: false, error: 'No project path provided' });
    });

    it('refuses a path outside the projects directory before loading', async () => {
        const context = createProjectsDashboardContext([]);

        const result = await handleExportProject(context, { projectPath: OUTSIDE_PATH });

        expect(context.stateManager.loadProjectFromPath).not.toHaveBeenCalled();
        expect(result).toEqual({ success: false, error: 'Invalid project path' });
    });

    it('reports not-found rather than exporting when the project will not load', async () => {
        const project = createProjectsDashboardProject();
        const context = createProjectsDashboardContext([]);

        const result = await handleExportProject(context, { projectPath: project.path });

        expect(mockExportProjectSettings).not.toHaveBeenCalled();
        expect(result).toEqual({ success: false, error: 'Project not found' });
    });
});

describe('demo control handlers', () => {
    /**
     * Which COMMAND each handler dispatches is the whole of its behaviour, and
     * `executeCommandForProject` is deliberately not mocked so the assertion
     * lands on the command id that actually reached vscode.
     */
    const cases: [string, typeof handleStartDemo, string][] = [
        ['handleStartDemo', handleStartDemo, 'demoBuilder.startDemo'],
        ['handleStopDemo', handleStopDemo, 'demoBuilder.stopDemo'],
        ['handleOpenBrowser', handleOpenBrowser, 'demoBuilder.openBrowser'],
    ];

    it.each(cases)('%s sets the pointer then dispatches %s', async (_name, handler, commandId) => {
        const project = createProjectsDashboardProject();
        const context = createProjectsDashboardContext([project]);

        const result = await handler(context, { projectPath: project.path });

        expect(context.stateManager.saveProject).toHaveBeenCalledWith(project);
        expect(mockExecuteCommand).toHaveBeenCalledWith(commandId);
        expect(result).toEqual({ success: true });
    });

    it.each(cases)('%s refuses an absent payload instead of throwing', async (_name, handler) => {
        const context = createProjectsDashboardContext([]);

        const result = await handler(context);

        expect(mockExecuteCommand).not.toHaveBeenCalled();
        expect(result).toEqual({ success: false, error: 'Project path is required' });
    });
});

describe('handleSetProjectPinned', () => {
    it('writes the pinned flag config-only and echoes the resulting state', async () => {
        const project = createProjectsDashboardProject();
        const context = createProjectsDashboardContext([project]);

        const result = await handleSetProjectPinned(context, {
            projectPath: project.path,
            pinned: true,
        });

        // saveProjectConfigOnly, NOT saveProject: pinning from the home kebab must
        // not replace the current project or fire onProjectChanged.
        expect(context.stateManager.saveProject).not.toHaveBeenCalled();
        expect(context.stateManager.saveProjectConfigOnly).toHaveBeenCalledWith({
            ...project,
            pinned: true,
        });
        expect(result.success).toBe(true);
        expect(result.pinned).toEqual({ projectPath: project.path, pinned: true });
        // The agent surface needs to be told where to confirm this from.
        expect(result.verify).toContain('list_projects');
    });

    it('carries pinned:false through rather than treating it as absent', async () => {
        const project = createProjectsDashboardProject({ pinned: true });
        const context = createProjectsDashboardContext([project]);

        const result = await handleSetProjectPinned(context, {
            projectPath: project.path,
            pinned: false,
        });

        expect(context.stateManager.saveProjectConfigOnly).toHaveBeenCalledWith({
            ...project,
            pinned: false,
        });
        expect(result.pinned).toEqual({ projectPath: project.path, pinned: false });
    });

    it('loads without persisting the pointer', async () => {
        const project = createProjectsDashboardProject();
        const context = createProjectsDashboardContext([project]);

        await handleSetProjectPinned(context, { projectPath: project.path, pinned: true });

        expect(context.stateManager.loadProjectFromPath).toHaveBeenCalledWith(
            project.path,
            undefined,
            { persistAfterLoad: false },
        );
    });

    it('refuses an absent payload instead of throwing', async () => {
        const context = createProjectsDashboardContext([]);

        const result = await handleSetProjectPinned(context);

        expect(context.stateManager.loadProjectFromPath).not.toHaveBeenCalled();
        expect(result).toEqual({
            success: false,
            error: 'projectPath and pinned (boolean) are required',
        });
    });

    it('requires a path', async () => {
        const context = createProjectsDashboardContext([]);

        const result = await handleSetProjectPinned(context, malformedPin({ pinned: true }));

        expect(context.stateManager.saveProjectConfigOnly).not.toHaveBeenCalled();
        expect(result).toEqual({
            success: false,
            error: 'projectPath and pinned (boolean) are required',
        });
    });

    it('requires pinned to be a boolean, not merely present', async () => {
        const project = createProjectsDashboardProject();
        const context = createProjectsDashboardContext([project]);

        const result = await handleSetProjectPinned(context, malformedPin({
            projectPath: project.path,
            pinned: 'yes',
        }));

        expect(context.stateManager.saveProjectConfigOnly).not.toHaveBeenCalled();
        expect(result).toEqual({
            success: false,
            error: 'projectPath and pinned (boolean) are required',
        });
    });

    it('refuses a path outside the projects directory before loading', async () => {
        const context = createProjectsDashboardContext([]);

        const result = await handleSetProjectPinned(context, {
            projectPath: OUTSIDE_PATH,
            pinned: true,
        });

        expect(context.stateManager.loadProjectFromPath).not.toHaveBeenCalled();
        expect(result).toEqual({ success: false, error: 'Invalid project path' });
    });

    it('reports not-found when the project will not load', async () => {
        const project = createProjectsDashboardProject();
        const context = createProjectsDashboardContext([]);

        const result = await handleSetProjectPinned(context, {
            projectPath: project.path,
            pinned: true,
        });

        expect(context.stateManager.saveProjectConfigOnly).not.toHaveBeenCalled();
        expect(result).toEqual({ success: false, error: 'Project not found' });
    });

    it('reports failure when the write rejects', async () => {
        const project = createProjectsDashboardProject();
        const context = createProjectsDashboardContext([project]);
        context.stateManager.saveProjectConfigOnly.mockRejectedValue(new Error('disk full'));

        const result = await handleSetProjectPinned(context, {
            projectPath: project.path,
            pinned: true,
        });

        expect(result).toEqual({ success: false, error: 'Failed to set project pinned state' });
    });
});
