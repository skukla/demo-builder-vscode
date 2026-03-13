import * as vscode from 'vscode';
import {
    performAddonUpdates,
    performComponentUpdates,
    performForkSyncUpdates,
    performTemplateUpdates,
    type UpdateContext,
} from './updateExecutor';
import {
    buildUpdatePickerItems,
    formatBehindLabel,
    getTemplateSource,
    type BlockLibraryUpdateItem,
    type ForkSyncItem,
    type InspectorUpdateItem,
    type ProjectUpdateItem,
    type TemplateUpdateItem,
    type UpdateItem,
} from './updateTypes';
import { BaseCommand } from '@/core/base';
import { ExecutionLock, TIMEOUTS } from '@/core/utils';
import { AddonUpdateChecker } from '@/features/updates/services/addonUpdateChecker';
import { ExtensionUpdater } from '@/features/updates/services/extensionUpdater';
import { ForkSyncService } from '@/features/updates/services/forkSyncService';
import { TemplateUpdateChecker, TemplateUpdateResult } from '@/features/updates/services/templateUpdateChecker';
import { UpdateManager, MultiProjectUpdateResult } from '@/features/updates/services/updateManager';
import { Project } from '@/types';

/**
 * Command to check for and apply updates to extension and components.
 * User must confirm before updates are applied.
 * RESILIENCE: Checks if demo is running before updating (prevents file lock issues)
 */
export class CheckUpdatesCommand extends BaseCommand {
    /** Execution lock to prevent duplicate concurrent execution */
    private static lock = new ExecutionLock('CheckUpdates');

    async execute(): Promise<void> {
        if (CheckUpdatesCommand.lock.isLocked()) {
            this.logger.debug('[Updates] Already in progress');
            return;
        }

        await CheckUpdatesCommand.lock.run(async () => {
            try {
                const {
                    extensionUpdate, multiProjectUpdates, templateUpdates,
                    forkSyncItems, blockLibraryItems, inspectorItems,
                    currentProject, hasUpdates,
                } = await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: 'Demo Builder Updates',
                        cancellable: false,
                    },
                    async (progress) => {
                        progress.report({ message: 'Checking for updates...' });

                        // Wait to ensure message is visible before making GitHub API call
                        await new Promise(resolve => setTimeout(resolve, TIMEOUTS.UPDATE_MESSAGE_DELAY));

                        const updateManager = new UpdateManager(this.context, this.logger);
                        const currentProject = await this.stateManager.getCurrentProject();

                        // Phase 1: Check extension updates
                        const extensionUpdate = await updateManager.checkExtensionUpdate();

                        // Load ALL projects
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

                        // Phase 2: Check fork sync for source repos
                        progress.report({ message: 'Checking source repos...' });
                        const forkSyncItems = await this.checkForkSyncUpdates(allProjects);

                        // Phase 3: Check component updates across all projects
                        const multiProjectUpdates = allProjects.length > 0
                            ? await updateManager.checkAllProjectsForUpdates(allProjects)
                            : [];

                        // Check template updates for EDS projects
                        progress.report({ message: 'Checking EDS templates...' });
                        const templateUpdateChecker = new TemplateUpdateChecker(this.context.secrets, this.logger);
                        const templateUpdates: Array<{ project: Project; update: TemplateUpdateResult }> = [];

                        for (const project of allProjects) {
                            const templateUpdate = await templateUpdateChecker.checkForUpdates(project);
                            if (templateUpdate?.hasUpdates) {
                                templateUpdates.push({ project, update: templateUpdate });
                            }
                        }

                        // Phase 4: Check add-on updates
                        progress.report({ message: 'Checking add-ons...' });
                        const { blockLibraryItems, inspectorItems } = await this.checkAddonUpdates(
                            allProjects, currentProject ?? null,
                        );

                        // Check if any updates available
                        const hasUpdates = extensionUpdate.hasUpdate
                            || multiProjectUpdates.length > 0
                            || templateUpdates.length > 0
                            || forkSyncItems.length > 0
                            || blockLibraryItems.length > 0
                            || inspectorItems.length > 0;

                        if (!hasUpdates) {
                            progress.report({
                                message: `Up to date (v${extensionUpdate.current})`,
                            });
                            await new Promise(resolve => setTimeout(resolve, TIMEOUTS.UPDATE_RESULT_DISPLAY));
                        }

                        return {
                            extensionUpdate, multiProjectUpdates, templateUpdates,
                            forkSyncItems, blockLibraryItems, inspectorItems,
                            currentProject, hasUpdates,
                        };
                    },
                );

                if (!hasUpdates) {
                    this.logger.info('[Updates] ✓ No updates available - Demo Builder is up to date');
                    return;
                }

                // Handle extension update separately
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
                        return;
                    }
                }

                // Handle all non-extension updates with QuickPick
                const hasNonExtensionUpdates = multiProjectUpdates.length > 0
                    || templateUpdates.length > 0
                    || forkSyncItems.length > 0
                    || blockLibraryItems.length > 0
                    || inspectorItems.length > 0;

                if (hasNonExtensionUpdates) {
                    await this.showMultiProjectUpdatePicker(
                        multiProjectUpdates,
                        templateUpdates,
                        forkSyncItems,
                        blockLibraryItems,
                        inspectorItems,
                        currentProject ?? null,
                    );
                }
            } catch (error) {
                await this.showError('Failed to check for updates', error as Error);
            }
        });
    }

    // -----------------------------------------------------------------------
    // QuickPick builder + dispatch
    // -----------------------------------------------------------------------

    private async showMultiProjectUpdatePicker(
        componentUpdates: MultiProjectUpdateResult[],
        templateUpdates: Array<{ project: Project; update: TemplateUpdateResult }>,
        forkSyncItems: ForkSyncItem[],
        blockLibraryItems: BlockLibraryUpdateItem[],
        inspectorItems: InspectorUpdateItem[],
        currentProject: Project | null,
    ): Promise<void> {
        const { items, title } = buildUpdatePickerItems(
            componentUpdates, templateUpdates, forkSyncItems,
            blockLibraryItems, inspectorItems, currentProject,
        );

        const selected = await vscode.window.showQuickPick(items, {
            title,
            placeHolder: 'Select updates to apply',
            canPickMany: true,
            ignoreFocusOut: true,
        });

        if (!selected || selected.length === 0) {
            this.logger.debug('[Updates] User cancelled update selection');
            return;
        }

        await this.dispatchSelectedUpdates(selected);
    }

    private async dispatchSelectedUpdates(selected: UpdateItem[]): Promise<void> {
        const selectedForks = selected.filter(
            (item): item is ForkSyncItem => 'isForkSync' in item && item.isForkSync,
        );
        const selectedTemplates = selected.filter(
            (item): item is TemplateUpdateItem => 'isTemplateUpdate' in item && item.isTemplateUpdate,
        );
        const selectedComponents = selected.filter(
            (item): item is ProjectUpdateItem => 'isProjectUpdate' in item && item.isProjectUpdate,
        );
        const selectedBlockLibraries = selected.filter(
            (item): item is BlockLibraryUpdateItem => 'isBlockLibraryUpdate' in item && item.isBlockLibraryUpdate,
        );
        const selectedInspectors = selected.filter(
            (item): item is InspectorUpdateItem => 'isInspectorUpdate' in item && item.isInspectorUpdate,
        );

        this.logger.debug(
            `[Updates] User selected: ${selectedForks.length} fork(s), ${selectedTemplates.length} template(s), `
            + `${selectedComponents.length} component(s), ${selectedBlockLibraries.length} block lib(s), ${selectedInspectors.length} inspector(s)`,
        );

        const ctx = this.buildUpdateContext();

        // Execution order: fork sync -> template -> components -> add-ons
        if (selectedForks.length > 0) {
            await performForkSyncUpdates(selectedForks, ctx);
        }

        const templateSyncSucceeded = selectedTemplates.length > 0
            ? await performTemplateUpdates(selectedTemplates, ctx)
            : new Set<string>();

        if (selectedComponents.length > 0) {
            await performComponentUpdates(selectedComponents, ctx);
        }

        if (selectedBlockLibraries.length > 0 || selectedInspectors.length > 0) {
            await performAddonUpdates(
                selectedBlockLibraries, selectedInspectors, templateSyncSucceeded, ctx,
            );
        }
    }

    // -----------------------------------------------------------------------
    // Check helpers (build QuickPick items from API results)
    // -----------------------------------------------------------------------

    private async checkForkSyncUpdates(allProjects: Project[]): Promise<ForkSyncItem[]> {
        this.logger.debug(`[Updates] Checking fork sync across ${allProjects.length} project(s)`);
        const forkSyncService = new ForkSyncService(this.context.secrets, this.logger);
        const forkSyncItems: ForkSyncItem[] = [];
        const checkedForks = new Set<string>();

        for (const project of allProjects) {
            const source = getTemplateSource(project);
            if (!source) continue;

            const key = `${source.owner}/${source.repo}`;
            if (checkedForks.has(key)) continue;
            checkedForks.add(key);

            const status = await forkSyncService.checkForkStatus(source.owner, source.repo);
            if (status?.isFork && status.behindBy > 0) {
                forkSyncItems.push({
                    label: `$(repo-forked) ${source.repo}`,
                    detail: `    ${formatBehindLabel(status.behindBy)} ${status.parentFullName}`,
                    description: key,
                    picked: true,
                    owner: source.owner,
                    repo: source.repo,
                    branch: status.defaultBranch || 'main',
                    behindBy: status.behindBy,
                    parentFullName: status.parentFullName || '',
                    isForkSync: true,
                });
            }
        }

        this.logger.debug(
            `[Updates] Fork sync check complete: ${checkedForks.size} repo(s) checked, ${forkSyncItems.length} behind upstream`,
        );

        return forkSyncItems;
    }

    private async checkAddonUpdates(
        allProjects: Project[],
        currentProject: Project | null,
    ): Promise<{ blockLibraryItems: BlockLibraryUpdateItem[]; inspectorItems: InspectorUpdateItem[] }> {
        this.logger.debug(`[Updates] Checking add-on updates across ${allProjects.length} project(s)`);
        const addonChecker = new AddonUpdateChecker(this.context.secrets, this.logger);
        const blockLibraryItems: BlockLibraryUpdateItem[] = [];
        const inspectorItems: InspectorUpdateItem[] = [];

        for (const project of allProjects) {
            const isCurrent = project.path === currentProject?.path;

            const blockUpdates = await addonChecker.checkBlockLibraries(project);
            for (const update of blockUpdates) {
                blockLibraryItems.push({
                    label: project.name,
                    detail: `    $(package) ${update.library.name}  ${formatBehindLabel(update.commitsBehind)}`,
                    picked: isCurrent,
                    project,
                    library: update.library,
                    latestCommit: update.latestCommit,
                    commitsBehind: update.commitsBehind,
                    isBlockLibraryUpdate: true,
                });
            }

            const inspectorUpdate = await addonChecker.checkInspectorSdk(project);
            if (inspectorUpdate?.hasUpdate) {
                inspectorItems.push({
                    label: project.name,
                    detail: `    $(tools) Demo Inspector SDK  ${formatBehindLabel(inspectorUpdate.commitsBehind)}`,
                    picked: isCurrent,
                    project,
                    latestCommit: inspectorUpdate.latestCommit,
                    commitsBehind: inspectorUpdate.commitsBehind,
                    isInspectorUpdate: true,
                });
            }
        }

        this.logger.debug(
            `[Updates] Add-on check complete: ${blockLibraryItems.length} block lib(s), ${inspectorItems.length} inspector SDK(s) need updates`,
        );

        return { blockLibraryItems, inspectorItems };
    }

    private buildUpdateContext(): UpdateContext {
        return {
            secrets: this.context.secrets,
            extensionPath: this.context.extensionPath,
            stateManager: this.stateManager,
            logger: this.logger,
        };
    }
}
