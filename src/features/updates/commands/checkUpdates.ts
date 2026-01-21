import * as vscode from 'vscode';
import { BaseCommand } from '@/core/base';
import { ExecutionLock, TIMEOUTS } from '@/core/utils';
import { sanitizeErrorForLogging } from '@/core/validation';
import { ComponentUpdater } from '@/features/updates/services/componentUpdater';
import { ExtensionUpdater } from '@/features/updates/services/extensionUpdater';
import { UpdateManager, MultiProjectUpdateResult } from '@/features/updates/services/updateManager';
import { Project } from '@/types';

/**
 * QuickPick item representing a project that can be updated
 */
interface ProjectUpdateItem extends vscode.QuickPickItem {
    project: Project;
    componentId: string;
    currentVersion: string;
    latestVersion: string;
    releaseInfo: MultiProjectUpdateResult['releaseInfo'];
}

/**
 * Command to check for and apply updates to extension and components
 * User must confirm before updates are applied
 * RESILIENCE: Checks if demo is running before updating (prevents file lock issues)
 */
export class CheckUpdatesCommand extends BaseCommand {
    /** Execution lock to prevent duplicate concurrent execution */
    private static lock = new ExecutionLock('CheckUpdates');

    async execute(): Promise<void> {
        // Prevent duplicate concurrent execution
        if (CheckUpdatesCommand.lock.isLocked()) {
            this.logger.debug('[Updates] Already in progress');
            return;
        }

        await CheckUpdatesCommand.lock.run(async () => {
            try {
                // Run update check with visible progress notification
                const { extensionUpdate, multiProjectUpdates, currentProject, hasUpdates } = await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: 'Demo Builder Updates',
                        cancellable: false,
                    },
                    async (progress) => {
                        // Show initial message
                        progress.report({ message: 'Checking for updates...' });

                        // Wait to ensure message is visible before making GitHub API call
                        await new Promise(resolve => setTimeout(resolve, TIMEOUTS.UPDATE_MESSAGE_DELAY));

                        const updateManager = new UpdateManager(this.context, this.logger);
                        const currentProject = await this.stateManager.getCurrentProject();

                        // Check extension updates
                        const extensionUpdate = await updateManager.checkExtensionUpdate();

                        // Load ALL projects and check for component updates across all of them
                        // (read-only, do not persist after load)
                        progress.report({ message: 'Checking all projects...' });
                        const projectMetadata = await this.stateManager.getAllProjects();
                        const allProjects: Project[] = [];

                        for (const meta of projectMetadata) {
                            const project = await this.stateManager.loadProjectFromPath(
                                meta.path,
                                undefined,
                                { persistAfterLoad: false },
                            );
                            if (project) {
                                allProjects.push(project);
                            }
                        }

                        // Check component updates across all projects
                        const multiProjectUpdates = allProjects.length > 0
                            ? await updateManager.checkAllProjectsForUpdates(allProjects)
                            : [];

                        // Check if any updates available
                        const hasUpdates = extensionUpdate.hasUpdate || multiProjectUpdates.length > 0;

                        if (!hasUpdates) {
                            // Show "up to date" result
                            progress.report({
                                message: `Up to date (v${extensionUpdate.current})`,
                            });
                            await new Promise(resolve => setTimeout(resolve, TIMEOUTS.UPDATE_RESULT_DISPLAY));
                        }

                        return { extensionUpdate, multiProjectUpdates, currentProject, hasUpdates };
                    },
                );

                // If no updates, we already showed the result - just return
                if (!hasUpdates) {
                    this.logger.info('[Updates] ✓ No updates available - Demo Builder is up to date');
                    return;
                }

                // Handle extension update separately if present
                if (extensionUpdate.hasUpdate) {
                    const action = await vscode.window.showInformationMessage(
                        `Extension update available: v${extensionUpdate.current} → v${extensionUpdate.latest}`,
                        'Update Extension',
                        'Later',
                    );

                    if (action === 'Update Extension' && extensionUpdate.releaseInfo) {
                        const extensionUpdater = new ExtensionUpdater(this.logger);
                        await extensionUpdater.updateExtension(
                            extensionUpdate.releaseInfo.downloadUrl,
                            extensionUpdate.latest,
                        );
                        // Extension update triggers reload, so return here
                        return;
                    }
                }

                // Handle multi-project component updates with QuickPick
                if (multiProjectUpdates.length > 0) {
                    await this.showMultiProjectUpdatePicker(multiProjectUpdates, currentProject ?? null);
                }
            } catch (error) {
                await this.showError('Failed to check for updates', error as Error);
            }
        });
    }

    /**
     * Show QuickPick with multi-select to let user choose which projects to update
     * Organized by project (parent) with components as children
     */
    private async showMultiProjectUpdatePicker(
        updates: MultiProjectUpdateResult[],
        currentProject: Project | null,
    ): Promise<void> {
        // Reorganize data: group by project instead of by component
        const projectComponentMap = new Map<string, {
            project: Project;
            components: Array<{
                componentId: string;
                currentVersion: string;
                latestVersion: string;
                releaseInfo: MultiProjectUpdateResult['releaseInfo'];
            }>;
        }>();

        for (const update of updates) {
            for (const { project, currentVersion } of update.outdatedProjects) {
                if (!projectComponentMap.has(project.path)) {
                    projectComponentMap.set(project.path, {
                        project,
                        components: [],
                    });
                }
                projectComponentMap.get(project.path)!.components.push({
                    componentId: update.componentId,
                    currentVersion,
                    latestVersion: update.latestVersion,
                    releaseInfo: update.releaseInfo,
                });
            }
        }

        // Build QuickPick items organized by project
        const items: ProjectUpdateItem[] = [];

        // Sort projects: current project first, then alphabetically
        const sortedProjects = Array.from(projectComponentMap.values()).sort((a, b) => {
            const aIsCurrent = a.project.path === currentProject?.path;
            const bIsCurrent = b.project.path === currentProject?.path;
            if (aIsCurrent && !bIsCurrent) return -1;
            if (!aIsCurrent && bIsCurrent) return 1;
            return a.project.name.localeCompare(b.project.name);
        });

        for (const { project, components } of sortedProjects) {
            const isCurrent = project.path === currentProject?.path;
            const projectLabel = isCurrent
                ? `${project.name} (current)`
                : project.name;

            // Add each component with project as label, component as detail
            for (const comp of components) {
                items.push({
                    label: projectLabel,
                    detail: `    ${comp.componentId}  ${comp.currentVersion} → ${comp.latestVersion}`,
                    picked: isCurrent, // Pre-select components in current project
                    project,
                    componentId: comp.componentId,
                    currentVersion: comp.currentVersion,
                    latestVersion: comp.latestVersion,
                    releaseInfo: comp.releaseInfo,
                });
            }
        }

        // Count totals
        const totalProjects = projectComponentMap.size;
        const totalComponents = Array.from(projectComponentMap.values())
            .reduce((sum, p) => sum + p.components.length, 0);

        // Show QuickPick with multi-select
        const selected = await vscode.window.showQuickPick(items, {
            title: `Updates Available (${totalProjects} project${totalProjects > 1 ? 's' : ''}, ${totalComponents} component${totalComponents > 1 ? 's' : ''})`,
            placeHolder: 'Select component updates to apply',
            canPickMany: true,
            ignoreFocusOut: true,
        });

        if (!selected || selected.length === 0) {
            this.logger.debug('[Updates] User cancelled multi-project update selection');
            return;
        }

        this.logger.debug(`[Updates] User selected ${selected.length} component update(s) to apply`);

        // Perform updates for selected items
        await this.performMultiProjectUpdates(selected);
    }

    /**
     * Perform updates for selected projects from QuickPick
     */
    private async performMultiProjectUpdates(selections: ProjectUpdateItem[]): Promise<void> {
        // Group by project to handle running demos
        const projectUpdates = new Map<string, ProjectUpdateItem[]>();
        for (const selection of selections) {
            const key = selection.project.path;
            if (!projectUpdates.has(key)) {
                projectUpdates.set(key, []);
            }
            projectUpdates.get(key)!.push(selection);
        }

        // Check for running demos first (before showing progress)
        for (const [, updates] of projectUpdates.entries()) {
            const project = updates[0].project;

            if (project.status === 'running') {
                const stop = await vscode.window.showWarningMessage(
                    `"${project.name}" is currently running. Stop it before updating?`,
                    'Stop & Update',
                    'Skip',
                );

                if (stop !== 'Stop & Update') {
                    this.logger.debug(`[Updates] Skipping ${project.name} (demo running, user declined)`);
                    projectUpdates.delete(project.path);
                    continue;
                }

                // If this is the current project, stop it
                const currentProject = await this.stateManager.getCurrentProject();
                if (currentProject?.path === project.path) {
                    await vscode.commands.executeCommand('demoBuilder.stopDemo');
                    await new Promise(resolve => setTimeout(resolve, TIMEOUTS.DEMO_STOP_WAIT));
                }
            }
        }

        // If all projects were skipped, exit
        if (projectUpdates.size === 0) {
            return;
        }

        // Perform updates with progress indicator
        const totalUpdates = Array.from(projectUpdates.values()).reduce((sum, u) => sum + u.length, 0);

        const { successCount, failCount } = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Updating Components',
                cancellable: false,
            },
            async (progress) => {
                const componentUpdater = new ComponentUpdater(this.logger, this.context.extensionPath);
                let successCount = 0;
                let failCount = 0;

                for (const [, updates] of projectUpdates.entries()) {
                    const project = updates[0].project;

                    for (const update of updates) {
                        if (!update.releaseInfo) continue;

                        progress.report({
                            message: `${update.componentId} in ${project.name}...`,
                            increment: (100 / totalUpdates),
                        });

                        try {
                            await componentUpdater.updateComponent(
                                project,
                                update.componentId,
                                update.releaseInfo.downloadUrl,
                                update.latestVersion,
                            );
                            successCount++;
                            this.logger.info(`[Updates] Updated ${update.componentId} in ${project.name}`);
                        } catch (error) {
                            failCount++;
                            const sanitizedError = sanitizeErrorForLogging(error as Error);
                            this.logger.error(`[Updates] Failed to update ${update.componentId} in ${project.name}`, error as Error);
                            vscode.window.showErrorMessage(
                                `Failed to update ${update.componentId} in ${project.name}: ${sanitizedError}`,
                            );
                        }
                    }

                    // Save project state after updates
                    await this.stateManager.saveProject(project);
                }

                return { successCount, failCount };
            },
        );

        // Only show message if there were failures (progress indicator handles success case)
        if (failCount > 0) {
            vscode.window.showWarningMessage(
                `Updated ${successCount} component(s), ${failCount} failed. Restart affected demos to apply changes.`,
                'OK',
            );
        }
    }

}
