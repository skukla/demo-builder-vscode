/**
 * Dashboard handlers — delete, edit, rename, open-live-site, open-DA.live, reset.
 *
 * Same rule as the sibling settingsActions suite: these handlers decide WHICH
 * collaborator runs and WITH WHAT, so the assertions read the arguments the
 * collaborator received. Asserting the value a mock handed back would test the
 * mock, and a mock cannot see a malformed call.
 */

import * as vscode from 'vscode';
import type { Project } from '@/types/base';
import {
    handleDeleteProject,
    handleEditProject,
    handleOpenDaLive,
    handleOpenLiveSite,
    handleRenameProject,
    handleResetProject,
    mockDeleteProject,
    mockExtractSettingsFromProject,
    mockGetAuthenticationService,
    mockGetCommandExecutor,
    mockGetEwCanvasBranch,
    mockOpenInIncognito,
    mockRenameProjectCore,
    mockResetEdsProjectWithUI,
    mockResetProjectWithUI,
    mockResolveProjectAuthoringExperience,
} from './dashboardHandlers-actions.testUtils';
import { createProjectsDashboardContext, createProjectsDashboardProject } from '../testUtils';

const mockExecuteCommand = vscode.commands.executeCommand as jest.Mock;
const mockOpenExternal = vscode.env.openExternal as jest.Mock;

const OUTSIDE_PATH = '/tmp/not-a-demo-builder-project';

/**
 * A rename payload as it can actually ARRIVE — off the webview wire, where nothing
 * has checked it. The handler's guard rejects half-filled payloads, so the suite
 * has to be able to send one. `as unknown as` keeps the target type NAMED.
 */
function malformedRename(payload: object): { projectPath: string; newName: string } {
    return payload as unknown as { projectPath: string; newName: string };
}
const COMMAND_EXECUTOR = { execute: jest.fn() };
const AUTH_SERVICE = { getTokenStatus: jest.fn() };

/**
 * The stored EDS metadata of a fixture built by `createEdsProject`, for tests that
 * need to spoil one field. Throws rather than returning undefined so a fixture that
 * silently lost its metadata fails here instead of passing a weaker assertion.
 */
function edsMetadataOf(project: Project): Record<string, unknown> {
    const metadata = project.componentInstances?.['eds-storefront']?.metadata;
    if (!metadata) throw new Error('fixture is missing its eds-storefront metadata');
    return metadata as Record<string, unknown>;
}

/** An EDS project whose live/DA.live URLs resolve from real stored metadata. */
function createEdsProject(overrides?: Partial<Project>): Project {
    return createProjectsDashboardProject({
        selectedStack: 'eds-saas',
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: {
                    githubRepo: 'acme/citisignal',
                    daLiveOrg: 'acme',
                    liveUrl: 'https://main--citisignal--acme.aem.live',
                },
            },
        },
        ...overrides,
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockExecuteCommand.mockResolvedValue(undefined);
    mockOpenExternal.mockResolvedValue(true);
    mockGetCommandExecutor.mockReturnValue(COMMAND_EXECUTOR);
    mockGetAuthenticationService.mockReturnValue(AUTH_SERVICE);
    mockResolveProjectAuthoringExperience.mockReturnValue('da-live-classic');
    mockGetEwCanvasBranch.mockReturnValue('');
    mockExtractSettingsFromProject.mockReturnValue({
        selectedPackage: 'citisignal',
        selectedStack: 'eds-saas',
    });
});

describe('handleDeleteProject', () => {
    it('delegates to deleteProject with the loaded project and announces the deletion', async () => {
        const project = createProjectsDashboardProject();
        const context = createProjectsDashboardContext([project]);
        mockDeleteProject.mockResolvedValue({ success: true, data: { success: true } });

        const result = await handleDeleteProject(context, { projectPath: project.path });

        expect(mockDeleteProject).toHaveBeenCalledWith(context, project);
        expect(context.sendMessage).toHaveBeenCalledWith('projectDeleted', {});
        expect(result).toEqual({ success: true, data: { success: true } });
    });

    it('stays silent when the service reports the deletion did not complete', async () => {
        const project = createProjectsDashboardProject();
        const context = createProjectsDashboardContext([project]);
        // Handler-level success, deletion-level failure — e.g. the retry timed out.
        mockDeleteProject.mockResolvedValue({ success: true, data: { success: false } });

        await handleDeleteProject(context, { projectPath: project.path });

        expect(context.sendMessage).not.toHaveBeenCalled();
    });

    it('stays silent when the service itself failed', async () => {
        const project = createProjectsDashboardProject();
        const context = createProjectsDashboardContext([project]);
        mockDeleteProject.mockResolvedValue({ success: false, error: 'cancelled' });

        const result = await handleDeleteProject(context, { projectPath: project.path });

        expect(context.sendMessage).not.toHaveBeenCalled();
        expect(result).toEqual({ success: false, error: 'cancelled' });
    });

    it('stays silent when the service returns no data at all', async () => {
        const project = createProjectsDashboardProject();
        const context = createProjectsDashboardContext([project]);
        mockDeleteProject.mockResolvedValue({ success: true });

        const result = await handleDeleteProject(context, { projectPath: project.path });

        expect(context.sendMessage).not.toHaveBeenCalled();
        // The absent `data` must read as "did not delete", not blow up the handler.
        expect(result).toEqual({ success: true });
    });

    it('loads without persisting the pointer, and refuses an unresolvable project', async () => {
        const project = createProjectsDashboardProject();
        const context = createProjectsDashboardContext([]);

        const result = await handleDeleteProject(context, { projectPath: project.path });

        expect(context.stateManager.loadProjectFromPath).toHaveBeenCalledWith(
            project.path,
            undefined,
            { persistAfterLoad: false },
        );
        expect(mockDeleteProject).not.toHaveBeenCalled();
        expect(result).toEqual({ success: false, error: 'Project not found' });
    });

    it('refuses a missing path and a path outside the projects directory', async () => {
        const context = createProjectsDashboardContext([]);

        expect(await handleDeleteProject(context)).toEqual({
            success: false,
            error: 'Project path is required',
        });
        expect(await handleDeleteProject(context, { projectPath: OUTSIDE_PATH })).toEqual({
            success: false,
            error: 'Invalid project path',
        });
        expect(context.stateManager.loadProjectFromPath).not.toHaveBeenCalled();
    });

    it('reports failure when the deletion service throws', async () => {
        const project = createProjectsDashboardProject();
        const context = createProjectsDashboardContext([project]);
        mockDeleteProject.mockRejectedValue(new Error('rmdir failed'));

        const result = await handleDeleteProject(context, { projectPath: project.path });

        expect(result).toEqual({ success: false, error: 'Failed to delete project' });
    });
});

describe('handleEditProject', () => {
    it('opens the wizard in edit mode carrying slug, title and extracted settings', async () => {
        const project = createProjectsDashboardProject({ title: 'CitiSignal Demo' });
        const context = createProjectsDashboardContext([project]);
        const settings = { selectedPackage: 'citisignal', selectedStack: 'eds-saas' };
        mockExtractSettingsFromProject.mockReturnValue(settings);

        const result = await handleEditProject(context, { projectPath: project.path });

        // includeSecrets = true: a local edit re-seeds the fields the user typed.
        expect(mockExtractSettingsFromProject).toHaveBeenCalledWith(project, true);
        expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.createProject', {
            editProject: {
                projectPath: project.path,
                projectName: project.name,
                projectTitle: 'CitiSignal Demo',
                settings,
            },
        });
        expect(result).toEqual({ success: true, data: { success: true } });
    });

    it('survives a project with no componentInstances map at all', async () => {
        const project = createProjectsDashboardProject({ componentInstances: undefined });
        const context = createProjectsDashboardContext([project]);

        const result = await handleEditProject(context, { projectPath: project.path });

        expect(mockExecuteCommand).toHaveBeenCalledTimes(1);
        expect(result.success).toBe(true);
    });

    it('survives a project whose eds-storefront metadata is absent', async () => {
        const project = createProjectsDashboardProject({ componentInstances: {} });
        const context = createProjectsDashboardContext([project]);

        const result = await handleEditProject(context, { projectPath: project.path });

        expect(mockExecuteCommand).toHaveBeenCalledTimes(1);
        expect(result.success).toBe(true);
    });

    it('survives EDS metadata and an extracted edsConfig being present', async () => {
        const project = createEdsProject();
        const context = createProjectsDashboardContext([project]);
        mockExtractSettingsFromProject.mockReturnValue({
            selectedPackage: 'citisignal',
            selectedStack: 'eds-saas',
            edsConfig: { githubOwner: 'acme', repoName: 'citisignal', daLiveOrg: 'acme' },
        });

        const result = await handleEditProject(context, { projectPath: project.path });

        expect(result.success).toBe(true);
    });

    it('refuses a missing path, a path outside the tree, and an unloadable project', async () => {
        const project = createProjectsDashboardProject();
        const context = createProjectsDashboardContext([]);

        expect(await handleEditProject(context)).toEqual({
            success: false,
            error: 'Project path is required',
        });
        expect(await handleEditProject(context, { projectPath: OUTSIDE_PATH })).toEqual({
            success: false,
            error: 'Invalid project path',
        });
        expect(await handleEditProject(context, { projectPath: project.path })).toEqual({
            success: false,
            error: 'Project not found',
        });
        expect(mockExecuteCommand).not.toHaveBeenCalled();
    });

    it('reports failure when opening the wizard rejects', async () => {
        const project = createProjectsDashboardProject();
        const context = createProjectsDashboardContext([project]);
        mockExecuteCommand.mockRejectedValue(new Error('no wizard'));

        const result = await handleEditProject(context, { projectPath: project.path });

        expect(result).toEqual({ success: false, error: 'Failed to edit project' });
    });
});

describe('handleRenameProject', () => {
    it('loads WITH persistence and hands the raw new name to the rename core', async () => {
        const project = createProjectsDashboardProject();
        const context = createProjectsDashboardContext([project]);
        mockRenameProjectCore.mockResolvedValue({ success: true, data: { name: 'renamed' } });

        const result = await handleRenameProject(context, {
            projectPath: project.path,
            newName: 'Renamed Demo',
        });

        // persistAfterLoad: true — the rename is about to save changes back.
        expect(context.stateManager.loadProjectFromPath).toHaveBeenCalledWith(
            project.path,
            undefined,
            { persistAfterLoad: true },
        );
        expect(mockRenameProjectCore).toHaveBeenCalledWith(context, project, 'Renamed Demo');
        expect(result).toEqual({ success: true, data: { name: 'renamed' } });
    });

    it('requires both a path and a new name', async () => {
        const project = createProjectsDashboardProject();
        const context = createProjectsDashboardContext([project]);
        const required = {
            success: false,
            error: 'Project path and new name are required',
        };

        expect(await handleRenameProject(context)).toEqual(required);
        expect(await handleRenameProject(context, malformedRename({ newName: 'X' }))).toEqual(
            required,
        );
        expect(
            await handleRenameProject(context, malformedRename({ projectPath: project.path })),
        ).toEqual(required);
        expect(mockRenameProjectCore).not.toHaveBeenCalled();
    });

    it('refuses a path outside the projects directory before loading', async () => {
        const context = createProjectsDashboardContext([]);

        const result = await handleRenameProject(context, {
            projectPath: OUTSIDE_PATH,
            newName: 'X',
        });

        expect(context.stateManager.loadProjectFromPath).not.toHaveBeenCalled();
        expect(result).toEqual({ success: false, error: 'Invalid project path' });
    });

    it('reports not-found rather than renaming when the project will not load', async () => {
        const project = createProjectsDashboardProject();
        const context = createProjectsDashboardContext([]);

        const result = await handleRenameProject(context, {
            projectPath: project.path,
            newName: 'X',
        });

        expect(mockRenameProjectCore).not.toHaveBeenCalled();
        expect(result).toEqual({ success: false, error: 'Project not found' });
    });
});

describe('handleOpenLiveSite', () => {
    it('opens the stored live URL in a private browser inside a progress notification', async () => {
        const project = createEdsProject();
        const context = createProjectsDashboardContext([project]);

        const result = await handleOpenLiveSite(context, { projectPath: project.path });

        expect(mockOpenInIncognito).toHaveBeenCalledWith('https://main--citisignal--acme.aem.live');
        // Never the ordinary browser — the whole point is a clean session.
        expect(mockOpenExternal).not.toHaveBeenCalled();
        // Incognito launch is slow, so it runs behind a NON-cancellable notification:
        // half-launching a browser is not a state the user can be left in.
        expect(vscode.window.withProgress).toHaveBeenCalledWith(
            expect.objectContaining({
                location: vscode.ProgressLocation.Notification,
                cancellable: false,
            }),
            expect.any(Function),
        );
        expect(result).toEqual({ success: true });
    });

    it('refuses to shell out to an unvalidatable stored URL', async () => {
        const project = createEdsProject();
        edsMetadataOf(project).liveUrl = 'javascript:alert(1)';
        const context = createProjectsDashboardContext([project]);

        await expect(
            handleOpenLiveSite(context, { projectPath: project.path }),
        ).rejects.toThrow('Invalid live URL');
        expect(mockOpenInIncognito).not.toHaveBeenCalled();
    });

    it('reports the URL is unavailable for a non-EDS project', async () => {
        const project = createProjectsDashboardProject();
        const context = createProjectsDashboardContext([project]);

        const result = await handleOpenLiveSite(context, { projectPath: project.path });

        expect(mockOpenInIncognito).not.toHaveBeenCalled();
        expect(result).toEqual({ success: false, error: 'EDS live URL not available' });
    });

    it('refuses a missing path before loading', async () => {
        const context = createProjectsDashboardContext([]);

        const result = await handleOpenLiveSite(context);

        expect(context.stateManager.loadProjectFromPath).not.toHaveBeenCalled();
        expect(result).toEqual({ success: false, error: 'Project path is required' });
    });
});

describe('handleOpenDaLive', () => {
    it('opens the classic DA.live URL built from the project and the resolved experience', async () => {
        const project = createEdsProject();
        const context = createProjectsDashboardContext([project]);

        const result = await handleOpenDaLive(context, { projectPath: project.path });

        expect(mockResolveProjectAuthoringExperience).toHaveBeenCalledWith(project);
        expect(String(mockOpenExternal.mock.calls[0][0])).toBe(
            'https://da.live/#/acme/citisignal',
        );
        expect(result).toEqual({ success: true });
    });

    it('opens the Experience Workspace canvas URL, extensionless, on the configured branch', async () => {
        const project = createEdsProject();
        const context = createProjectsDashboardContext([project]);
        mockResolveProjectAuthoringExperience.mockReturnValue('experience-workspace');
        mockGetEwCanvasBranch.mockReturnValue('main');

        await handleOpenDaLive(context, { projectPath: project.path });

        expect(String(mockOpenExternal.mock.calls[0][0])).toBe(
            'https://da.live/canvas?nx=main#/acme/citisignal/index',
        );
    });

    it('reports the URL is unavailable when the DA.live org is missing', async () => {
        const project = createEdsProject();
        delete edsMetadataOf(project).daLiveOrg;
        const context = createProjectsDashboardContext([project]);

        const result = await handleOpenDaLive(context, { projectPath: project.path });

        expect(mockOpenExternal).not.toHaveBeenCalled();
        expect(result).toEqual({ success: false, error: 'DA.live URL not available' });
    });

    it('refuses a missing path before loading', async () => {
        const context = createProjectsDashboardContext([]);

        const result = await handleOpenDaLive(context);

        expect(context.stateManager.loadProjectFromPath).not.toHaveBeenCalled();
        expect(result).toEqual({ success: false, error: 'Project path is required' });
    });
});

describe('handleResetProject', () => {
    it('routes a NON-EDS project to the component re-clone reset with the located services', async () => {
        const project = createProjectsDashboardProject({ selectedStack: 'headless-saas' });
        const context = createProjectsDashboardContext([project]);
        mockResetProjectWithUI.mockResolvedValue({ success: true });

        const result = await handleResetProject(context, { projectPath: project.path });

        expect(mockResetEdsProjectWithUI).not.toHaveBeenCalled();
        expect(mockResetProjectWithUI).toHaveBeenCalledWith({
            commandManager: COMMAND_EXECUTOR,
            authManager: AUTH_SERVICE,
            project,
            context,
            logPrefix: '[ProjectsList]',
        });
        expect(result).toEqual({ success: true });
    });

    it('routes an EDS project to the template reset, block library and CDN check included', async () => {
        const project = createEdsProject();
        const context = createProjectsDashboardContext([project]);
        mockResetEdsProjectWithUI.mockResolvedValue({ success: true });

        const result = await handleResetProject(context, { projectPath: project.path });

        expect(mockResetProjectWithUI).not.toHaveBeenCalled();
        expect(mockResetEdsProjectWithUI).toHaveBeenCalledWith({
            meshDeps: { commandManager: COMMAND_EXECUTOR, authManager: AUTH_SERVICE },
            project,
            context,
            logPrefix: '[ProjectsList]',
            includeBlockLibrary: true,
            verifyCdn: true,
            showLogsOnError: true,
        });
        expect(result).toEqual({ success: true });
    });

    it('refuses a path outside the projects directory before loading', async () => {
        const context = createProjectsDashboardContext([]);

        const result = await handleResetProject(context, { projectPath: OUTSIDE_PATH });

        expect(context.stateManager.loadProjectFromPath).not.toHaveBeenCalled();
        expect(result).toEqual({ success: false, error: 'Invalid project path' });
    });
});
