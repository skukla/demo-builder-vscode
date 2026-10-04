/**
 * Projects list: load the list, select a project, start the wizard, and the
 * two help links. Split from `dashboardHandlers.ts` by job (EDS-8, 2026-10-05),
 * which re-exports every handler, so the handler map and its tests still name
 * that path.
 *
 * @module features/projects-dashboard/handlers/projectsListBrowse
 */

import * as vscode from 'vscode';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { buildOrgTargetFromProjectAdobe, withOrgContext } from '@/core/shell/orgContextEnv';
import { hasMeshDeploymentRecord } from '@/core/state/appBuilderComponentState';
import { resolveViewMode } from '@/core/state/viewModePreference';
import { validateProjectPath } from '@/core/validation/PathSafetyValidator';
import { determineMeshStatus } from '@/features/mesh/services/meshStatusResolver';
import { detectMeshChanges } from '@/features/mesh/services/stalenessDetector';
import type { Project } from '@/types/base';
import type { MessageHandler, HandlerContext, HandlerResponse } from '@/types/handlers';
import { getMeshComponentInstance } from '@/types/typeGuards';

/**
 * Get all projects from StateManager
 *
 * Loads the list of projects and enriches with full project data.
 * Also includes current config for initial render.
 */
export const handleGetProjects: MessageHandler = async (
    context: HandlerContext,
): Promise<HandlerResponse> => {
    try {
        // Get list of project paths
        const projectList = await context.stateManager.getAllProjects();

        // Load full project data for each (read-only, don't persist)
        const projects: Project[] = [];
        for (const item of projectList) {
            const project = await context.stateManager.loadProjectFromPath(item.path, undefined, {
                persistAfterLoad: false,
            });
            if (project) {
                projects.push(project);
            }
        }

        // Enrich projects with mesh staleness status (full fidelity check)
        for (const project of projects) {
            const meshComponent = getMeshComponentInstance(project);
            if (meshComponent && project.componentConfigs) {
                try {
                    if (hasMeshDeploymentRecord(project)) {
                        // Org-targeted PER PROJECT. detectMeshChanges reaches the
                        // `aio` CLI whenever the staleness baseline is empty, and an
                        // unwrapped call inherits the CLI's process-global console
                        // selection — which this extension deliberately stopped
                        // writing, so it holds whatever an earlier session left
                        // there. Wrapping the LOOP instead of each iteration would
                        // be worse than nothing: every project would be queried
                        // against the first one's org.
                        // Captured, not asserted: the enclosing `if` narrows
                        // componentConfigs, but the closure below loses it.
                        const configs = project.componentConfigs;
                        const status = await withOrgContext(
                            buildOrgTargetFromProjectAdobe(project.adobe),
                            async () => {
                                const meshChanges = await detectMeshChanges(project, configs, {
                                    commandManager: ServiceLocator.getCommandExecutor(),
                                    authManager: ServiceLocator.getAuthenticationService(),
                                });
                                return determineMeshStatus(meshChanges, meshComponent, project);
                            },
                        );
                        project.meshStatusSummary = status === 'config-changed' ? 'stale' : status;
                    } else {
                        project.meshStatusSummary = 'not-deployed';
                    }
                    await context.stateManager.saveProject(project);
                } catch {
                    project.meshStatusSummary = 'unknown';
                }
            }
        }

        // Pinned projects first, then alphabetical within each group.
        // (mtime-based scanner order is unstable after mesh enrichment writes,
        // so we always re-sort to make the rendered order deterministic.)
        projects.sort((a, b) => {
            const aPinned = a.pinned ? 1 : 0;
            const bPinned = b.pinned ? 1 : 0;
            if (aPinned !== bPinned) return bPinned - aPinned;
            return a.name.localeCompare(b.name);
        });

        // In the response rather than a separate request (no race with init):
        // the session's choice over the setting (`core/state/viewModePreference`).
        const projectsViewMode = resolveViewMode('projects');

        // Find running project path (if any)
        const runningProject = projects.find((p) => p.status === 'running');
        const runningProjectPath = runningProject?.path;

        return {
            success: true,
            data: { projects, projectsViewMode, runningProjectPath },
        };
    } catch (error) {
        context.logger.error('Failed to load projects', error instanceof Error ? error : undefined);
        return {
            success: false,
            error: 'Failed to load projects',
        };
    }
};

/**
 * Select a project by path.
 *
 * Loads the project and sets it as the current project (the persisted
 * `currentProjectPath` pointer that `StateManager.getCurrentProject()` reads).
 * Browsing/selecting a project NO LONGER anchors the VS Code workspace — the
 * dashboard, component tree, and auth cache all work off that pointer, so a
 * plain selection just surfaces the dashboard webview in-place with no reload.
 *
 * Nothing anchors the workspace to a project subdir in the always-root home
 * model — dashboards render in-place off the current-project pointer.
 *
 * Behavior:
 *   - plain selection (`forceNewWindow` falsy), regardless of whether the
 *     current workspace already matches → surface the project dashboard webview
 *     in-place. No reload, ever.
 *   - `forceNewWindow: true` (shift/cmd-click) → open the project in a NEW
 *     VS Code window; the current window is left alone (still on the projects
 *     list). Note: that new window opens at the project subdir, so its
 *     activation `shouldReHomeToRoot` check re-homes it back to the projects
 *     root (home-on-launch) — the always-root invariant still holds.
 */
export const handleSelectProject: MessageHandler<{
    projectPath: string;
    forceNewWindow?: boolean;
    surface?: 'integrations';
}> = async (
    context: HandlerContext,
    payload?: { projectPath: string; forceNewWindow?: boolean; surface?: 'integrations' },
): Promise<HandlerResponse> => {
    try {
        if (!payload?.projectPath) {
            return {
                success: false,
                error: 'Project path is required',
            };
        }

        // SECURITY: Validate path is within demo-builder projects directory
        try {
            validateProjectPath(payload.projectPath);
        } catch (validationError) {
            context.logger.error(
                'Path validation failed',
                validationError instanceof Error ? validationError : undefined,
            );
            return {
                success: false,
                error: 'Invalid project path',
            };
        }

        const project = await context.stateManager.loadProjectFromPath(payload.projectPath);

        if (!project) {
            return {
                success: false,
                error: 'Project not found',
            };
        }

        // Set as current project in state
        await context.stateManager.saveProject(project);
        context.logger.info(`Selected project: ${project.name}`);

        const forceNewWindow = payload.forceNewWindow === true;

        if (forceNewWindow) {
            // Shift/cmd-click: open the project in a NEW VS Code window and
            // leave the current one alone (still on the projects list). This is
            // the only path that still anchors a workspace on selection.
            try {
                await vscode.commands.executeCommand(
                    'vscode.openFolder',
                    vscode.Uri.file(project.path),
                    true,
                );
            } catch (openError) {
                context.logger.error(
                    'Failed to open project folder in new window',
                    openError instanceof Error ? openError : undefined,
                );
            }
        } else {
            // Plain selection: surface the dashboard webview in-place. We never
            // reload the window on browse — the persisted current-project
            // pointer (set by saveProject above) is what the dashboard reads,
            // so a reload is unnecessary. The workspace only anchors later, on
            // demand, when the user launches a workspace-requiring action.
            //
            // Mark a webview transition so the outgoing Projects List's
            // dispose() doesn't fight the dashboard handoff.
            //
            // `surface` picks WHICH webview opens. Selection is otherwise
            // identical — path validation, load, set-current — so the project
            // kebab's "Integrations" rides this handler rather than forking it.
            await BaseWebviewCommand.startWebviewTransition();
            try {
                await vscode.commands.executeCommand(
                    payload.surface === 'integrations'
                        ? 'demoBuilder.showIntegrations'
                        : 'demoBuilder.showProjectDashboard',
                );
            } catch (navError) {
                context.logger.error(
                    'Failed to navigate to dashboard',
                    navError instanceof Error ? navError : undefined,
                );
            } finally {
                BaseWebviewCommand.endWebviewTransition();
            }
        }

        return {
            success: true,
            data: { project },
        };
    } catch (error) {
        context.logger.error(
            'Failed to select project',
            error instanceof Error ? error : undefined,
        );
        return {
            success: false,
            error: 'Failed to select project',
        };
    }
};

/**
 * Trigger project creation wizard
 */
export const handleCreateProject: MessageHandler = async (
    context: HandlerContext,
): Promise<HandlerResponse> => {
    try {
        context.logger.info('Creating new project from dashboard');
        await vscode.commands.executeCommand('demoBuilder.createProject');
        return {
            success: true,
        };
    } catch (error) {
        context.logger.error(
            'Failed to start project creation',
            error instanceof Error ? error : undefined,
        );
        return {
            success: false,
            error: 'Failed to start project creation',
        };
    }
};

/**
 * Open help/support URL
 */
export const handleOpenHelp: MessageHandler = async (
    context: HandlerContext,
): Promise<HandlerResponse> => {
    try {
        const helpUrl = 'https://github.com/anthropics/demo-builder-vscode/issues';
        await vscode.env.openExternal(vscode.Uri.parse(helpUrl));
        return { success: true };
    } catch (error) {
        context.logger.error('Failed to open help', error instanceof Error ? error : undefined);
        return {
            success: false,
            error: 'Failed to open help',
        };
    }
};

/**
 * Open VS Code settings for this extension
 */
export const handleOpenSettings: MessageHandler = async (
    context: HandlerContext,
): Promise<HandlerResponse> => {
    try {
        await vscode.commands.executeCommand(
            'workbench.action.openSettings',
            '@ext:adobe.demo-builder',
        );
        return { success: true };
    } catch (error) {
        context.logger.error('Failed to open settings', error instanceof Error ? error : undefined);
        return {
            success: false,
            error: 'Failed to open settings',
        };
    }
};
