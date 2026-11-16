/**
 * ShowProjectsListCommand
 *
 * Command to show the Projects List as the main home screen.
 * Displays all projects in a card grid layout using the existing ProjectsDashboard UI.
 *
 * Step 1 of Projects Navigation Architecture: Create Projects List as Home Screen
 */

import * as vscode from 'vscode';
import { BundledPanelCommand } from '@/commands/bundledPanelCommand';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import { WebviewCommunicationManager } from '@/core/communication/webviewCommunicationManager';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { dispatchHandler, getRegisteredTypes } from '@/core/handlers/dispatchHandler';
import { onWorkChanged } from '@/core/state/projectWorkRunning';
import { readViewModeSetting, VIEW_MODE_SETTING } from '@/core/state/viewModePreference';
import { resolveProjectsRoot } from '@/core/utils/projectsRoot';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { projectsListHandlers } from '@/features/projects-dashboard/handlers/projectsListHandlers';
import { loadProjectsForList } from '@/features/projects-dashboard/services/loadProjectsForList';
import { presentedRows } from '@/features/updates/handlers/updatesModalHandlers';
import { requestUpdatesModal } from '@/features/updates/handlers/updatesModalRequest';
import type { ShowUpdatesPayload } from '@/types/pendingUpdates';
import type { ConfigChangedPayload, ProjectsUpdatedPayload , ProjectsListInitialData } from '@/types/webviewPayloads';

/**
 * Command to show the "Projects List" as the home screen
 * This provides a card grid view of all projects with search/filter.
 *
 * Follows BaseWebviewCommand pattern with object literal handler maps.
 * Updated in Step 3 to use dispatchHandler instead of class-based registry.
 */
export class ShowProjectsListCommand extends BundledPanelCommand<ProjectsListInitialData> {
    protected readonly bundleName = 'projectsList';
    /** The page load in flight, if any: a second open joins it. */
    private loading?: Promise<void>;

    constructor(
        context: vscode.ExtensionContext,
        stateManager: import('@/types/state').StateManager,
        logger: import('@/types/logger').Logger,
    ) {
        super(context, stateManager, logger);
    }

    // ============================================================================
    // BaseWebviewCommand Implementation
    // ============================================================================

    protected getWebviewId(): string {
        return 'demoBuilder.projectsList';
    }

    protected getWebviewTitle(): string {
        return 'Projects';
    }

    protected async getInitialData(): Promise<ProjectsListInitialData> {
        const themeKind = vscode.window.activeColorTheme.kind;
        const theme = themeKind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';

        // Note: projectsViewMode is included in getProjects response
        // to avoid race condition with init message

        return {
            theme,
        };
    }

    protected getLoadingMessage(): string {
        return 'Loading Projects';
    }

    protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
        // Auto-register all handlers from projectsListHandlers map
        const messageTypes = getRegisteredTypes(projectsListHandlers);

        for (const messageType of messageTypes) {
            comm.onStreaming(messageType, async (data: unknown) => {
                const context = this.createHandlerContext();
                return dispatchHandler(projectsListHandlers, context, messageType, data);
            });
        }

        // Listen for configuration changes and notify webview
        const configListener = vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration(`demoBuilder.${VIEW_MODE_SETTING.projects}`)) {
                const projectsViewMode = readViewModeSetting('projects');
                this.sendMessage('configChanged', {
                    projectsViewMode,
                } satisfies ConfigChangedPayload);
            }
        });
        this.disposables.add(configListener);

        this.watchProjectFiles();
    }

    /**
     * Reload the list whenever a project's file is created, changed or removed, or
     * a creation in this window starts or ends.
     *
     * The list used to reload only when opened or brought to the front, so a
     * project an agent created (or renamed, copied, deleted) while the list was
     * showing never appeared until the SC navigated away and back (owner,
     * 2026-10-16). Those changes come from many writers, including other windows,
     * so the project files themselves are the one place that sees all of them.
     * Creation writes the file several times in a burst; one reload after the
     * burst settles is enough.
     */
    private watchProjectFiles(): void {
        const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(
                vscode.Uri.file(resolveProjectsRoot()),
                '*/.demo-builder.json',
            ),
        );
        let pending: ReturnType<typeof setTimeout> | undefined;
        const reloadSoon = (): void => {
            if (pending) clearTimeout(pending);
            pending = setTimeout(() => {
                pending = undefined;
                void this.refreshProjectsList();
            }, TIMEOUTS.UI.PROJECT_LIST_SETTLE);
        };
        watcher.onDidCreate(reloadSoon);
        watcher.onDidChange(reloadSoon);
        watcher.onDidDelete(reloadSoon);
        this.disposables.add(watcher);
        // A creation starting or ending changes a tile with no file write to watch:
        // an Edge Delivery project has no file until its storefront is set up (PL-82).
        this.disposables.add(onWorkChanged(reloadSoon));
        this.disposables.add({ dispose: () => pending && clearTimeout(pending) });
    }

    // ============================================================================
    // Public API
    // ============================================================================

    /**
     * Static method to dispose any active Projects List panel
     * Useful for cleanup during reset or navigation
     */
    public static disposeActivePanel(): void {
        const panel = BaseWebviewCommand.getActivePanel('demoBuilder.projectsList');
        if (panel) {
            try {
                panel.dispose();
            } catch {
                // Panel may already be disposed - this is OK
            }
        }
    }

    // ============================================================================
    // Lifecycle Hooks
    // ============================================================================

    /**
     * Open (or reveal) the projects list.
     *
     * A second open while the page is still loading joins that load instead of loading
     * the page again. A second load replaced the screen, and with it any Updates modal
     * the first had opened (owner, 2026-10-30: Review, a sidebar click and closing the
     * wizard could each land mid-load).
     *
     * @param options - `showUpdates` opens the Updates modal on it with the rows Check for
     *   Updates presented (PL-80): pushed to a panel already open, held for one still
     *   loading until its screen asks
     */
    public async execute(options?: { showUpdates?: boolean }): Promise<void> {
        // Set context to show webview sidebar instead of tree view
        await vscode.commands.executeCommand('setContext', 'demoBuilder.showingProjectsList', true);

        // Update sidebar context to the projects-list surface
        if (ServiceLocator.isSidebarInitialized()) {
            const sidebarProvider = ServiceLocator.getSidebarProvider();
            await sidebarProvider.setShowingProjectsList(true);
        }

        // No page yet, or one still loading. The new page asks for its own data after
        // mount; pushing projectsUpdated at it as well double-renders and flickers.
        if (this.loading || this.communicationManager === undefined) {
            // The screen asks for a held request once its `init` arrives, and sending
            // `init` is the load's last step, so a request held mid-load still reaches it.
            if (options?.showUpdates) requestUpdatesModal();
            this.loading ??= this.loadPage().finally(() => {
                this.loading = undefined;
            });
            await this.loading;
            return;
        }

        // An existing panel: reveal it and send it fresh data.
        await this.createOrRevealPanel();
        await this.refreshProjectsList();
        await this.refreshConfig();
        if (options?.showUpdates) {
            await this.sendMessage('showUpdates', { rows: presentedRows() } satisfies ShowUpdatesPayload);
        }
    }

    /** Create the panel and load its page. */
    private async loadPage(): Promise<void> {
        await this.createOrRevealPanel();
        if (!this.communicationManager) {
            await this.initializeCommunication();
        }
    }

    /**
     * Send current config to webview
     * Called after reveal to ensure config is up-to-date
     */
    private async refreshConfig(): Promise<void> {
        if (!this.communicationManager) {
            return;
        }

        const projectsViewMode = readViewModeSetting('projects');
        await this.sendMessage('configChanged', {
            projectsViewMode,
        } satisfies ConfigChangedPayload);
    }

    /**
     * Send fresh projects list to webview
     * Called after reveal to ensure UI is up-to-date
     */
    private async refreshProjectsList(): Promise<void> {
        if (!this.communicationManager) {
            return;
        }

        try {
            const projects = await loadProjectsForList(this.stateManager);

            // Send to webview
            await this.sendMessage('projectsUpdated', {
                projects,
            } satisfies ProjectsUpdatedPayload);
        } catch (error) {
            this.logger.error('[ProjectsList] Failed to refresh projects list', error as Error);
        }
    }
}
