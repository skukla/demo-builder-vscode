import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { createPanelHandlerContext } from '@/commands/handlerContextFactory';
import { BaseWebviewCommand } from '@/core/base';
import { WebviewCommunicationManager } from '@/core/communication';
import { ConfigurationLoader } from '@/core/config/ConfigurationLoader';
import { dispatchHandler, getRegisteredTypes } from '@/core/handlers';
import { getBundleUri } from '@/core/utils/bundleUri';
import { getWebviewHTML } from '@/core/utils/getWebviewHTMLWithBundles';
import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import { getMeshAppBuilderComponent } from '@/core/state/appBuilderComponentState';
import { dashboardHandlers } from '@/features/dashboard/handlers';
import { aiHandlers } from '@/features/dashboard/handlers/aiHandlers';
import { armOnOpenChecks } from '@/features/dashboard/services/onOpenChecks';
import { isDataInstallerConfigured } from '@/features/data-installer/services/dataInstallerConfig';
import {
    getEwCanvasBranch,
    resolveProjectAuthoringExperience,
} from '@/features/eds/handlers/edsHelpers';
import { loadDemoPackages } from '@/features/components/services/demoPackageLoader';
import { Project, ComponentInstance } from '@/types';
import type { AppBuilderComponentState } from '@/types/base';
import type { DemoPackage } from '@/types/demoPackages';
import { HandlerContext } from '@/types/handlers';
import type { Stack, StacksConfig } from '@/types/stacks';
import {
    getComponentInstanceValues,
    isEdsProject,
    getEdsLiveUrl,
    getEdsDaLiveUrl,
} from '@/types/typeGuards';
import type {
    AppBuilderComponentRowStatus,
    AppBuilderComponentStatusUpdatePayload,
    AppBuilderComponentsSnapshotPayload,
    AuthoringExperienceUpdatePayload,
    DashboardInitialData,
    DestinationTitles,
    MeshStatusUpdatePayload,
    ProjectDestinationUpdatePayload,
} from '@/types/webviewPayloads';

/** Absolute path to the Demo Builder projects directory (`~/.demo-builder/projects`). */
const DEMO_BUILDER_PROJECTS_BASE = path.join(os.homedir(), '.demo-builder', 'projects');

/**
 * Decide whether closing the project dashboard should auto-reopen the projects
 * list as a safety net.
 *
 * Returns true only when:
 *   1. The current workspace folder is within the Demo Builder projects tree
 *      — the projects root itself (`~/.demo-builder/projects/`, the home in the
 *      always-root model) OR a project subdirectory (a leftover anchor from an
 *      older build) — AND
 *   2. No webview transition is in progress.
 *
 * Condition 2 keeps us out of the way when the user is intentionally
 * navigating — e.g. tile-clicking another project triggers a workspace switch
 * via `vscode.openFolder`, which reloads the window and fires the dashboard's
 * dispose() during teardown. Auto-reopening the projects list at that moment
 * would briefly flash before the reload completes. Callers signal this by
 * passing `transitionInProgress=true`.
 *
 * The path check uses `path.relative` rather than a string prefix so that
 * path-traversal attempts (`.../projects/../../etc/passwd`) and unrelated
 * folders correctly return false. The base directory ITSELF returns true: in
 * the always-root model the window is homed at the projects root, so closing
 * an in-place dashboard there should surface the projects list, not strand the
 * user on a bare root workspace.
 */
export function shouldAutoReopenProjectsList(
    workspaceFolderPath: string | undefined,
    transitionInProgress: boolean = false,
): boolean {
    if (transitionInProgress) return false;
    if (!workspaceFolderPath) return false;
    const rel = path.relative(DEMO_BUILDER_PROJECTS_BASE, workspaceFolderPath);
    // rel starts with '..' (or is absolute) when the path is outside the base
    // — including traversal attempts. Those are not Demo Builder contexts.
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
        return false;
    }
    // rel === '' is the projects root itself (the always-root home); a non-empty
    // rel is a project subdir. Both should reopen the list.
    return true;
}

/**
 * Command to show the "Project Dashboard" after project creation
 * This provides a control panel for demo management and quick actions
 *
 * Refactored in Phase 3.8 to use BaseWebviewCommand pattern with HandlerRegistry.
 * Updated in Step 3 to use object literal handler maps with dispatchHandler.
 */
export class ProjectDashboardWebviewCommand extends BaseWebviewCommand<DashboardInitialData> {
    // Static reference to active instance for refreshStatus
    private static activeInstance: ProjectDashboardWebviewCommand | null = null;

    constructor(
        context: vscode.ExtensionContext,
        stateManager: import('@/core/state').StateManager,
        logger: import('@/types/logger').Logger,
    ) {
        super(context, stateManager, logger);
    }

    // ============================================================================
    // BaseWebviewCommand Implementation
    // ============================================================================

    protected getWebviewId(): string {
        return 'demoBuilder.projectDashboard';
    }

    protected getWebviewTitle(): string {
        return 'Project Dashboard';
    }

    protected async getWebviewContent(): Promise<string> {
        if (!this.panel) {
            throw new Error('Panel must be created before getting webview content');
        }
        const scriptUri = getBundleUri({
            webview: this.panel.webview,
            extensionPath: this.context.extensionPath,
            featureBundleName: 'dashboard',
        });

        const nonce = this.getNonce();

        return getWebviewHTML({
            scriptUri,
            nonce,
            cspSource: this.panel.webview.cspSource,
            title: 'Project Dashboard',
        });
    }

    protected async getInitialData(): Promise<DashboardInitialData> {
        const project = await this.stateManager.getCurrentProject();
        const themeKind = vscode.window.activeColorTheme.kind;
        const theme = themeKind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';
        // Check if project has mesh: deployed instance, mesh state, or selected dependency.
        // Keyed-first (ADR-011 D3 Steps 07+09): the mesh deployment record lives on
        // the keyed appBuilderComponents entry (legacy meshState synthesis inside).
        const hasMeshInstance = Object.values(project?.componentInstances || {}).some(
            (instance) => instance.subType === 'mesh',
        );
        const hasMeshState = !!(project && getMeshAppBuilderComponent(project));
        const hasMeshDependency = (project?.componentSelections?.dependencies || []).some(
            (dep: string) => dep.includes('mesh'),
        );
        const hasMesh = hasMeshInstance || hasMeshState || hasMeshDependency;

        // Resolve package/stack names from IDs
        const { packageName, stackName } = await this.resolvePackageStackNames(project ?? null);

        // Detect EDS projects and get URLs (using shared typeGuards functions)
        const isEds = isEdsProject(project);
        const edsLiveUrl = getEdsLiveUrl(project);
        const authoringExperience = resolveProjectAuthoringExperience(project);
        const edsDaLiveUrl = getEdsDaLiveUrl(project, authoringExperience, getEwCanvasBranch());

        // Get EDS storefront status for dynamic display
        const initialEdsStorefrontStatus = project?.edsStorefrontStatusSummary;

        // Whether a proactive org-context check will run on this project (it only
        // runs when the project has an Adobe org). Lets the UI telegraph the
        // "Checking Adobe organization…" state before the result arrives.
        const hasAdobeContext = Boolean(project?.adobe?.organization);

        // Whether to OFFER the Sample Data tile at all. Read here rather than in
        // the webview because these are host settings; the tile used to render
        // unconditionally, so a user without an API URL got a tile that opened a
        // surface refusing them.
        const dataInstallerAvailable = isDataInstallerConfigured();

        return {
            theme,
            project: project
                ? {
                      // Display only -- the dashboard heading. See
                      // dashboardStatusService, which sends the same field.
                      name: getProjectDisplayName(project),
                      path: project.path,
                  }
                : null,
            hasMesh,
            packageName,
            stackName,
            isEds,
            edsLiveUrl,
            edsDaLiveUrl,
            initialEdsStorefrontStatus,
            hasAdobeContext,
            dataInstallerAvailable,
            // The keyed map drives the integrations SUMMARY tile (count + dot).
            // No catalog seed: the add-integration picker lives on the dedicated
            // integrations surface, whose own payload carries the catalog.
            appBuilderComponents: project?.appBuilderComponents,
        };
    }

    /**
     * Resolve package and stack IDs to human-readable names
     * Returns undefined for each field if ID not found (hides field in UI)
     */
    private async resolvePackageStackNames(project: Project | null): Promise<{
        packageName?: string;
        stackName?: string;
    }> {
        if (!project?.selectedPackage && !project?.selectedStack) {
            return {};
        }

        try {
            const result: { packageName?: string; stackName?: string } = {};

            // Resolve package name
            if (project.selectedPackage) {
                const packages = await loadDemoPackages();
                const pkg = packages.find((p: DemoPackage) => p.id === project.selectedPackage);
                if (pkg) {
                    result.packageName = pkg.name;
                }
            }

            // Resolve stack name
            if (project.selectedStack) {
                const stacksPath = path.join(
                    this.context.extensionPath,
                    'src',
                    'features',
                    'project-creation',
                    'config',
                    'stacks.json',
                );
                const stacksLoader = new ConfigurationLoader<StacksConfig>(stacksPath);
                const stacksConfig = await stacksLoader.load();
                const stack = stacksConfig.stacks.find(
                    (s: Stack) => s.id === project.selectedStack,
                );
                if (stack) {
                    result.stackName = stack.name;
                }
            }

            return result;
        } catch (error) {
            // If loading fails, return empty (hide fields in UI)
            this.logger.debug('[Dashboard] Failed to resolve package/stack names:', error);
            return {};
        }
    }

    protected getLoadingMessage(): string {
        return 'Loading Project Dashboard...';
    }

    protected shouldReopenWelcomeOnDispose(): boolean {
        return true;
    }

    protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
        // Auto-register all handlers from dashboardHandlers map
        const messageTypes = getRegisteredTypes(dashboardHandlers);

        for (const messageType of messageTypes) {
            comm.onStreaming(messageType, async (data: unknown) => {
                const context = this.createHandlerContext();
                return dispatchHandler(dashboardHandlers, context, messageType, data);
            });
        }

        // Register the AI handlers as well so the dashboard hook can call
        // `verify-ai-setup` to populate the AI Ready badge state.
        const aiMessageTypes = getRegisteredTypes(aiHandlers);
        for (const messageType of aiMessageTypes) {
            comm.onStreaming(messageType, async (data: unknown) => {
                const context = this.createHandlerContext();
                return dispatchHandler(aiHandlers, context, messageType, data);
            });
        }
    }

    // ============================================================================
    // Public API (called by other commands)
    // ============================================================================

    /**
     * Static method to dispose any active Project Dashboard panel
     * Useful for cleanup during reset or navigation
     *
     * NOTE: BaseWebviewCommand already provides singleton management,
     * but we keep this for backward compatibility with external callers.
     */
    public static disposeActivePanel(): void {
        const panel = BaseWebviewCommand.getActivePanel('demoBuilder.projectDashboard');
        if (panel) {
            try {
                panel.dispose();
            } catch {
                // Panel may already be disposed - this is OK
            }
        }
    }

    /**
     * Resolve whichever project-scoped panel is live for the live push channels.
     *
     * These pushes used to address the Project Dashboard alone. Opening the
     * dedicated integrations surface is a tab REPLACEMENT — the dashboard panel
     * is disposed — so a dashboard-only lookup would silently reach nobody and
     * the grid would never flip status or land an added card.
     *
     * Dashboard wins when both are somehow live, so a push renders once.
     */
    private static getLiveProjectPanel(): vscode.WebviewPanel | undefined {
        return (
            BaseWebviewCommand.getActivePanel('demoBuilder.projectDashboard') ??
            BaseWebviewCommand.getActivePanel('demoBuilder.integrations')
        );
    }

    /**
     * Push the project's deploy destination after `setProjectDestination` writes it.
     *
     * The Integrations header's "project · workspace" crumb comes from the init
     * payload, which is seeded ONCE — so a destination change left the header naming
     * the OLD target while every card deployed to the new one (reported live
     * 2026-08-07). Same shape as the sibling pushes above; no-op if neither project
     * panel is open.
     *
     * @param destination - the titles the header renders, post-write
     */
    public static async sendProjectDestinationUpdate(destination: DestinationTitles): Promise<void> {
        const panel = ProjectDashboardWebviewCommand.getLiveProjectPanel();
        if (panel) {
            const payload: ProjectDestinationUpdatePayload = { destination };
            await panel.webview.postMessage({ type: 'projectDestinationUpdate', payload });
        }
    }

    /**
     * Public method to send mesh status updates (called by deployMesh command)
     */
    public static async sendMeshStatusUpdate(
        status: 'deploying' | 'deployed' | 'config-changed' | 'error' | 'not-deployed',
        message?: string,
        endpoint?: string,
    ): Promise<void> {
        const panel = ProjectDashboardWebviewCommand.getLiveProjectPanel();
        if (panel) {
            const payload: MeshStatusUpdatePayload = { status, message, endpoint };
            await panel.webview.postMessage({ type: 'meshStatusUpdate', payload });
        }
    }

    /**
     * Public method to push a per-appBuilderComponent row status update (called by the
     * appBuilderComponent handlers). Modeled on sendMeshStatusUpdate but keyed by the
     * appBuilderComponent `id` so the integrations list flips ONLY that row. No-op if no
     * dashboard is open.
     *
     * `name` (optional) refreshes the row's display label on the same channel —
     * the rename handler pushes the entry's CURRENT status (incl. the persisted
     * 'stale') plus the new name, since the init-seeded map never re-delivers.
     */
    public static async sendAppBuilderComponentStatusUpdate(
        id: string,
        status: AppBuilderComponentRowStatus,
        message?: string,
        name?: string,
    ): Promise<void> {
        const panel = ProjectDashboardWebviewCommand.getLiveProjectPanel();
        if (panel) {
            const payload: AppBuilderComponentStatusUpdatePayload = { id, status, message, name };
            await panel.webview.postMessage({ type: 'appBuilderComponentStatusUpdate', payload });
        }
    }

    /**
     * Public method to push the FULL fresh persisted `appBuilderComponents`
     * map (called by the appBuilderComponent handlers after terminal ops:
     * add/deploy terminal, remove success, rename success). The webview's map
     * is seeded once at init, so without this snapshot an added card never
     * appears and a removed card lingers. Modeled on
     * sendAppBuilderComponentStatusUpdate; no-op if neither project panel is open.
     */
    public static async sendAppBuilderComponentsSnapshot(
        components: Record<string, AppBuilderComponentState>,
    ): Promise<void> {
        const panel = ProjectDashboardWebviewCommand.getLiveProjectPanel();
        if (panel) {
            const payload: AppBuilderComponentsSnapshotPayload = { components };
            await panel.webview.postMessage({ type: 'appBuilderComponentsSnapshot', payload });
        }
    }

    /**
     * Public method to push the live DA URL after an authoring-experience flip
     * (called by the Configure save handler) — no reopen required. The Author
     * tile label is STATIC ("Author Content"), so only the URL rides on the
     * message. No-op if no dashboard is open. Modeled on sendMeshStatusUpdate.
     */
    public static async sendAuthoringExperienceUpdate(edsDaLiveUrl?: string): Promise<void> {
        const panel = BaseWebviewCommand.getActivePanel('demoBuilder.projectDashboard');
        if (panel) {
            const payload: AuthoringExperienceUpdatePayload = { edsDaLiveUrl };
            await panel.webview.postMessage({ type: 'authoringExperienceUpdate', payload });
        }
    }

    /**
     * Public method to trigger a full status refresh (called after config changes)
     */
    public static async refreshStatus(): Promise<void> {
        const instance = ProjectDashboardWebviewCommand.activeInstance;
        if (!instance) {
            return; // No active dashboard
        }

        // Directly invoke the handler with proper context
        const context = instance.createHandlerContext();
        await dispatchHandler(dashboardHandlers, context, 'requestStatus', {});
    }

    // ============================================================================
    // Lifecycle Hooks
    // ============================================================================

    public async execute(): Promise<void> {
        // Check for existing project
        const project = await this.stateManager.getCurrentProject();
        if (!project) {
            this.logger.warn('[Dashboard] No project found');
            return;
        }

        this.logger.debug(`[Dashboard] Showing dashboard for project: ${project.name}`);

        // If demo is already running, initialize file hashes for change detection
        if (project.status === 'running') {
            await this.initializeFileHashesForRunningDemo(project);
        }

        // Store active instance for static refreshStatus calls
        ProjectDashboardWebviewCommand.activeInstance = this;

        // Re-arm this project's on-open checks BEFORE the panel exists.
        //
        // The orchestrator's guard runs each check at most once per project per
        // session, which is right for a re-`requestStatus` within one mount and wrong
        // across mounts: leaving a project and coming back remounts the webview and
        // resets the state those checks feed. Returning to a project therefore skipped
        // `ai-verify`, leaving the AI badge on "Verifying" forever and the AI
        // Capabilities modal reporting no skills and no MCP servers for a healthy
        // project. Ordering matters — the panel triggers the first requestStatus, so
        // arming after it would leave that request guarded.
        armOnOpenChecks(project.path);

        // Create or reveal panel and initialize communication
        await this.createOrRevealPanel();

        // Dispose Projects List AFTER our panel is created (prevents flash)
        BaseWebviewCommand.disposePanel('demoBuilder.projectsList');

        if (!this.communicationManager) {
            await this.initializeCommunication();
        }
    }

    // ============================================================================
    // Helper Methods
    // ============================================================================

    /**
     * Create handler context with all dependencies
     */
    private createHandlerContext(): HandlerContext {
        // ONE complete context from the shared factory — no per-panel guessing about
        // which managers its (possibly reused) handlers will reach for.
        return createPanelHandlerContext({
            context: this.context,
            panel: this.panel,
            stateManager: this.stateManager,
            communicationManager: this.communicationManager,
            sendMessage: (type: string, data?: unknown) => this.sendMessage(type, data),
        });
    }

    /**
     * Initialize file hashes for a running demo
     * Collects all .env files from component instances and initializes their hashes for change detection
     */
    private async initializeFileHashesForRunningDemo(project: Project): Promise<void> {
        const envFiles: string[] = [];

        // Collect .env files from all component instances
        // SOP §4: Using helper instead of inline Object.values
        for (const componentInstance of getComponentInstanceValues(project)) {
            const instance = componentInstance as ComponentInstance;
            if (instance.path) {
                const componentPath = instance.path;
                const envPath = path.join(componentPath, '.env');
                const envLocalPath = path.join(componentPath, '.env.local');

                // Check if files exist
                try {
                    await fsPromises.access(envPath);
                    envFiles.push(envPath);
                } catch {
                    // File doesn't exist
                }

                try {
                    await fsPromises.access(envLocalPath);
                    envFiles.push(envLocalPath);
                } catch {
                    // File doesn't exist
                }
            }
        }

        if (envFiles.length > 0) {
            await vscode.commands.executeCommand(
                'demoBuilder._internal.initializeFileHashes',
                envFiles,
            );
        }
    }
}
