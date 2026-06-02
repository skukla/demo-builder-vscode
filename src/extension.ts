import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { CommandManager } from '@/commands/commandManager';
import { BaseWebviewCommand } from '@/core/base';
import { ServiceLocator } from '@/core/di';
import { initializeLogger, getLogger } from '@/core/logging';
import { CommandExecutor } from '@/core/shell';
import { StateManager } from '@/core/state';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { WorkspaceWatcherManager, EnvFileWatcherService } from '@/core/vscode';
import { ACTION_DESCRIPTORS } from '@/features/ai/server/actionDescriptors';
import { registerAdobeTools } from '@/features/ai/server/adobeTools';
import { registerApplyUpdatesTool } from '@/features/ai/server/applyUpdatesTool';
import { registerAuthTools } from '@/features/ai/server/authTools';
import { registerCloudResourceTools } from '@/features/ai/server/cloudResourceTools';
import { registerCreateProjectTool } from '@/features/ai/server/createProjectTool';
import { registerDeleteProjectTool } from '@/features/ai/server/deleteProjectTool';
import { registerDiscoveryTools } from '@/features/ai/server/discoveryTools';
import { registerEdsResetTool } from '@/features/ai/server/edsResetTool';
import { createHeadlessHandlerContext } from '@/features/ai/server/headlessHandlerContext';
import { InExtensionMcpServer } from '@/features/ai/server/inExtensionMcpServer';
import { registerCurrentProjectTool } from '@/features/ai/server/currentProjectTool';
import { resolveMcpSocketPath } from '@/features/ai/server/mcpSocketPath';
import { READ_DESCRIPTORS } from '@/features/ai/server/readDescriptors';
import { registerStorefrontTools } from '@/features/ai/server/storefrontTools';
import { registerDescriptorTools } from '@/features/ai/server/toolDescriptors';
import { registerViewTools } from '@/features/ai/server/viewTools';
import { AuthenticationService } from '@/features/authentication';
import { ComponentTreeProvider } from '@/features/components/providers/componentTreeProvider';
import { shouldAutoReopenProjectsList } from '@/features/dashboard/commands/showDashboard';
import { seedDefaultAiPrompts } from '@/features/dashboard/services/defaultPromptsSeeder';
import { cleanupDaLiveSitesCommand } from '@/features/eds/commands/cleanupDaLiveSites';
import { manageGitHubReposCommand } from '@/features/eds/commands/manageGitHubRepos';
import { getDaLiveAuthService, getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import { DaLiveAuthService } from '@/features/eds/services/daLiveAuthService';
import { ensureHomeAiContext } from '@/features/project-creation/services/homeAiContextWriter';
import { SidebarProvider } from '@/features/sidebar';
import type { McpCredentialProvider } from '@/mcp-server';
import type { Logger } from '@/types/logger';
import { getProjectFrontendPort } from '@/types/typeGuards';
import { AutoUpdater } from '@/utils/autoUpdater';

/**
 * Check if projects list should auto-open when activity bar icon is clicked
 *
 * SOP §10: Extracted 4-condition validation chain to named type guard
 * Auto-opens when:
 * 1. Tree view just became visible
 * 2. No webview panels are currently open
 * 3. Not already in the process of opening projects list
 * 4. Not in a webview transition (prevents duplicate panels)
 *
 * @param visible - Whether the tree view is visible
 * @param isOpeningProjectsList - Whether we're already opening the projects list
 * @returns true if projects list should auto-open
 */
function shouldAutoOpenProjectsList(
    visible: boolean,
    isOpeningProjectsList: boolean,
): boolean {
    if (!visible) return false;
    if (BaseWebviewCommand.getActivePanelCount() !== 0) return false;
    if (isOpeningProjectsList) return false;
    if (BaseWebviewCommand.isWebviewTransitionInProgress()) return false;
    return true;
}

/**
 * Whether this window should re-home to the projects root on activation.
 *
 * In the always-root home-Chat model the VS Code window must stay homed at the
 * projects root (so the home `.mcp.json` there reaches the root MCP socket). If
 * a window opened anchored to a project SUBDIR (e.g. a leftover anchor from an
 * older build), re-home it. Returns true only when `ws` is a strict descendant
 * of `projectsRoot` — never for the root itself, an undefined workspace, or an
 * unrelated path.
 */
export function shouldReHomeToRoot(ws: string | undefined, projectsRoot: string): boolean {
    return !!ws && ws !== projectsRoot && ws.startsWith(projectsRoot + path.sep);
}


let logger: Logger;
let stateManager: StateManager;
let autoUpdater: AutoUpdater;
let externalCommandManager: CommandExecutor;
let authenticationService: AuthenticationService;
let componentTreeProvider: ComponentTreeProvider;
let componentTreeView: vscode.TreeView<unknown>;
let daLiveAuthService: DaLiveAuthService;
let inExtensionMcpServer: InExtensionMcpServer | undefined;

export async function activate(context: vscode.ExtensionContext) {
    // Initialize the debug logger first
    const debugLogger = initializeLogger(context);
    
    // Check for pending log replay (after Extension Host restart)
    try {
        const flagFile = path.join(os.homedir(), '.demo-builder', '.pending-log-replay');

        // Check if flag file exists
        const flagExists = await fs.access(flagFile).then(() => true).catch(() => false);
        if (flagExists) {
            // Read log file path from flag
            const logFilePath = await fs.readFile(flagFile, 'utf8');

            // Replay logs from the saved file (don't auto-show output panel)
            await debugLogger.replayLogsFromFile(logFilePath.trim());

            // Remove flag file
            await fs.unlink(flagFile);
        }
    } catch {
        // Silently ignore errors (flag file might not exist, which is fine)
    }
    
    logger = getLogger();
    const version = context.extension.packageJSON.version || '1.0.0';
    logger.debug(`[Extension] Adobe Demo Builder v${version} starting...`);

    try {
        // Initialize state manager FIRST (needed by sidebar)
        stateManager = new StateManager(context);
        await stateManager.initialize();

        // Register StateManager with ServiceLocator (for commands without handler context)
        ServiceLocator.setStateManager(stateManager);

        // Seed built-in AI prompts into the global store once (starter recipes that
        // surface in every project's prompt library). Idempotent and non-fatal.
        try {
            await seedDefaultAiPrompts(context.globalState);
        } catch (err) {
            logger.error('Failed to seed default AI prompts', err);
        }

        // Initialize context variables for view switching
        const hasProject = await stateManager.hasProject();
        await vscode.commands.executeCommand('setContext', 'demoBuilder.projectLoaded', hasProject);
        await vscode.commands.executeCommand('setContext', 'demoBuilder.wizardActive', false);

        // Register Sidebar WebviewView EARLY to minimize blank sidebar time
        // The sidebar only needs stateManager and logger to render
        const sidebarProvider = new SidebarProvider(context, stateManager, logger);
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(
                sidebarProvider.viewId,
                sidebarProvider,
                {
                    webviewOptions: {
                        retainContextWhenHidden: true, // Keep state when sidebar hidden
                    },
                },
            ),
        );

        // Register SidebarProvider with ServiceLocator (for wizard/command access)
        ServiceLocator.setSidebarProvider(sidebarProvider);

        // Register Component TreeView
        // This displays the component file browser when a project is loaded
        componentTreeProvider = new ComponentTreeProvider(stateManager, context.extensionPath);
        componentTreeView = vscode.window.createTreeView('demoBuilder.components', {
            treeDataProvider: componentTreeProvider,
            showCollapseAll: true,
        });

        // Listen for project changes (for potential future use)
        const projectChangeSubscription = stateManager.onProjectChanged(() => {
            // TreeView title is set via package.json "name" field
            // Visibility is controlled by "when" clause: demoBuilder.showComponents
        });

        // When user clicks the activity bar icon and no main webview is open,
        // auto-open the projects list as the home screen
        let isOpeningProjectsList = false;
        const treeViewVisibilitySubscription = componentTreeView.onDidChangeVisibility(async (e) => {
            // SOP §10: Using shouldAutoOpenProjectsList predicate instead of inline chain
            // Guard against opening during webview transitions (prevents duplicate panels)
            if (shouldAutoOpenProjectsList(e.visible, isOpeningProjectsList)) {
                isOpeningProjectsList = true;
                await vscode.commands.executeCommand('demoBuilder.showProjectsList');
                isOpeningProjectsList = false;
            }
        });

        // Add to subscriptions for proper disposal
        context.subscriptions.push(componentTreeView);
        context.subscriptions.push(componentTreeProvider);
        context.subscriptions.push(projectChangeSubscription);
        context.subscriptions.push(treeViewVisibilitySubscription);

        // Set up disposal callback to auto-reopen the Projects List when the
        // Dashboard closes — the safety net so a user inside a project workspace
        // never ends up with no Demo Builder navigation surface.
        //
        // Guarded by `shouldAutoReopenProjectsList`, which short-circuits when:
        //   - a webview transition is in progress (user is mid-navigation), or
        //   - the workspace folder is not a Demo Builder project (the dashboard
        //     was open in a non-project workspace; nothing to reopen toward).
        BaseWebviewCommand.setDisposalCallback(async (webviewId: string) => {
            if (webviewId !== 'demoBuilder.projectDashboard') return;
            const workspaceFolderPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            const transitionInProgress = BaseWebviewCommand.isWebviewTransitionInProgress();
            if (shouldAutoReopenProjectsList(workspaceFolderPath, transitionInProgress)) {
                await vscode.commands.executeCommand('demoBuilder.showProjectsList');
            }
        });

        // Initialize external command manager
        externalCommandManager = new CommandExecutor();

        // Register CommandExecutor with ServiceLocator (breaks circular dependencies)
        ServiceLocator.setCommandExecutor(externalCommandManager);

        // Initialize authentication service
        authenticationService = new AuthenticationService(
            context.extensionPath,
            logger,
            externalCommandManager,
        );

        // Register AuthenticationService with ServiceLocator
        ServiceLocator.setAuthenticationService(authenticationService);

        // Initialize DA.live auth service (for darkalley OAuth testing)
        daLiveAuthService = new DaLiveAuthService(context);

        // Check workspace trust
        if (!vscode.workspace.isTrusted) {
            vscode.window.showWarningMessage(
                'Demo Builder requires a trusted workspace to function properly.',
            );
            return;
        }

        // Auto-zoom for optimal demo visibility (per-window, not global)
        const demoBuilderConfig = vscode.workspace.getConfiguration('demoBuilder');
        const autoZoomEnabled = demoBuilderConfig.get<boolean>('autoZoom', true);

        if (autoZoomEnabled) {
            // Reset zoom to 100% for consistent demo experience
            await vscode.commands.executeCommand('workbench.action.zoomReset');
        }

        // Initialize command manager
        const commandManager = new CommandManager(context, stateManager, logger);
        commandManager.registerCommands();

        // Start the in-extension MCP server (serves Claude Code via the
        // stdio→UDS proxy). Bound to the open workspace folder; restarted when
        // the folder changes. Failure here must never abort activation.
        await startInExtensionMcpServer(context);
        context.subscriptions.push(
            vscode.workspace.onDidChangeWorkspaceFolders(() => {
                void startInExtensionMcpServer(context);
            }),
        );

        // Write the home AI context at the projects root so a Chat launched
        // there reaches the in-extension MCP server on the ROOT socket and can do
        // global / by-name work. Best-effort and additive — never blocks or
        // breaks activation, and changes no navigation/workspace behavior.
        const projectsDir =
            process.env.DEMO_BUILDER_PROJECTS_DIR ?? path.join(os.homedir(), '.demo-builder', 'projects');
        void ensureHomeAiContext(projectsDir, path.join(context.extensionPath, 'dist'));

        // Register file watchers early (before loading projects)
        // This ensures the initializeFileHashes command exists when we need it
        registerFileWatchers(context);

        // Note: Auto-show Welcome logic removed
        // The sidebar now serves as the main navigation hub (Mission Control)
        // Users interact with the sidebar to navigate to Projects Dashboard, project details, etc.
        // The old TreeView-based welcome/components behavior is replaced by the WebviewView sidebar
        
        // Note: Controls view removed - using Status Bar + Project Dashboard instead

        // Register runtime toolbar commands BEFORE creating toolbar
        // (VSCode validates commands exist when assigned to status bar items)
        context.subscriptions.push(
            vscode.commands.registerCommand('demoBuilder.showLogs', () => {
                debugLogger.show(false); // Show Logs channel, take focus
            }),
            vscode.commands.registerCommand('demoBuilder.showDebugLogs', () => {
                debugLogger.showDebug(false); // Show Debug channel, take focus
            }),
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('demoBuilder.restartDemo', async () => {
                await vscode.commands.executeCommand('demoBuilder.stopDemo');
                // Small delay to ensure clean stop
                await new Promise(resolve => setTimeout(resolve, TIMEOUTS.DEMO_STATUS_UPDATE_DELAY));
                await vscode.commands.executeCommand('demoBuilder.startDemo');
            }),
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('demoBuilder.openBrowser', async () => {
                const project = await stateManager.getCurrentProject();
                const port = getProjectFrontendPort(project);
                if (port) {
                    const url = `http://localhost:${port}`;
                    await vscode.env.openExternal(vscode.Uri.parse(url));
                }
            }),
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('demoBuilder.cleanupDaLiveSites', cleanupDaLiveSitesCommand),
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('demoBuilder.manageGitHubRepos', () => manageGitHubReposCommand(context)),
        );

        // Initialize auto-updater (but don't check yet - wait for sidebar activation)
        // Update checks are triggered when the user clicks the sidebar icon
        autoUpdater = new AutoUpdater(context, logger);

        // Clean up any stale flag files from previous versions
        // (The workspace folder addition that used this flag was removed in beta.64)
        try {
            const flagFile = path.join(os.homedir(), '.demo-builder', '.open-dashboard-after-restart');
            await fs.unlink(flagFile).catch(() => {}); // Silently remove if exists
        } catch {
            // Ignore errors
        }

        // Note: Projects List auto-opens via tree view visibility handler (line 128-137)
        // when the sidebar becomes visible with no active webview panels.
        // No explicit setTimeout needed here - that would cause double-opening.

        // Note: Update checks are triggered when the sidebar is first activated
        // (see SidebarProvider.resolveWebviewView)

        // Global MCP registration is consent-gated and triggered after first
        // project creation completes (see executor.ts). The user is asked once;
        // the choice persists in globalState. No activation-time auto-write.

        // Always-root home model: the VS Code window must stay homed at the
        // projects root so the home `.mcp.json` there reaches the root MCP socket
        // and one home Chat can address any project by name. If this window opened
        // anchored to a project SUBDIR (e.g. a leftover anchor from an older
        // build), re-home it to the projects root and bail — the post-reopen
        // activation runs the cold-start path below.
        const projectsRoot =
            process.env.DEMO_BUILDER_PROJECTS_DIR ?? path.join(os.homedir(), '.demo-builder', 'projects');
        const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (shouldReHomeToRoot(ws, projectsRoot)) {
            await fs.mkdir(projectsRoot, { recursive: true }).catch(() => {});
            await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(projectsRoot), false);
            return;
        }

        // Cold start always lands on the projects list as the home screen. For a
        // root-anchored (or non-project) workspace, focus the Demo Builder
        // Activity Bar so the tree-view visibility subscription auto-opens the
        // projects list (guarded by shouldAutoOpenProjectsList).
        if (shouldAutoReopenProjectsList(ws, false)) {
            await vscode.commands.executeCommand('workbench.view.extension.demoBuilder');
        }

        logger.info('[Extension] Ready');

    } catch (error) {
        logger.error(`Failed to activate extension: ${error}`);
        vscode.window.showErrorMessage(
            `Demo Builder activation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
    }
}

export function deactivate() {
    logger.info('Adobe Demo Builder extension is deactivating...');

    // Clean up resources
    autoUpdater?.dispose();
    componentTreeView?.dispose();
    componentTreeProvider?.dispose();
    inExtensionMcpServer?.dispose();
    stateManager?.dispose();
    externalCommandManager?.dispose();
    daLiveAuthService?.dispose();
    // Note: authenticationService has no dispose method

    // Reset service locator
    ServiceLocator.reset();

    logger.info('Adobe Demo Builder extension deactivated.');
}

/**
 * Start (or restart) the in-extension MCP server for the currently-open
 * workspace folder. No-ops when no project workspace is open. The socket path
 * is derived from the workspace folder so each window/project gets its own
 * socket; the proxy resolves the same path from its cwd / env. Never throws —
 * MCP availability must not affect the rest of the extension.
 */
async function startInExtensionMcpServer(context: vscode.ExtensionContext): Promise<void> {
    try {
        inExtensionMcpServer?.dispose();
        inExtensionMcpServer = undefined;

        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspacePath) {
            return;
        }
        const projectsDir =
            process.env.DEMO_BUILDER_PROJECTS_DIR ?? path.join(os.homedir(), '.demo-builder', 'projects');
        // Handler-backed read/status tools dispatch through the existing handler
        // maps with a fresh headless context per call.
        const ctxFactory = () => createHeadlessHandlerContext(context, stateManager, logger);
        // Resolve DA.live / GitHub tokens from the live sign-in session so the
        // credential-needing tools (sync_storefront, promote_block_to_library)
        // see the same auth get_auth_status / sign_in operate on. Resolved fresh
        // per call (token expiry); failures degrade to null (treated as no token).
        const credentials: McpCredentialProvider = {
            getDaLiveToken: () => getDaLiveAuthService(context).getAccessToken(),
            getGitHubToken: async () => (await getGitHubServices(ctxFactory()).tokenService.getToken())?.token ?? null,
        };
        const server = new InExtensionMcpServer(
            resolveMcpSocketPath(workspacePath),
            projectsDir,
            logger,
            (mcpServer) => {
                registerDescriptorTools(mcpServer, [...READ_DESCRIPTORS, ...ACTION_DESCRIPTORS], ctxFactory);
                registerDiscoveryTools(mcpServer);
                registerAuthTools(mcpServer, ctxFactory);
                registerAdobeTools(mcpServer, ctxFactory);
                registerCreateProjectTool(mcpServer, ctxFactory);
                registerCurrentProjectTool(mcpServer, ctxFactory);
                registerCloudResourceTools(mcpServer, ctxFactory);
                registerStorefrontTools(mcpServer, ctxFactory);
                registerEdsResetTool(mcpServer, ctxFactory);
                registerDeleteProjectTool(mcpServer, ctxFactory);
                registerApplyUpdatesTool(mcpServer, ctxFactory);
                registerViewTools(mcpServer, (commandId) => Promise.resolve(vscode.commands.executeCommand(commandId)));
            },
            credentials,
        );
        await server.start();
        inExtensionMcpServer = server;
    } catch (err) {
        logger.error('Failed to start in-extension MCP server', err instanceof Error ? err : undefined);
    }
}

function registerFileWatchers(context: vscode.ExtensionContext) {
    // Create workspace watcher manager and env file watcher service
    const watcherManager = new WorkspaceWatcherManager();
    const envWatcherService = new EnvFileWatcherService(
        context,
        stateManager,
        watcherManager,
        logger,
    );

    // Initialize watchers for all workspace folders
    envWatcherService.initialize();

    // Register for disposal on extension deactivation
    context.subscriptions.push(envWatcherService);
    context.subscriptions.push(watcherManager);
}