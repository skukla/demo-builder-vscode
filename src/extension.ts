import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { CommandManager } from '@/commands/commandManager';
import { BaseWebviewCommand } from '@/core/base';
import { describeBuildInfo, readBuildInfo } from '@/core/build/buildInfo';
import { registerBuildStamp } from '@/core/build/buildStampUi';
import { ServiceLocator } from '@/core/di';
import { initializeLogger, getLogger } from '@/core/logging';
import { CommandExecutor } from '@/core/shell';
import { StateManager } from '@/core/state';
import { sweepManifestFormat } from '@/core/state/manifestFormatSweep';
import { resolveMcpSocketPath } from '@/core/utils/mcpSocketPath';
import { resolveProjectsRoot } from '@/core/utils/projectsRoot';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { WorkspaceWatcherManager, EnvFileWatcherService } from '@/core/vscode';
import { ACTION_DESCRIPTORS } from '@/features/ai/server/actionDescriptors';
import { registerAdobeResourceTools } from '@/features/ai/server/adobeResourceTools';
import { registerAdobeTools } from '@/features/ai/server/adobeTools';
import {
    createAgentConsentGate,
    createAgentOperationNotifier,
} from '@/features/ai/server/agentOperationNotifier';
import { createAgentTraceFileSink } from '@/features/ai/server/agentTraceSink';
import { registerAgentTraceTool } from '@/features/ai/server/agentTraceTool';
import { registerApplyUpdatesTool } from '@/features/ai/server/applyUpdatesTool';
import { registerAuthTools } from '@/features/ai/server/authTools';
import { registerCloudResourceTools } from '@/features/ai/server/cloudResourceTools';
import { registerCommerceEndpointsTool } from '@/features/ai/server/commerceEndpointsTool';
import { registerCommerceQueryTool } from '@/features/ai/server/commerceQueryTool';
import { registerComponentRequirementsTool } from '@/features/ai/server/componentRequirementsTool';
import { registerConfigureProjectTool } from '@/features/ai/server/configureProjectTool';
import { registerContentAuthoringTools } from '@/features/ai/server/contentAuthoringTools';
import { registerCreateProjectTool } from '@/features/ai/server/createProjectTool';
import { registerCurrentProjectTool } from '@/features/ai/server/currentProjectTool';
import { DATA_INSTALLER_DESCRIPTORS } from '@/features/ai/server/dataInstallerDescriptors';
import { registerDeleteProjectTool } from '@/features/ai/server/deleteProjectTool';
import { registerDiagnosticsTools } from '@/features/ai/server/diagnosticsTools';
import { registerDiscoveryTools } from '@/features/ai/server/discoveryTools';
import { registerEdsResetTool } from '@/features/ai/server/edsResetTool';
import { registerEventProviderTools } from '@/features/ai/server/eventProviderTools';
import { createHeadlessHandlerContext } from '@/features/ai/server/headlessHandlerContext';
import {
    InExtensionMcpServer,
    type InExtensionMcpServerOptions,
} from '@/features/ai/server/inExtensionMcpServer';
import { registerLifecycleTools } from '@/features/ai/server/lifecycleTools';
import { registerProjectStatusTool } from '@/features/ai/server/projectStatusTool';
import { READ_DESCRIPTORS } from '@/features/ai/server/readDescriptors';
import { createScopedStateManager } from '@/features/ai/server/scopedStateManager';
import { registerSettingsTools } from '@/features/ai/server/settingsTools';
import { registerSiteTools } from '@/features/ai/server/siteTools';
import { STATUS_DESCRIPTORS } from '@/features/ai/server/statusDescriptors';
import { registerStorefrontTools } from '@/features/ai/server/storefrontTools';
import { registerDescriptorTools } from '@/features/ai/server/toolDescriptors';
import { narrationFor } from '@/features/ai/server/toolNarration';
import { ToolTraceRecorder } from '@/features/ai/server/toolTraceRecorder';
import { registerValidateSelectionTool } from '@/features/ai/server/validateSelectionTool';
import { registerViewTools } from '@/features/ai/server/viewTools';
import { AuthenticationService } from '@/features/authentication';
import { sweepCommerceSecrets } from '@/features/components/services/commerceSecretSweep';
import { shouldAutoReopenProjectsList } from '@/features/dashboard/commands/showDashboard';
import { seedDefaultAiPrompts } from '@/features/dashboard/services/defaultPromptsSeeder';
import { cleanupDaLiveSitesCommand } from '@/features/eds/commands/cleanupDaLiveSites';
import { manageGitHubReposCommand } from '@/features/eds/commands/manageGitHubRepos';
import { getDaLiveAuthService, getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import { DaLiveAuthService } from '@/features/eds/services/daLive/daLiveAuthService';
import { createDaLiveServiceTokenProvider } from '@/features/eds/services/daLive/daLiveContentOperations';
import { registerEwSettingChangeListener } from '@/features/eds/services/ewSettingChangeListener';
import { HelixService } from '@/features/eds/services/helix/helixService';
import { renewPublishKeys } from '@/features/eds/services/pdp/publishKeyRenewalSweep';
import { refreshAiBundlesOnActivation } from '@/features/project-creation/services/aiBundle/aiBundleActivationRefresh';
import { setThirdPartyToolsResolver } from '@/features/project-creation/services/aiBundle/aiToolingGate';
import { refreshGlobalMcpIfPresent } from '@/features/project-creation/services/aiBundle/globalMcpRegistration';
import {
    ensureHomeAiContext,
    refreshHomeAgentsMd,
} from '@/features/project-creation/services/aiBundle/homeAiContextWriter';
import { registerThirdPartyToolingSettingListener } from '@/features/project-creation/services/aiBundle/thirdPartyToolingSettingListener';
import { SidebarProvider } from '@/features/sidebar/providers/sidebarProvider';
import type { McpCredentialProvider } from '@/mcp-server';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';
import { getProjectFrontendPort } from '@/types/typeGuards';
import { AutoUpdater } from '@/utils/autoUpdater';
import { createCommandExecutorDeps } from '@/core/shell/commandExecutorDeps';

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
let daLiveAuthService: DaLiveAuthService;
let inExtensionMcpServer: InExtensionMcpServer | undefined;
/**
 * Records every agent tool call into a capped in-memory buffer.
 *
 * ONE recorder for the window, not one per MCP connection: a client that drops
 * and reconnects mid-task is still one path through the extension, and a
 * per-connection recorder would cut that trace in half at the seam.
 *
 * NOTHING READS IT TODAY. Its only consumer was the prompt-evaluation surface,
 * which moved to `feature/evaluation-mode-dry-run` — see AI-3b. The recorder stays
 * wired because the write is one array push against a capped buffer and it is
 * the foundation AI-2 ("can you see what the agent is doing") needs; pulling
 * the `trace` hook out would mean surgery inside the core MCP server. If AI-2
 * is answered some other way, delete this and the option together rather than
 * leaving a recorder nobody reads.
 *
 * `projectShape` is deliberately NOT wired. The recorder accepts it and its
 * tests cover it, but the only way to resolve the current project today is
 * `getCurrentProject()`, which reads from disk on purpose (an in-memory pointer
 * went stale and answered confidently — right data, wrong project). A disk read
 * per tool call would add overhead to the very thing built to measure overhead.
 */
// Wired with its sinks inside activate() — the file sink needs the
// extension's storage path and the channel needs the window. Recorder module
// stays vscode-free; the sinks are two listeners it never has to know about.
let agentTrace = new ToolTraceRecorder();

export async function activate(context: vscode.ExtensionContext) {
    // Initialize the debug logger first
    const debugLogger = initializeLogger(context);

    // The agent activity record (AI-2c): every tool call an agent makes is
    // (a) appended to a per-session file under the extension's log storage —
    // names, sizes, outcomes, a one-way fingerprint of argument values, never
    // a value — and (b) narrated live on its own channel, so "what is the
    // agent doing?" is watchable without wading through Debug Logs.
    const agentTraceDir = path.join(context.logUri.fsPath, 'agent-traces');
    // The trace must never cost the extension its activation: a storage path
    // that cannot be created (sandboxed tests, exotic hosts) degrades to
    // channel-only — the in-memory record and the live view still work.
    let traceFileSink: ReturnType<typeof createAgentTraceFileSink> | undefined;
    try {
        traceFileSink = createAgentTraceFileSink(agentTraceDir);
    } catch (err) {
        debugLogger.warn(
            `[AgentTrace] file sink unavailable (${err instanceof Error ? err.message : String(err)}) — channel-only`,
        );
    }
    const activityChannel = vscode.window.createOutputChannel('Demo Builder: Agent Activity');
    context.subscriptions.push(activityChannel);
    agentTrace = new ToolTraceRecorder(undefined, (entry) => {
        traceFileSink?.sink(entry);
        const mark = entry.outcome === 'ok' ? '✓' : '✗';
        const what = narrationFor(entry.tool) ?? entry.tool;
        activityChannel.appendLine(
            `${new Date().toLocaleTimeString()} ${mark} ${what} · ${entry.tool} · ` +
                `${entry.durationMs}ms · ${entry.resultBytes}B` +
                // The tag NAMES the call here; the same number MARKS its lines
                // in Debug Logs — filter there by "#N" to read only this
                // call's story (AI-2d).
                (entry.tag !== undefined ? ` · #${entry.tag}` : ''),
        );
    });

    // Check for pending log replay (after Extension Host restart)
    await replayPendingLogs(debugLogger);

    logger = getLogger();
    const version = context.extension.packageJSON.version || '1.0.0';
    logger.debug(`[Extension] Adobe Demo Builder v${version} starting...`);

    // Third-party tooling opt-out: the ONE code point for the gate lives in
    // aiToolingGate (pure); the setting is injected here so every seam —
    // creation, regenerate, activation sweep — reads the same answer.
    setThirdPartyToolsResolver(() =>
        vscode.workspace
            .getConfiguration('demoBuilder')
            .get<boolean>('ai.enableThirdPartyTools', true),
    );

    // Name the build BEFORE anything else can fail: with several checkouts on one
    // machine, F5 binds to whichever window had focus, and "which dist/ is this?"
    // is the first question worth being able to answer.
    await registerBuildStamp(context, logger);

    // Correct a global MCP entry left pointing at a previous version. The entry
    // embeds this directory's path and VS Code names it with the version, so every
    // update invalidates it; nothing re-wrote it until now, and Claude Code
    // responds by refusing to add ANY server ("conflicting scopes"). Repairs only
    // what the user already opted into — an absent entry is never created. The
    // common path is a read and two comparisons; only a genuine mismatch writes.
    await refreshGlobalMcpEntry(context);

    try {
        // Initialize state manager FIRST (needed by sidebar)
        stateManager = new StateManager(context);
        await stateManager.initialize();

        // Register StateManager with ServiceLocator (for commands without handler context)
        ServiceLocator.setStateManager(stateManager);

        // SecretStorage, for the write-time consumers of a declared secret — the
        // generated `.env` above all, which is how a PaaS demo receives its admin
        // password. Registered before anything can generate one.
        ServiceLocator.setSecretStorage(context.secrets);

        // The two per-project upkeep sweeps, run ONE AFTER THE OTHER.
        //
        // 1. Silent AI-bundle upkeep for every known project (ADR-013): tier-1
        //    config repair always; tier-1+2 refresh + stamp when a project's
        //    aiContextVersion is stale.
        // 2. Publish-key renewal (Helix keys expire in ~1 year).
        //
        // SEQUENCED, NOT CONCURRENT — do not split these back into two `void`
        // calls. Each loads its OWN copy of every project, mutates a different
        // field (aiContextVersion + aiFileHashes vs publishKeyRegisteredAt), and
        // saves the WHOLE `.demo-builder.json`. Run in parallel, whichever
        // finishes second was built from a copy loaded before the first one
        // wrote, so its save silently drops the other's field. Losing
        // aiFileHashes is the bad one: the ADR-013 hash baseline never
        // establishes, so the treat-as-unmodified-ONCE overwrite fires on EVERY
        // activation and destroys the user's edits to AGENTS.md repeatedly
        // instead of once. Running the second only after the first has saved
        // means it loads a manifest that already carries the other's field.
        //
        // Still fire-and-forget as a pair: activation never waits on either.
        void (async () => {
            await refreshAiBundlesOnActivation(context.extensionPath, logger);
            await sweepPublishKeyRenewals(context);
            // The ordering buys nothing structural: each sweep re-loads from disk
            // independently, and the ones before it write manifests as well. The
            // newest sweeps sit last so they are the easiest to drop if the upkeep
            // chain ever needs shortening.
            await sweepCommerceSecretStorage(context);
            // Manifest write-back migration: load+save any manifest not stamped
            // with MANIFEST_FORMAT_VERSION, so legacy shapes are rewritten on
            // disk instead of converted on every read forever. Must stay IN this
            // sequential chain — it saves whole manifests, same as the others.
            await sweepManifestFormats();
        })().catch((error) => {
            logger.warn(`[Activation] Project upkeep sweep failed: ${(error as Error).message}`);
        });

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
            vscode.window.registerWebviewViewProvider(sidebarProvider.viewId, sidebarProvider, {
                webviewOptions: {
                    retainContextWhenHidden: true, // Keep state when sidebar hidden
                },
            }),
        );

        // Register SidebarProvider with ServiceLocator (for wizard/command access)
        ServiceLocator.setSidebarProvider(sidebarProvider);

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
        externalCommandManager = new CommandExecutor(createCommandExecutorDeps());

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

        // Auto zoom-reset on load — OPT-IN (default false, flipped 2026-07-09):
        // silently changing window zoom at activation surprises users and can
        // undo a presenter's deliberate Set Recommended Zoom right before a
        // demo. Zoom changes are user-initiated via the Set Recommended Zoom /
        // Reset Zoom commands unless this setting is explicitly enabled.
        const demoBuilderConfig = vscode.workspace.getConfiguration('demoBuilder');
        const autoZoomEnabled = demoBuilderConfig.get<boolean>('autoZoom', false);

        if (autoZoomEnabled) {
            await vscode.commands.executeCommand('workbench.action.zoomReset');
        }

        // Initialize command manager
        const commandManager = new CommandManager(context, stateManager, logger);
        commandManager.registerCommands();

        // Register the ONE DA.live token source every HelixService falls back
        // to. There is a single DA.live session per host, so threading it
        // through each layer that builds a HelixService modelled a plurality
        // that does not exist — and two construction sites were missing it,
        // which made a Helix code publish 401 on any admin-locked site and
        // leave the CDN serving a stale config.json. Registered before anything
        // can construct one.
        HelixService.setDefaultDaLiveTokenProvider(
            createDaLiveServiceTokenProvider(getDaLiveAuthService(context)),
        );

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
        const projectsRoot = resolveProjectsRoot();
        void (async () => {
            const current = await stateManager.getCurrentProject();
            await ensureHomeAiContext(
                projectsRoot,
                path.join(context.extensionPath, 'dist'),
                undefined,
                current?.name,
            );
        })();

        // Keep the home AGENTS.md in step with the current-project pointer.
        //
        // Without this the file only told the truth by luck. Activation wrote one
        // version and the Chat tile wrote another, so a headless `claude -p` run
        // got whichever had been written last — measured 2026-08-26, 9 of 10
        // battery prompts spent a round trip on an orientation call the file had
        // ordered them to make.
        //
        // Subscribing is what makes stating the name SAFE. The objection to
        // naming a project at activation was that the pointer moves afterwards
        // and the file goes stale; it cannot go stale if it is rewritten whenever
        // the pointer moves. `undefined` (no project) rewrites the fallback, so
        // clearing the pointer never leaves a name behind that is no longer true.
        context.subscriptions.push(
            stateManager.onProjectChanged((project) => {
                void refreshHomeAgentsMd(projectsRoot, project?.name);
            }),
        );

        // The publish key's SECOND trigger. The activation run happens above,
        // sequenced behind the AI-bundle sweep; this one fires on sign-in.
        //
        // Both exist because activation alone does not work: the sweep needs a
        // DA.live session, and activation is the moment one is LEAST likely to
        // exist. Measured 2026-08-15 — the stored token was already expired at
        // startup and only refreshed 54s later when the user started a reset. So
        // sign-in is the trigger that reliably fires, and activation is the one
        // that catches a session already valid from a previous window.
        //
        // Safe to leave un-sequenced here: by the time a user signs in to DA.live,
        // the activation pair has long since finished, so there is nothing to race.
        context.subscriptions.push(
            getDaLiveAuthService(context).onDidSignIn(() => {
                void sweepPublishKeyRenewals(context);
            }),
        );

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
        registerRuntimeCommands(context, debugLogger);

        // Republish affected EDS projects when an EW-URL-affecting daLive setting
        // (ewCanvasBranch / authoringExperience) changes — confirm-gated, debounced.
        context.subscriptions.push(
            registerEwSettingChangeListener({
            context,
            stateManager,
            logger,
            // The SHARED token service: its validation cache is per-instance, so
            // building a fresh one downstream would cost a GitHub round trip.
            githubTokenService: getGitHubServices({ context }).tokenService,
        }),
            // Step 7 of the third-party-tooling item: re-enabling must install.
            registerThirdPartyToolingSettingListener(
                ServiceLocator.getCommandExecutor(),
                context.extensionPath,
                logger,
            ),
        );

        // Initialize auto-updater (but don't check yet - wait for sidebar activation)
        // Update checks are triggered when the user clicks the sidebar icon
        autoUpdater = new AutoUpdater(context, logger);

        // Clean up any stale flag files from previous versions
        await cleanupStaleFlagFiles();

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
        const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (shouldReHomeToRoot(ws, projectsRoot)) {
            await fs.mkdir(projectsRoot, { recursive: true }).catch(() => {});
            await vscode.commands.executeCommand(
                'vscode.openFolder',
                vscode.Uri.file(projectsRoot),
                false,
            );
            return;
        }

        // Cold start always lands on the projects list as the home screen. For a
        // root-anchored (or non-project) workspace, focus the Demo Builder
        // Activity Bar so the sidebar webview resolves; its visibility handler
        // (SidebarProvider.resolveWebviewView) then opens the projects list.
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

/** Replay logs saved before an Extension Host restart, then clear the flag. */
async function replayPendingLogs(debugLogger: ReturnType<typeof initializeLogger>): Promise<void> {
    try {
        const flagFile = path.join(os.homedir(), '.demo-builder', '.pending-log-replay');
        const flagExists = await fs
            .access(flagFile)
            .then(() => true)
            .catch(() => false);
        if (flagExists) {
            const logFilePath = await fs.readFile(flagFile, 'utf8');
            // Replay logs from the saved file (don't auto-show output panel)
            await debugLogger.replayLogsFromFile(logFilePath.trim());
            await fs.unlink(flagFile);
        }
    } catch {
        // Silently ignore errors (flag file might not exist, which is fine)
    }
}

/**
 * Correct a global MCP entry left pointing at a previous version (see the
 * call site in activate() for why this must be visible when it fails).
 */
async function refreshGlobalMcpEntry(context: vscode.ExtensionContext): Promise<void> {
    try {
        if (await refreshGlobalMcpIfPresent(path.join(context.extensionPath, 'dist'))) {
            logger.info('[MCP] refreshed the global ~/.claude.json entry for this version');
        }
    } catch (error) {
        // WARN, not debug. If the repair fails, the drift check keeps reporting
        // user-scope drift on every dashboard open and the heal cannot clear it —
        // regenerate rewrites project files, never ~/.claude.json. That is the
        // dead end this whole change exists to remove, so it must be visible when
        // it happens rather than buried in a channel nobody reads.
        logger.warn(
            `[MCP] could not refresh the global ~/.claude.json entry — Claude Code may report ` +
                `conflicting scopes until it is fixed by hand: ${(error as Error).message}`,
        );
    }
}

/** The small always-on commands the status bar and palette expect to exist. */
function registerRuntimeCommands(
    context: vscode.ExtensionContext,
    debugLogger: ReturnType<typeof initializeLogger>,
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('demoBuilder.showLogs', () => {
            debugLogger.show(false); // Show Logs channel, take focus
        }),
        vscode.commands.registerCommand('demoBuilder.showDebugLogs', () => {
            debugLogger.showDebug(false); // Show Debug channel, take focus
        }),
        vscode.commands.registerCommand('demoBuilder.restartDemo', async () => {
            await vscode.commands.executeCommand('demoBuilder.stopDemo');
            // Small delay to ensure clean stop
            await sleep(TIMEOUTS.DEMO_STATUS_UPDATE_DELAY);
            await vscode.commands.executeCommand('demoBuilder.startDemo');
        }),
        vscode.commands.registerCommand('demoBuilder.openBrowser', async () => {
            const project = await stateManager.getCurrentProject();
            const port = getProjectFrontendPort(project);
            if (port) {
                const url = `http://localhost:${port}`;
                await vscode.env.openExternal(vscode.Uri.parse(url));
            }
        }),
        vscode.commands.registerCommand('demoBuilder.cleanupDaLiveSites', () =>
            cleanupDaLiveSitesCommand(context),
        ),
        vscode.commands.registerCommand('demoBuilder.manageGitHubRepos', () =>
            manageGitHubReposCommand(context),
        ),
    );
}

/**
 * Clean up any stale flag files from previous versions.
 * (The workspace folder addition that used this flag was removed in beta.64.)
 */
async function cleanupStaleFlagFiles(): Promise<void> {
    try {
        const flagFile = path.join(os.homedir(), '.demo-builder', '.open-dashboard-after-restart');
        await fs.unlink(flagFile).catch(() => {}); // Silently remove if exists
    } catch {
        // Ignore errors
    }
}

export function deactivate() {
    logger.info('Adobe Demo Builder extension is deactivating...');

    // Clean up resources
    autoUpdater?.dispose();
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

        // The workspace folder plays no part here. The window model is "homed
        // at the projects root, project selected by pointer" — the socket is
        // derived from the projects root alone, so the server starts the same
        // with no folder open at all (refusing to start without one once left
        // anyone driving the extension from the sidebar with no MCP server).
        const projectsDir = resolveProjectsRoot();
        // Handler-backed read/status tools dispatch through the existing handler
        // maps with a fresh headless context per call.
        const ctxFactory = () => createHeadlessHandlerContext(context, stateManager, logger);
        // Resolve DA.live / GitHub tokens from the live sign-in session so the
        // credential-needing tools (sync_storefront, promote_block_to_library)
        // see the same auth get_auth_status / sign_in operate on. Resolved fresh
        // per call (token expiry); failures degrade to null (treated as no token).
        const credentials: McpCredentialProvider = {
            getDaLiveToken: () => getDaLiveAuthService(context).getAccessToken(),
            getGitHubToken: async () =>
                (await getGitHubServices(ctxFactory()).tokenService.getToken())?.token ?? null,
        };
        // One socket: the projects-root path, derivable without an open
        // workspace (the window model is "homed at the projects root, project
        // selected by pointer"). Every .mcp.json — home and per-project alike —
        // pins this socket. The dual-listen shim that additionally bound a
        // distinct workspace-folder socket was removed 2026-08-23 with the
        // decouple-project-from-workspace closure: nothing targets a
        // workspace socket anymore, and a cwd-derived proxy that misses this
        // one falls back to live-socket discovery.
        const socketPath = resolveMcpSocketPath(projectsDir);
        // Name the serving host in serverInfo.version. Every window computes the
        // same socket name and the last to bind silently owns it, so without this
        // an MCP client has no way to tell which extension host answered — two
        // probes of one path minutes apart can return different tool sets. Same
        // stamp the activation `[Build]` line prints; undefined when unreadable,
        // which falls back to the static version.
        const buildInfo = await readBuildInfo(context.extensionPath);
        // Named and kept: one option object, so anything that needs a second
        // server on its own socket gets exactly these tools. Two objects would
        // drift, and the drifting one would be whichever nobody watches.
        const mcpServerOptions: InExtensionMcpServerOptions = {
            buildLabel: buildInfo ? describeBuildInfo(buildInfo) : undefined,
            credentials,
            // Agent-triggered mutations get the same visible progress their
            // dashboard buttons show, plus a landed outcome — the agent's own
            // report may never reach the user. First slice of the
            // consent/visibility design; see agentOperationNotifier.
            longRunningNotifier: createAgentOperationNotifier(logger),
            consentGate: createAgentConsentGate(logger),
            // Standing consent, read live — must beat the chat ask (see the
            // option's doc: headless clients auto-decline elicitation).
            consentNotRequired: () =>
                vscode.workspace
                    .getConfiguration('demoBuilder')
                    .get<boolean>('ai.requireAgentConsent', true) === false,
            trace: agentTrace,
            registerExtraTools: (mcpServer, scopedProjectDir) => {
                // Per-connection scope (owner decision 2026-08-28): a session
                // whose directory sits inside a project acts on THAT project —
                // reads load it fresh from disk, saves never flip the
                // dashboard pointer (scopedStateManager). The home chat and
                // bare clients arrive unscoped and keep pointer semantics.
                const connState = scopedProjectDir
                    ? createScopedStateManager(stateManager, scopedProjectDir)
                    : stateManager;
                const connCtxFactory = scopedProjectDir
                    ? () => createHeadlessHandlerContext(context, connState, logger)
                    : ctxFactory;
                registerDescriptorTools(
                    mcpServer,
                    [
                        ...READ_DESCRIPTORS,
                        ...STATUS_DESCRIPTORS,
                        ...ACTION_DESCRIPTORS,
                        ...DATA_INSTALLER_DESCRIPTORS,
                    ],
                    connCtxFactory,
                );
                registerDiscoveryTools(mcpServer);
                // VS Code mirrors the output channels to files under logUri —
                // that mirror is what read_debug_logs serves.
                registerDiagnosticsTools(mcpServer, context.logUri.fsPath);
                registerAuthTools(mcpServer, connCtxFactory);
                registerAdobeTools(mcpServer, connCtxFactory);
                registerCreateProjectTool(mcpServer, connCtxFactory);
                registerCurrentProjectTool(mcpServer, connCtxFactory, scopedProjectDir);
                // Same derivation as activate()'s sink wiring — the dir is a
                // pure function of the extension's log storage.
                registerAgentTraceTool(
                    mcpServer,
                    agentTrace,
                    path.join(context.logUri.fsPath, 'agent-traces'),
                );
                registerProjectStatusTool(mcpServer, connState);
                registerCommerceEndpointsTool(mcpServer, connState);
                registerCommerceQueryTool(mcpServer, connState);
                registerValidateSelectionTool(mcpServer, connCtxFactory);
                registerComponentRequirementsTool(mcpServer);
                registerAdobeResourceTools(mcpServer, connCtxFactory);
                // I/O Events lifecycle (AB-6) — scoped to the current
                // project's Console workspace; deletes are consent-gated.
                registerEventProviderTools(mcpServer, connCtxFactory, () => authenticationService);
                registerConfigureProjectTool(mcpServer, connState);
                registerCloudResourceTools(mcpServer, connCtxFactory);
                registerStorefrontTools(mcpServer, connCtxFactory);
                registerSiteTools(mcpServer, connCtxFactory);
                registerSettingsTools(mcpServer, (key) => {
                    // Split on the LAST dot: `workspace.getConfiguration(section)`
                    // takes the parent and the leaf separately, and these keys are
                    // two and three segments deep alike.
                    const lastDot = key.lastIndexOf('.');
                    return vscode.workspace
                        .getConfiguration(key.slice(0, lastDot))
                        .get(key.slice(lastDot + 1));
                });
                registerContentAuthoringTools(mcpServer, connCtxFactory);
                registerEdsResetTool(mcpServer, connCtxFactory);
                registerDeleteProjectTool(mcpServer, connCtxFactory);
                registerApplyUpdatesTool(mcpServer, connCtxFactory);
                registerViewTools(mcpServer, (commandId) =>
                    Promise.resolve(vscode.commands.executeCommand(commandId)),
                );
                registerLifecycleTools(mcpServer, connCtxFactory, (url) =>
                    Promise.resolve(vscode.env.openExternal(vscode.Uri.parse(url))),
                );
            },
        };
        const server = new InExtensionMcpServer(socketPath, projectsDir, logger, mcpServerOptions);
        await server.start();
        inExtensionMcpServer = server;
    } catch (err) {
        logger.error(
            'Failed to start in-extension MCP server',
            err instanceof Error ? err : undefined,
        );
    }
}

/**
 * Every project on disk, fully loaded.
 *
 * Shared by the upkeep sweeps below, which each need the whole set. Extracted at
 * two rather than three because the duplicate carries a SIDE EFFECT that is easy
 * to miss: `loadProjectFromPath` defaults to `persistAfterLoad: true`, so each
 * copy re-saves every project and moves `currentProject`. Two copies did that
 * twice per activation.
 */
async function loadAllProjects(): Promise<Project[]> {
    const summaries = await stateManager.getAllProjects();
    const projects: Project[] = [];
    for (const summary of summaries) {
        const project = await stateManager.loadProjectFromPath(summary.path);
        if (project) projects.push(project);
    }
    return projects;
}

/**
 * Move every existing project's declared secrets into SecretStorage.
 *
 * Glue only; the verified write-through lives in `migrateDeclaredSecrets`. Runs on
 * the activation upkeep path because a credential sitting in plaintext should not
 * wait for a user to happen to open Configure and save
 * (`.rptc/complete/component-secret-routing/`, phase 3).
 */
async function sweepCommerceSecretStorage(context: vscode.ExtensionContext): Promise<void> {
    try {
        const projects = await loadAllProjects();

        await sweepCommerceSecrets({
            projects,
            secrets: context.secrets,
            saveProject: (project) => stateManager.saveProjectConfigOnly(project),
            log: (line) => logger.info(`[Secrets] ${line}`),
        });
    } catch (error) {
        logger.debug(`[Secrets] Sweep skipped: ${(error as Error).message}`);
    }
}

/**
 * Load every project and hand them to the publish-key renewal sweep.
 *
 * Glue only — the decision of what is due lives in `renewPublishKeys`, which
 * stays UI-free and testable. Swallows its own errors: a renewal that cannot run
 * must cost the renewal and nothing else on the activation path.
 */
async function sweepPublishKeyRenewals(context: vscode.ExtensionContext): Promise<void> {
    try {
        const projects = await loadAllProjects();

        await renewPublishKeys({
            projects,
            tokenProvider: createDaLiveServiceTokenProvider(getDaLiveAuthService(context)),
            saveProject: (project) => stateManager.saveProjectConfigOnly(project),
            logger,
        });
    } catch (error) {
        logger.debug(`[PublishKey] Renewal sweep skipped: ${(error as Error).message}`);
    }
}

/**
 * Glue for the manifest write-back migration (see manifestFormatSweep.ts).
 *
 * persistAfterLoad: false — the sweep saves via saveProjectConfigOnly itself;
 * the default save path would also move currentProject and the recents list
 * for every migrated project.
 */
async function sweepManifestFormats(): Promise<void> {
    try {
        const summaries = await stateManager.getAllProjects();
        await sweepManifestFormat({
            projectPaths: summaries.map((s) => s.path),
            loadProject: (projectPath) =>
                stateManager.loadProjectFromPath(projectPath, undefined, {
                    persistAfterLoad: false,
                }),
            saveProject: (project) => stateManager.saveProjectConfigOnly(project),
            log: (line) => logger.info(`[ManifestFormat] ${line}`),
        });
    } catch (error) {
        logger.debug(`[ManifestFormat] Sweep skipped: ${(error as Error).message}`);
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
