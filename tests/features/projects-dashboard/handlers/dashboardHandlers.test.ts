/**
 * Tests for Projects Dashboard handlers
 */

import type { Project } from '@/types/base';
import * as os from 'os';
import * as path from 'path';
import { handleGetProjects, handleSelectProject, handleCreateProject, handleOpenAiForProject, handleOpenLiveSite, handleOpenDaLive, } from './dashboardHandlers.testUtils';
import { createProjectsDashboardProject, createMockProjects, createProjectsDashboardContext } from '../testUtils';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';

/**
 * ADR-015 (2026-08-28): this boundary resolves its collaborators from the
 * registry, which the shared node setup empties after EVERY test — so the fakes
 * are seeded per-test rather than mocked at the module level.
 */
beforeEach(() => {
    ServiceLocator.setCommandExecutor(createMockCommandExecutor());
    ServiceLocator.setAuthenticationService(
        createMockAuthenticationService({
            getCachedOrganization: jest.fn(),
            getTokenStatus: jest.fn().mockResolvedValue({ isAuthenticated: true }),
        }),
    );
});

/**
 * What `handleGetProjects` puts on its response.
 *
 * These assertions read `result.data.projects` and `.projectsViewMode`, and were
 * reaching them through `dataOf(result)` — which switched off checking of the
 * whole expression, so `.projcts` would have read `undefined` and
 * `expect(undefined).toHaveLength(3)` would have failed with a confusing message
 * rather than a compile error.
 */
interface ProjectsResponse {
    // `Project`, not a hand-written row. My first draft listed three fields and the
    // compiler named the ones it was missing — `meshStatusSummary` is declared on
    // `Project` and the handler STAMPS it, which a three-field guess cannot know.
    projects: Project[];
    projectsViewMode?: string;
    runningProjectPath?: string;
    project?: Project;
}

const dataOf = (result: { data?: unknown }): ProjectsResponse => result.data as ProjectsResponse;

describe('dashboardHandlers', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset vscode mocks to defaults
        const vscode = require('vscode');
        vscode.workspace.getConfiguration.mockReturnValue({
            get: jest.fn().mockReturnValue('cards'),
        });
        vscode.commands.executeCommand.mockResolvedValue(undefined);
    });

    describe('handleGetProjects', () => {
        it('should return all projects from StateManager', async () => {
            const projects = createMockProjects(3);
            const context = createProjectsDashboardContext(projects);

            const result = await handleGetProjects(context);

            expect(context.stateManager.getAllProjects).toHaveBeenCalled();
            // loadProjectFromPath should be called for each project
            expect(context.stateManager.loadProjectFromPath).toHaveBeenCalledTimes(3);
            expect(result.success).toBe(true);
            expect(dataOf(result).projects).toHaveLength(3);
        });

        it('should include projectsViewMode from config', async () => {
            const vscode = require('vscode');
            vscode.workspace.getConfiguration.mockReturnValue({
                get: jest.fn().mockReturnValue('rows'),
            });
            const context = createProjectsDashboardContext([]);

            const result = await handleGetProjects(context);

            expect(result.success).toBe(true);
            expect(dataOf(result).projectsViewMode).toBe('rows');
        });

        it('should return empty array when no projects exist', async () => {
            const context = createProjectsDashboardContext([]);

            const result = await handleGetProjects(context);

            expect(result).toEqual({
                success: true,
                data: { projects: [], projectsViewMode: 'cards' },
            });
        });

        it('should handle errors gracefully', async () => {
            const context = createProjectsDashboardContext([]);
            context.stateManager.getAllProjects.mockRejectedValue(new Error('Database error'));

            const result = await handleGetProjects(context);

            expect(result).toEqual({
                success: false,
                error: 'Failed to load projects',
            });
            expect(context.logger.error).toHaveBeenCalled();
        });

        it('should NOT use sendMessage (Pattern B)', async () => {
            const projects = createMockProjects(2);
            const context = createProjectsDashboardContext(projects);

            await handleGetProjects(context);

            expect(context.sendMessage).not.toHaveBeenCalled();
        });

        it('should return projects in deterministic alphabetical order by name (regression)', async () => {
            // Create projects in reverse-alphabetical order (simulates mtime-based ordering)
            const projects = [
                createProjectsDashboardProject({
                    name: 'citisignal-headless',
                    path: path.join(
                        os.homedir(),
                        '.demo-builder',
                        'projects',
                        'citisignal-headless'
                    ),
                }),
                createProjectsDashboardProject({
                    name: 'citisignal-eds',
                    path: path.join(os.homedir(), '.demo-builder', 'projects', 'citisignal-eds'),
                }),
                createProjectsDashboardProject({
                    name: 'buildright-eds',
                    path: path.join(os.homedir(), '.demo-builder', 'projects', 'buildright-eds'),
                }),
            ];
            const context = createProjectsDashboardContext(projects);

            const result = await handleGetProjects(context);

            expect(result.success).toBe(true);
            const returnedNames = dataOf(result).projects.map((p: any) => p.name);
            expect(returnedNames).toEqual([
                'buildright-eds',
                'citisignal-eds',
                'citisignal-headless',
            ]);
        });

        it('should enrich projects with mesh status when mesh is deployed and stale', async () => {
            const { hasMeshDeploymentRecord } = require('@/core/state/appBuilderComponentState');
            const { determineMeshStatus } = require('@/features/mesh/services/meshStatusResolver');
            const { detectMeshChanges } = require('@/features/mesh/services/stalenessDetector');

            const project = createProjectsDashboardProject({
                componentConfigs: { 'api-mesh': { SOME_VAR: 'value' } },
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                            envVars: { SOME_VAR: 'value' },
                            sourceHash: 'abc123',
                            lastDeployed: new Date().toISOString(),
                                    },
                },
            });
            const context = createProjectsDashboardContext([project]);

            hasMeshDeploymentRecord.mockReturnValue(true);
            detectMeshChanges.mockResolvedValue({ hasChanges: true });
            determineMeshStatus.mockResolvedValue('config-changed');

            const result = await handleGetProjects(context);

            expect(result.success).toBe(true);
            const projects = dataOf(result).projects;
            expect(projects[0].meshStatusSummary).toBe('stale');
            expect(context.stateManager.saveProject).toHaveBeenCalled();
        });

        it('should set meshStatusSummary to deployed when no changes detected', async () => {
            const { hasMeshDeploymentRecord } = require('@/core/state/appBuilderComponentState');
            const { determineMeshStatus } = require('@/features/mesh/services/meshStatusResolver');
            const { detectMeshChanges } = require('@/features/mesh/services/stalenessDetector');

            const project = createProjectsDashboardProject({
                componentConfigs: { 'api-mesh': { SOME_VAR: 'value' } },
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                            envVars: { SOME_VAR: 'value' },
                            sourceHash: 'abc123',
                            lastDeployed: new Date().toISOString(),
                                    },
                },
            });
            const context = createProjectsDashboardContext([project]);

            hasMeshDeploymentRecord.mockReturnValue(true);
            detectMeshChanges.mockResolvedValue({ hasChanges: false });
            determineMeshStatus.mockResolvedValue('deployed');

            const result = await handleGetProjects(context);

            const projects = dataOf(result).projects;
            expect(projects[0].meshStatusSummary).toBe('deployed');
        });

        it('should set meshStatusSummary to unknown on detection error', async () => {
            const {
                hasMeshDeploymentRecord,
            } = require('@/core/state/appBuilderComponentState');
            const { detectMeshChanges } = require('@/features/mesh/services/stalenessDetector');

            const project = createProjectsDashboardProject({
                componentConfigs: { 'api-mesh': { SOME_VAR: 'value' } },
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                            envVars: { SOME_VAR: 'value' },
                            sourceHash: 'abc123',
                            lastDeployed: new Date().toISOString(),
                                    },
                },
            });
            const context = createProjectsDashboardContext([project]);

            hasMeshDeploymentRecord.mockReturnValue(true);
            detectMeshChanges.mockRejectedValue(new Error('Detection failed'));

            const result = await handleGetProjects(context);

            const projects = dataOf(result).projects;
            expect(projects[0].meshStatusSummary).toBe('unknown');
        });

        it('should set meshStatusSummary to not-deployed when no deployment record', async () => {
            const {
                hasMeshDeploymentRecord,
            } = require('@/core/state/appBuilderComponentState');

            const project = createProjectsDashboardProject({
                componentConfigs: { 'api-mesh': { SOME_VAR: 'value' } },
            });
            const context = createProjectsDashboardContext([project]);

            hasMeshDeploymentRecord.mockReturnValue(false);

            const result = await handleGetProjects(context);

            const projects = dataOf(result).projects;
            expect(projects[0].meshStatusSummary).toBe('not-deployed');
        });
    });

    describe('handleSelectProject', () => {
        it('should load and save project in StateManager', async () => {
            const project = createProjectsDashboardProject({ name: 'Selected Project' });
            const context = createProjectsDashboardContext([project]);

            const result = await handleSelectProject(context, {
                projectPath: project.path,
            });

            expect(context.stateManager.loadProjectFromPath).toHaveBeenCalledWith(project.path);
            expect(context.stateManager.saveProject).toHaveBeenCalledWith(project);
            expect(result.success).toBe(true);
            expect(dataOf(result).project?.name).toBe('Selected Project');
        });

        it('should return error if project path is outside demo-builder directory', async () => {
            const context = createProjectsDashboardContext([]);

            const result = await handleSelectProject(context, {
                projectPath: '/nonexistent/path',
            });

            // Path validation fails before project lookup
            expect(result).toEqual({
                success: false,
                error: 'Invalid project path',
            });
            expect(context.logger.error).toHaveBeenCalled();
        });

        it('should return error if project not found at valid path', async () => {
            const context = createProjectsDashboardContext([]);
            const os = require('os');
            const path = require('path');
            const validButEmptyPath = path.join(
                os.homedir(),
                '.demo-builder',
                'projects',
                'nonexistent'
            );

            const result = await handleSelectProject(context, {
                projectPath: validButEmptyPath,
            });

            expect(result).toEqual({
                success: false,
                error: 'Project not found',
            });
        });

        it('should return error if project path not provided', async () => {
            const context = createProjectsDashboardContext([]);

            const result = await handleSelectProject(context, undefined);

            expect(result).toEqual({
                success: false,
                error: 'Project path is required',
            });
        });

        it('should log selection event', async () => {
            const project = createProjectsDashboardProject({ name: 'Logged Project' });
            const context = createProjectsDashboardContext([project]);

            await handleSelectProject(context, {
                projectPath: project.path,
            });

            expect(context.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('Logged Project')
            );
        });

        it('should NOT use sendMessage (Pattern B)', async () => {
            const project = createProjectsDashboardProject();
            const context = createProjectsDashboardContext([project]);

            await handleSelectProject(context, {
                projectPath: project.path,
            });

            expect(context.sendMessage).not.toHaveBeenCalled();
        });

        describe('path traversal prevention (CWE-22)', () => {
            const PATH_TRAVERSAL_PAYLOADS = [
                '../../../etc/passwd',
                '..\\..\\..\\Windows\\System32\\config\\SAM',
                '/etc/passwd',
                'C:\\Windows\\System32',
                '/tmp/../etc/shadow',
                '....//....//etc/passwd',
            ];

            PATH_TRAVERSAL_PAYLOADS.forEach((payload) => {
                it(`should block path traversal attempt: ${payload}`, async () => {
                    const context = createProjectsDashboardContext([]);

                    const result = await handleSelectProject(context, {
                        projectPath: payload,
                    });

                    expect(result.success).toBe(false);
                    expect(result.error).toBe('Invalid project path');
                    // Should NOT attempt to load from filesystem
                    expect(context.stateManager.loadProjectFromPath).not.toHaveBeenCalled();
                });
            });
        });
    });

    describe('handleCreateProject', () => {
        it('should execute create project command', async () => {
            const context = createProjectsDashboardContext([]);
            const vscode = require('vscode');

            const result = await handleCreateProject(context);

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'demoBuilder.createProject'
            );
            expect(result).toEqual({
                success: true,
            });
        });

        it('should log create event', async () => {
            const context = createProjectsDashboardContext([]);

            await handleCreateProject(context);

            expect(context.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('Creating new project')
            );
        });

        it('should handle command execution error', async () => {
            const context = createProjectsDashboardContext([]);
            const vscode = require('vscode');
            vscode.commands.executeCommand.mockRejectedValue(new Error('Command failed'));

            const result = await handleCreateProject(context);

            expect(result).toEqual({
                success: false,
                error: 'Failed to start project creation',
            });
        });

        it('should NOT use sendMessage (Pattern B)', async () => {
            const context = createProjectsDashboardContext([]);

            await handleCreateProject(context);

            expect(context.sendMessage).not.toHaveBeenCalled();
        });
    });

    describe('handleOpenAiForProject', () => {
        /**
         * The handler reads `context.context.globalState`, which the shared builder
         * ALREADY provides — the comment that used to sit here said it did not, and
         * the two-method object written to replace it was missing `keys` and
         * `setKeysForSync`. Nothing noticed because the function returned `any`.
         *
         * Only the behaviour this suite needs is overridden: the shared default
         * returns `true` so one-time tips stay out of the way, and these tests want
         * the not-yet-seen path.
         */
        function makeContext(projects: Project[]) {
            const ctx = createProjectsDashboardContext(projects);
            (ctx.context.globalState.get as jest.Mock).mockReturnValue(undefined);
            return ctx;
        }

        function setWorkspaceFolder(fsPath: string | null): void {
            const vscode = require('vscode');
            vscode.workspace.workspaceFolders = fsPath === null ? undefined : [{ uri: { fsPath } }];
        }

        afterEach(() => setWorkspaceFolder(null));

        it('sets the current-project pointer and dispatches demoBuilder.openInClaude with NO project arg (always-root home Chat)', async () => {
            const project = createProjectsDashboardProject({ name: 'AI Target' });
            setWorkspaceFolder(project.path);
            const context = makeContext([project]);
            const vscode = require('vscode');

            const result = await handleOpenAiForProject(context, { projectPath: project.path });

            expect(result.success).toBe(true);
            // Pointer set so the dashboard/state reads and the home Chat's
            // get_current_project tool resolve here.
            expect(context.stateManager.saveProject).toHaveBeenCalledWith(project);
            // Forwards to the command with NO project — the home Chat always
            // launches at the projects root.
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.openInClaude');
            // The handler never anchors (no pending record, no openFolder).
            expect(context.context.globalState.update).not.toHaveBeenCalled();
            expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
                'vscode.openFolder',
                expect.anything(),
                expect.anything()
            );
        });

        it('never anchors the workspace even when workspace ≠ project', async () => {
            const project = createProjectsDashboardProject({ name: 'AI Target' });
            setWorkspaceFolder('/some/other/repo');
            const context = makeContext([project]);
            const vscode = require('vscode');

            const result = await handleOpenAiForProject(context, { projectPath: project.path });

            expect(result.success).toBe(true);
            expect(context.stateManager.saveProject).toHaveBeenCalledWith(project);
            // No pending record / openFolder written by the handler.
            expect(context.context.globalState.update).not.toHaveBeenCalled();
            expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
                'vscode.openFolder',
                expect.anything(),
                expect.anything()
            );
            // Just forwards to the command with no project arg.
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.openInClaude');
        });

        it('returns error when projectPath is missing', async () => {
            const context = makeContext([]);
            const vscode = require('vscode');

            // NAMES its target rather than erasing it. The payload arrives from a
            // webview and is untyped at runtime, so a message with no `projectPath`
            // is genuinely reachable and this guard is real — but `as any` would
            // stop the compiler checking the rest of the call too.
            const result = await handleOpenAiForProject(context, {} as { projectPath: string });

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/path is required/i);
            expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
        });

        it('rejects a path outside the projects directory before loading', async () => {
            const context = makeContext([]);
            const vscode = require('vscode');

            const result = await handleOpenAiForProject(context, {
                projectPath: '/nonexistent/path',
            });

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/invalid project path/i);
            expect(context.stateManager.saveProject).not.toHaveBeenCalled();
            expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
        });

        it('returns error when project cannot be loaded', async () => {
            const context = makeContext([]);
            const vscode = require('vscode');

            const result = await handleOpenAiForProject(context, {
                projectPath: path.join(os.homedir(), '.demo-builder', 'projects', 'nonexistent'),
            });

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/not found/i);
            expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
        });
    });

    describe('handleOpenLiveSite / handleOpenDaLive — path guard', () => {
        it('handleOpenLiveSite rejects a path outside the projects directory', async () => {
            const context = createProjectsDashboardContext([]);
            const vscode = require('vscode');

            const result = await handleOpenLiveSite(context, {
                projectPath: '/nonexistent/path',
            });

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/invalid project path/i);
            expect(context.stateManager.loadProjectFromPath).not.toHaveBeenCalled();
            expect(vscode.env.openExternal).not.toHaveBeenCalled();
        });

        it('handleOpenDaLive rejects a path outside the projects directory', async () => {
            const context = createProjectsDashboardContext([]);
            const vscode = require('vscode');

            const result = await handleOpenDaLive(context, {
                projectPath: '/nonexistent/path',
            });

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/invalid project path/i);
            expect(context.stateManager.loadProjectFromPath).not.toHaveBeenCalled();
            expect(vscode.env.openExternal).not.toHaveBeenCalled();
        });
    });
});
