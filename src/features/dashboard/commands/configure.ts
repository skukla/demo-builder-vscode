import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { configureHandlers } from '../handlers/configureHandlers';
import { mergeEnvValuesFromSources } from './configureEnvLoader';
import { ProjectDashboardWebviewCommand } from './showDashboard';
import { BaseWebviewCommand } from '@/core/base';
import { WebviewCommunicationManager } from '@/core/communication';
import { ServiceLocator } from '@/core/di';
import { dispatchHandler, getRegisteredTypes } from '@/core/handlers';
import { getBundleUri } from '@/core/utils/bundleUri';
import { parseEnvFile } from '@/core/utils/envParser';
import { getWebviewHTML } from '@/core/utils/getWebviewHTMLWithBundles';
import { normalizeIfUrl } from '@/core/validation/Validator';
import { ComponentRegistryManager } from '@/features/components/services/ComponentRegistryManager';
import { COMPONENT_IDS } from '@/core/constants';
import { detectStorefrontChanges, isEdsProject, republishStorefrontConfig } from '@/features/eds';
import {
    applyDaLiveOrgConfigSettings,
    getDaLiveAuthService,
    getEwCanvasBranch,
    resolveProjectAuthoringExperience,
} from '@/features/eds/handlers/edsHelpers';
import { DaLiveContentOperations, createDaLiveServiceTokenProvider } from '@/features/eds/services/daLiveContentOperations';
import { GitHubFileOperations } from '@/features/eds/services/githubFileOperations';
import { GitHubTokenService } from '@/features/eds/services/githubTokenService';
import { HelixService } from '@/features/eds/services/helixService';
import { installQuickEdit } from '@/features/eds/services/quickEditPublisher';
import { detectMeshChanges } from '@/features/mesh/services/stalenessDetector';
import { handleRenameProject } from '@/features/projects-dashboard/handlers/dashboardHandlers';
import { Project } from '@/types';
import type { AuthoringExperience } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, SharedState } from '@/types/handlers';
import { getComponentInstanceEntries, getEdsDaLiveUrl } from '@/types/typeGuards';

const AUTHORING_EXPERIENCES: ReadonlySet<AuthoringExperience> = new Set<AuthoringExperience>([
    'da-live-classic',
    'experience-workspace',
]);

// Component configuration type (key-value pairs for environment variables)
type ComponentConfigs = Record<string, Record<string, string>>;

// Initial data structure sent to webview
interface ConfigureInitialData {
    theme: 'dark' | 'light';
    project: Project;
    componentsData: {
        frontends?: unknown[];
        backends?: unknown[];
        dependencies?: unknown[];
        mesh?: unknown[];
        integrations?: unknown[];
        appBuilder?: unknown[];
        envVars: Record<string, unknown>;
    };
    existingEnvValues: Record<string, Record<string, string>>;
    existingProjectNames: string[];
    /** Whether this is an EDS project — gates the Authoring Experience radio. */
    isEds: boolean;
    /** Resolved authoring experience seeding the radio (EDS only). */
    authoringExperience: AuthoringExperience;
}

export class ConfigureProjectWebviewCommand extends BaseWebviewCommand {
    /**
     * Static method to dispose any active Configure panel
     * Useful for cleanup during navigation
     */
    public static disposeActivePanel(): void {
        const panel = BaseWebviewCommand.getActivePanel('demoBuilder.configureProject');
        if (panel) {
            try {
                panel.dispose();
            } catch {
                // Panel may already be disposed - this is OK
            }
        }
    }

    protected getWebviewId(): string {
        return 'demoBuilder.configureProject';
    }

    protected getWebviewTitle(): string {
        return 'Configure Project';
    }

    protected getLoadingMessage(): string {
        return 'Loading project configuration...';
    }

    public async execute(): Promise<void> {
        try {
            // Get current project
            const project = await this.stateManager.getCurrentProject();
            if (!project) {
                await this.showWarning('No project found to configure.');
                return;
            }

            // Create or reveal the webview panel
            await this.createOrRevealPanel();

            // Initialize communication if needed
            if (!this.communicationManager) {
                await this.initializeCommunication();
            }

            this.logger.debug(`[Configure] Opened configuration for project: ${project.name}`);
        } catch (error) {
            await this.showError('Failed to open configuration', error as Error);
        }
    }

    protected async getWebviewContent(): Promise<string> {
        if (!this.panel) {
            throw new Error('Panel must be created before getting webview content');
        }
        const scriptUri = getBundleUri({
            webview: this.panel.webview,
            extensionPath: this.context.extensionPath,
            featureBundleName: 'configure',
        });

        const nonce = this.getNonce();

        // Get base URI for media assets
        const mediaPath = vscode.Uri.file(path.join(this.context.extensionPath, 'dist'));
        const baseUri = this.panel.webview.asWebviewUri(mediaPath);

        return getWebviewHTML({
            scriptUri,
            nonce,
            cspSource: this.panel.webview.cspSource,
            title: 'Configure Project',
            baseUri,
        });
    }

    protected async getInitialData(): Promise<ConfigureInitialData> {
        const project = await this.stateManager.getCurrentProject();
        if (!project) {
            throw new Error('No project found');
        }

        // Load and transform components data using ComponentRegistryManager
        const registryManager = new ComponentRegistryManager(this.context.extensionPath);
        const registry = await registryManager.loadRegistry();

        // Send both the categorized components structure AND the top-level envVars
        const componentsData = {
            frontends: registry.components.frontends,
            backends: registry.components.backends,
            dependencies: registry.components.dependencies,
            mesh: registry.components.mesh,
            integrations: registry.components.integrations,
            appBuilder: registry.components.appBuilder,
            envVars: registry.envVars || {},
        };

        // Load existing env values from component .env files
        const existingEnvValues = await this.loadExistingEnvValues(project);

        // Get existing project names for rename validation
        const allProjects = await this.stateManager.getAllProjects();
        const existingProjectNames = allProjects.map(p => p.name);

        // Get current theme
        const theme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';

        return {
            theme,
            project,
            componentsData,
            existingEnvValues,
            existingProjectNames,
            isEds: isEdsProject(project),
            authoringExperience: resolveProjectAuthoringExperience(project),
        };
    }

    protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
        // Register standard handlers from handler map (cancel, get-components-data,
        // openExternal, open-eds-settings, discover-store-structure)
        const messageTypes = getRegisteredTypes(configureHandlers);
        for (const messageType of messageTypes) {
            comm.onStreaming(messageType, async (data: unknown) => {
                const context = this.createHandlerContext();
                return dispatchHandler(configureHandlers, context, messageType, data);
            });
        }

        // save-configuration stays inline — depends on private notification/deployment
        // methods that need `this` binding (same mixed pattern as Wizard)
        comm.onStreaming('save-configuration', async (data: {
            componentConfigs: ComponentConfigs;
            newProjectName?: string;
            authoringExperience?: AuthoringExperience;
        }) => {
            try {
                let project = await this.stateManager.getCurrentProject();
                if (!project) {
                    throw new Error('No project found');
                }

                // Handle project rename if name changed
                if (data.newProjectName && data.newProjectName !== project.name) {
                    const renameResult = await handleRenameProject(this.createHandlerContext(), {
                        projectPath: project.path,
                        newName: data.newProjectName,
                    });

                    if (!renameResult.success) {
                        throw new Error(renameResult.error || 'Failed to rename project');
                    }

                    // Reload project after rename (path may have changed)
                    project = await this.stateManager.getCurrentProject();
                    if (!project) {
                        throw new Error('Project not found after rename');
                    }
                }

                // Detect if mesh configuration changed BEFORE saving
                const meshChanges = await detectMeshChanges(project, data.componentConfigs);

                // Detect if storefront configuration changed (EDS projects only)
                const storefrontChanges = detectStorefrontChanges(project, data.componentConfigs);

                // Update project state
                project.componentConfigs = data.componentConfigs;
                if (meshChanges.hasChanges) {
                    project.meshStatusSummary = 'stale';
                }
                if (storefrontChanges.hasChanges) {
                    project.edsStorefrontStatusSummary = 'stale';
                }

                // Persist the EDS authoring-experience preference (setup-time choice).
                // Capture whether it changed so we can re-apply the DA editor.path after save.
                const authoringChanged = this.applyAuthoringExperienceMetadata(project, data.authoringExperience);

                await this.stateManager.saveProject(project);

                // Push the new Author label + DA URL to an already-open dashboard
                // immediately (a fast, local postMessage — NOT a network call, so
                // it stays in the synchronous save path; the deferred DA side-
                // effects below are the slow network work). Non-fatal: a missing
                // dashboard or a postMessage failure must never block the save.
                if (authoringChanged && data.authoringExperience) {
                    try {
                        const edsDaLiveUrl = getEdsDaLiveUrl(project, data.authoringExperience, getEwCanvasBranch());
                        await ProjectDashboardWebviewCommand.sendAuthoringExperienceUpdate(
                            data.authoringExperience,
                            edsDaLiveUrl,
                        );
                    } catch (error) {
                        this.logger.warn(
                            `[Configure] Failed to push authoring-experience update to dashboard: ${(error as Error).message}`,
                        );
                    }
                }

                // Register programmatic writes BEFORE writing files
                await this.registerProgrammaticWrites(project, data.componentConfigs);

                // Regenerate .env files
                await this.regenerateEnvFiles(project, data.componentConfigs);

                // Return success immediately so the Save button resets. The
                // authoring-experience side-effects below are network-bound (DA
                // editor.path, Quick Edit vendoring, Helix code preview), so they
                // run AFTER the response behind a progress toast — the button never
                // appears to hang. All side-effects are individually non-fatal.
                const result = { success: true };

                if (authoringChanged && data.authoringExperience) {
                    const experience = data.authoringExperience;
                    const flippedProject = project;
                    setImmediate(() => {
                        void this.applyAuthoringSideEffects(flippedProject, experience);
                    });
                }

                // Show success notification after returning (non-blocking). When the
                // authoring experience changed, its own progress toast is the
                // confirmation, so suppress the generic "saved" toast to avoid a
                // double notification.
                setImmediate(() => {
                    this.showPostSaveNotifications(project, meshChanges, storefrontChanges, authoringChanged);
                });

                return result;
            } catch (error) {
                this.logger.error('[Configure] Failed to save configuration:', error as Error);
                await vscode.window.showErrorMessage(`Failed to save configuration: ${(error as Error).message}`);
                return { success: false, error: (error as Error).message, code: ErrorCode.CONFIG_INVALID };
            }
        });
    }

    /**
     * Persist the EDS authoring-experience preference onto the project's EDS
     * component-instance metadata. No-op for non-EDS projects or unrecognized
     * values. Returns whether the stored value actually changed (so the caller
     * can decide whether to re-apply the DA editor.path).
     */
    private applyAuthoringExperienceMetadata(
        project: Project,
        experience: AuthoringExperience | undefined,
    ): boolean {
        if (!experience || !AUTHORING_EXPERIENCES.has(experience) || !isEdsProject(project)) {
            return false;
        }
        const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
        if (!edsInstance) {
            return false;
        }
        const previous = edsInstance.metadata?.authoringExperience as AuthoringExperience | undefined;
        if (previous === experience) {
            return false;
        }
        edsInstance.metadata = { ...edsInstance.metadata, authoringExperience: experience };
        return true;
    }

    /**
     * Run the authoring-experience DA side-effects behind a progress toast, after
     * the save response has returned. Both steps are network-bound and already
     * non-fatal, so the toast gives the user immediate "this is working" feedback
     * without ever blocking the Save button.
     */
    private async applyAuthoringSideEffects(
        project: Project,
        experience: AuthoringExperience,
    ): Promise<void> {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Switching author mode',
                cancellable: false,
            },
            async (progress) => {
                progress.report({ message: 'Updating the DA.live editor link…' });
                await this.reapplyEditorPath(project, experience);
                if (experience === 'experience-workspace') {
                    progress.report({ message: 'Wiring Quick Edit into the storefront…' });
                    await this.ensureQuickEditVendored(project);
                    progress.report({ message: 'Updating storefront config…' });
                    await this.regenerateStorefrontConfig(project);
                }
            },
        );
    }

    /**
     * Re-apply the site-scoped DA.live editor.path so the punch-out matches the
     * new authoring experience. Moved here from the projects-list flip handler.
     * Non-fatal: logs a warning on failure and never throws (the metadata write
     * already stands).
     */
    private async reapplyEditorPath(
        project: Project,
        experience: AuthoringExperience,
    ): Promise<void> {
        const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
        const daLiveOrg = edsInstance?.metadata?.daLiveOrg as string | undefined;
        const daLiveSite = edsInstance?.metadata?.daLiveSite as string | undefined;
        if (!daLiveOrg || !daLiveSite) {
            return;
        }

        try {
            const daLiveAuthService = getDaLiveAuthService(this.context);
            const tokenProvider = createDaLiveServiceTokenProvider(daLiveAuthService);
            const daLiveContentOps = new DaLiveContentOperations(tokenProvider, this.logger);
            await applyDaLiveOrgConfigSettings(daLiveContentOps, daLiveOrg, daLiveSite, this.logger, experience);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.warn(`[Configure] editor.path re-apply failed (authoring experience still saved): ${message}`);
        }
    }

    /**
     * Vendor the Quick Edit wiring into the storefront repo so the Experience
     * Workspace Layout/WYSIWYG view has its repo-side dependency. Mirrors the
     * create/reset path's installQuickEdit call; idempotent (installQuickEdit
     * no-ops without a commit when the anchors are already transformed).
     *
     * Scope: only the VENDORED FILES (scripts.js wiring + tools/quick-edit/) are
     * handled here. The Sidekick `quick-edit` plugin (Config Service) is still
     * delivered at create/reset via config-template.json — out of scope for the
     * flip.
     *
     * Non-fatal: any failure is logged and swallowed. The save (and the
     * authoring-experience metadata write) must never fail because of this.
     */
    private async ensureQuickEditVendored(project: Project): Promise<void> {
        try {
            const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
            const githubRepo = edsInstance?.metadata?.githubRepo as string | undefined;
            if (!githubRepo) {
                return;
            }

            // githubRepo is already "owner/repo" — a simple split is sufficient.
            const [repoOwner, repoName] = githubRepo.split('/');
            if (!repoOwner || !repoName) {
                return;
            }

            const githubTokenService = new GitHubTokenService(this.context.secrets, this.logger);
            const githubFileOps = new GitHubFileOperations(githubTokenService, this.logger);
            await installQuickEdit(githubFileOps, repoOwner, repoName, this.logger);

            // Push the committed Quick Edit code live so the Experience Workspace
            // Layout (WYSIWYG) view works immediately, without a full reset. The
            // create/reset/republish paths previewCode('/*') after vendoring via
            // the surrounding pipeline; the flip has no such pipeline, so it
            // previews here. Non-fatal — covered by the outer catch.
            const daLiveTokenProvider = createDaLiveServiceTokenProvider(getDaLiveAuthService(this.context));
            const helixService = new HelixService(this.logger, githubTokenService, daLiveTokenProvider);
            await helixService.previewCode(repoOwner, repoName, '/*');
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.warn(`[Configure] Quick Edit vendoring failed (authoring experience still saved): ${message}`);
        }
    }

    /**
     * Regenerate the storefront's config.json so it includes the `quick-edit`
     * Sidekick plugin.
     *
     * The Experience Workspace canvas reads its plugins from the repo's
     * config.json (NOT the Config Service site registration) — and it's the
     * `quick-edit` plugin that dispatches the `custom:quick-edit` event the
     * storefront listener handles. A project created before this feature has a
     * config.json without that plugin, so the EW flip regenerates + syncs it.
     * config.json is generated from config-template.json, which now carries the
     * plugin, so a plain regenerate adds it.
     *
     * Non-fatal: logs a warning on failure and never throws (the metadata save
     * already stands).
     */
    private async regenerateStorefrontConfig(project: Project): Promise<void> {
        try {
            const result = await republishStorefrontConfig({
                project,
                secrets: this.context.secrets,
                logger: this.logger,
            });
            if (!result.success) {
                this.logger.warn(
                    `[Configure] config.json regeneration warning (authoring experience still saved): ${result.error}`,
                );
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.warn(
                `[Configure] config.json regeneration failed (authoring experience still saved): ${message}`,
            );
        }
    }

    /**
     * Load existing environment variable values from component .env files
     * and project root .env (for values from non-installed components like backends)
     */
    private async loadExistingEnvValues(project: Project): Promise<Record<string, Record<string, string>>> {
        const envValues: Record<string, Record<string, string>> = {};

        // Read each component's .env file
        // SOP §4: Using helper instead of inline Object.entries
        for (const [componentId, instance] of getComponentInstanceEntries(project)) {
            if (!instance.path) {
                continue;
            }

            // Next.js uses .env.local, others use .env
            const possibleEnvFiles = [
                path.join(instance.path, '.env.local'),
                path.join(instance.path, '.env'),
            ];

            let loaded = false;
            for (const envPath of possibleEnvFiles) {
                try {
                    const envContent = await fs.readFile(envPath, 'utf-8');
                    envValues[componentId] = parseEnvFile(envContent);
                    loaded = true;
                    break;  // Found it, stop looking
                } catch {
                    // File doesn't exist, try next one
                }
            }

            if (!loaded) {
                envValues[componentId] = {};
            }
        }

        // Also read project root .env for values from non-installed components
        // (e.g., backend configs like adobe-commerce-accs that don't have componentInstances).
        // Non-installed components may also store values exclusively in .demo-builder.json —
        // the merge helper handles both sources with the correct precedence.
        let rootEnvValues: Record<string, string> = {};
        try {
            const rootEnvPath = path.join(project.path, '.env');
            const rootEnvContent = await fs.readFile(rootEnvPath, 'utf-8');
            rootEnvValues = parseEnvFile(rootEnvContent);
        } catch {
            // Root .env doesn't exist or can't be read — fall through to manifest-only values.
        }

        return mergeEnvValuesFromSources(envValues, rootEnvValues, project.componentConfigs ?? {});
    }


    /**
     * Register programmatic writes to suppress file watcher notifications
     */
    private async registerProgrammaticWrites(project: Project, componentConfigs: ComponentConfigs): Promise<void> {
        const filePaths: string[] = [];
        
        // Project root .env
        filePaths.push(path.join(project.path, '.env'));

        // Component .env files
        // SOP §4: Using helper instead of inline Object.entries
        for (const [componentId, instance] of getComponentInstanceEntries(project)) {
            if (instance.path && componentConfigs[componentId]) {
                const envFileName = componentId.includes('nextjs') ? '.env.local' : '.env';
                filePaths.push(path.join(instance.path, envFileName));
            }
        }
        
        // Register all paths with file watcher (silent - internal coordination)
        await vscode.commands.executeCommand('demoBuilder._internal.registerProgrammaticWrites', filePaths);
    }

    /**
     * Regenerate .env files for project and components.
     * Merges ALL values from ALL componentConfigs for cross-boundary sharing.
     */
    private async regenerateEnvFiles(project: Project, componentConfigs: ComponentConfigs): Promise<void> {
        // Merge all values once (cross-boundary: backend values go to frontend .env files)
        // Normalize URL values (remove trailing slashes) for consistent handling
        const allValues: Record<string, string> = {};
        for (const config of Object.values(componentConfigs)) {
            for (const [key, value] of Object.entries(config)) {
                if (value !== undefined && value !== null && value !== '') {
                    allValues[key] = normalizeIfUrl(String(value));
                }
            }
        }

        // Write root .env
        const rootHeader = `# Demo Builder Project Configuration\n# Generated: ${new Date().toISOString()}\n\nPROJECT_NAME=${project.name}\n`;
        await fs.writeFile(path.join(project.path, '.env'), rootHeader + this.formatEnvValues(allValues), 'utf-8');

        // Write component .env files
        for (const [componentId, instance] of getComponentInstanceEntries(project)) {
            if (instance.path) {
                const fileName = componentId.includes('nextjs') ? '.env.local' : '.env';
                const header = `# ${componentId} - Environment Configuration\n# Generated by Demo Builder\n# Generated: ${new Date().toISOString()}\n`;
                await fs.writeFile(path.join(instance.path, fileName), header + this.formatEnvValues(allValues), 'utf-8');
            }
        }

        this.logger.debug(`[Configure] Wrote ${Object.keys(allValues).length} env vars to ${Object.keys(project.componentInstances || {}).length + 1} files`);
    }

    private formatEnvValues(values: Record<string, string>): string {
        return Object.entries(values)
            .filter(([k]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) // skip invalid keys
            .map(([k, v]) => {
                // Quote values containing newlines, spaces, or special characters
                const needsQuoting = /[\n\r\s"'\\#]/.test(v);
                const safeValue = needsQuoting
                    ? `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`
                    : v;
                return `${k}=${safeValue}`;
            })
            .join('\n');
    }

    /**
     * Run an operation while notifying the frontend that deployment is in progress.
     * This keeps the Save button disabled during the operation.
     */
    private async withDeploymentStatus<T>(operation: () => Promise<T>): Promise<T> {
        await this.communicationManager?.sendMessage('deployment-status', { isDeploying: true });
        try {
            return await operation();
        } finally {
            await this.communicationManager?.sendMessage('deployment-status', { isDeploying: false });
        }
    }

    /**
     * Republish storefront config.json for EDS projects.
     * Shows progress notification and handles errors.
     */
    private async republishStorefront(project: Project): Promise<void> {
        try {
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Republishing storefront',
                    cancellable: false,
                },
                async (progress) => {
                    const result = await republishStorefrontConfig({
                        project,
                        secrets: this.context.secrets,
                        logger: this.logger,
                        onProgress: (message) => {
                            progress.report({ message });
                        },
                    });

                    if (result.success) {
                        // Save updated project state
                        await this.stateManager.saveProject(project);
                        await ProjectDashboardWebviewCommand.refreshStatus();
                        // Reset the once-per-session storefront notification flag so the
                        // NEXT storefront config change re-prompts to republish. Mirrors
                        // the mesh flow (deployMesh -> meshActionTaken) and restart flow
                        // (startDemo -> restartActionTaken). Without this, the flag stays
                        // latched after the first republish and later changes (e.g.
                        // switching store views back) silently show "Configuration saved"
                        // while the live storefront stays stale.
                        await vscode.commands.executeCommand('demoBuilder._internal.storefrontActionTaken');
                        this.showSuccessMessage('Storefront configuration republished successfully');
                    } else {
                        vscode.window.showErrorMessage(`Failed to republish storefront: ${result.error}`);
                    }
                },
            );
        } catch (error) {
            this.logger.error('[Configure] Failed to republish storefront:', error as Error);
            vscode.window.showErrorMessage(`Failed to republish storefront: ${(error as Error).message}`);
        }
    }

    /**
     * Show post-save notifications based on what changed.
     * Determines the right notification scenario and delegates to specific handlers.
     */
    private async showPostSaveNotifications(
        project: Project,
        meshChanges: { hasChanges: boolean },
        storefrontChanges: { hasChanges: boolean },
        authoringChanged = false,
    ): Promise<void> {
        await ProjectDashboardWebviewCommand.refreshStatus();

        let contextualNotificationShown = false;
        const isEds = isEdsProject(project);

        if (meshChanges.hasChanges && storefrontChanges.hasChanges && isEds) {
            contextualNotificationShown = await this.handleCombinedMeshStorefrontNotification(project);
        } else if (storefrontChanges.hasChanges && isEds) {
            contextualNotificationShown = await this.handleStorefrontOnlyNotification(project);
        } else if (meshChanges.hasChanges) {
            contextualNotificationShown = await this.handleMeshOnlyNotification(project);
        } else if (project.status === 'running') {
            contextualNotificationShown = await this.handleRestartNotification();
        }

        // An authoring-experience change shows its own progress toast (the
        // confirmation), so skip the generic "saved" toast to avoid doubling up.
        if (!contextualNotificationShown && !authoringChanged) {
            this.showSuccessMessage('Configuration saved successfully');
        }
    }

    /** Handle notification when both mesh and storefront changed */
    private async handleCombinedMeshStorefrontNotification(project: Project): Promise<boolean> {
        const shouldShowMesh = await vscode.commands.executeCommand('demoBuilder._internal.shouldShowMeshNotification');
        const shouldShowStorefront = await vscode.commands.executeCommand('demoBuilder._internal.shouldShowStorefrontNotification');

        if (!shouldShowMesh && !shouldShowStorefront) {
            this.logger.debug('[Configure] Combined notification already shown this session, suppressing');
            return false;
        }

        await vscode.commands.executeCommand('demoBuilder._internal.markMeshNotificationShown');
        await vscode.commands.executeCommand('demoBuilder._internal.markStorefrontNotificationShown');

        const selection = await vscode.window.showWarningMessage(
            'Configuration saved. Apply changes to mesh and storefront?',
            'Apply Changes',
            'Later',
        );

        if (selection === 'Apply Changes') {
            await this.ensureAuthAndApply(
                () => this.withDeploymentStatus(async () => {
                    await vscode.commands.executeCommand('demoBuilder.deployMesh');
                    const freshProject = await this.stateManager.getCurrentProject();
                    if (freshProject) {
                        await this.republishStorefront(freshProject);
                    }
                }),
                'apply changes to mesh and storefront',
            );
        } else if (selection === 'Later') {
            if (project.meshState) {
                project.meshState.userDeclinedUpdate = true;
                project.meshState.declinedAt = new Date().toISOString();
            }
            if (project.edsStorefrontState) {
                project.edsStorefrontState.userDeclinedUpdate = true;
                project.edsStorefrontState.declinedAt = new Date().toISOString();
                project.edsStorefrontStatusSummary = 'update-declined';
            }
            await this.stateManager.saveProject(project);
            await ProjectDashboardWebviewCommand.refreshStatus();
        }

        return true;
    }

    /** Handle notification when only storefront changed */
    private async handleStorefrontOnlyNotification(project: Project): Promise<boolean> {
        const shouldShow = await vscode.commands.executeCommand('demoBuilder._internal.shouldShowStorefrontNotification');
        if (!shouldShow) {
            this.logger.debug('[Configure] Storefront notification already shown this session, suppressing');
            return false;
        }

        await vscode.commands.executeCommand('demoBuilder._internal.markStorefrontNotificationShown');

        const selection = await vscode.window.showInformationMessage(
            'Configuration saved. Republish storefront to apply changes.',
            'Republish',
            'Later',
        );

        if (selection === 'Republish') {
            await this.withDeploymentStatus(() => this.republishStorefront(project));
        } else if (selection === 'Later') {
            if (project.edsStorefrontState) {
                project.edsStorefrontState.userDeclinedUpdate = true;
                project.edsStorefrontState.declinedAt = new Date().toISOString();
            }
            project.edsStorefrontStatusSummary = 'update-declined';
            await this.stateManager.saveProject(project);
            await ProjectDashboardWebviewCommand.refreshStatus();
        }

        return true;
    }

    /** Handle notification when mesh changed (with or without running demo) */
    private async handleMeshOnlyNotification(project: Project): Promise<boolean> {
        const shouldShow = await vscode.commands.executeCommand('demoBuilder._internal.shouldShowMeshNotification');
        if (!shouldShow) {
            this.logger.debug('[Configure] Mesh notification already shown this session, suppressing');
            return false;
        }

        await vscode.commands.executeCommand('demoBuilder._internal.markMeshNotificationShown');

        const isRunning = project.status === 'running';
        const message = isRunning
            ? 'Configuration saved. Redeploy mesh and restart demo to apply changes.'
            : 'Configuration saved. Redeploy mesh to apply changes.';

        const selection = await (isRunning
            ? vscode.window.showWarningMessage(message, 'Redeploy Mesh', 'Later')
            : vscode.window.showInformationMessage(message, 'Redeploy Mesh', 'Later'));

        if (selection === 'Redeploy Mesh') {
            await this.ensureAuthAndApply(
                () => this.withDeploymentStatus(async () => { await vscode.commands.executeCommand('demoBuilder.deployMesh'); }),
                'redeploy mesh',
            );
        } else if (selection === 'Later') {
            if (project.meshState) {
                project.meshState.userDeclinedUpdate = true;
                project.meshState.declinedAt = new Date().toISOString();
                await this.stateManager.saveProject(project);
                await ProjectDashboardWebviewCommand.refreshStatus();
            }
        }

        return true;
    }

    /** Handle notification when only non-mesh configs changed and demo is running */
    private async handleRestartNotification(): Promise<boolean> {
        const shouldShow = await vscode.commands.executeCommand('demoBuilder._internal.shouldShowRestartNotification');
        if (!shouldShow) {
            this.logger.debug('[Configure] Restart notification already shown this session, suppressing');
            return false;
        }

        await vscode.commands.executeCommand('demoBuilder._internal.markRestartNotificationShown');

        const selection = await vscode.window.showInformationMessage(
            'Configuration saved. Restart the demo to apply changes.',
            'Restart Demo',
        );

        if (selection === 'Restart Demo') {
            try {
                await vscode.commands.executeCommand('demoBuilder.stopDemo');
                await vscode.commands.executeCommand('demoBuilder.startDemo');
            } catch (error) {
                this.logger.error('[Configure] Failed to restart demo:', error as Error);
            }
        }

        return true;
    }

    /**
     * Create handler context for message handlers
     */
    private createHandlerContext(): HandlerContext {
        return {
            // Managers (Configure doesn't use all managers, but context requires them)
            prereqManager: undefined as unknown as HandlerContext['prereqManager'],
            authManager: ServiceLocator.getAuthenticationService(),
            errorLogger: undefined as unknown as HandlerContext['errorLogger'],
            progressUnifier: undefined as unknown as HandlerContext['progressUnifier'],
            stepLogger: undefined as unknown as HandlerContext['stepLogger'],

            // Loggers
            logger: this.logger,
            debugLogger: this.logger,

            // VS Code integration
            context: this.context,
            panel: this.panel,
            stateManager: this.stateManager,
            communicationManager: this.communicationManager,
            sendMessage: (type: string, data?: unknown) => this.sendMessage(type, data),

            // Shared state (Configure doesn't use shared state)
            sharedState: {
                isAuthenticating: false,
            } as SharedState,
        };
    }

    /**
     * Ensure Adobe authentication before applying changes.
     * If not authenticated, prompts the user to sign in inline and restores project context.
     * After successful sign-in, continues with the provided operation.
     *
     * @param operation - The async operation to run after auth is confirmed
     * @param operationDescription - Description for the notification (e.g., "deploy mesh")
     * @returns true if operation completed, false if cancelled or auth failed
     */
    private async ensureAuthAndApply(
        operation: () => Promise<void>,
        operationDescription: string,
    ): Promise<boolean> {
        const authManager = ServiceLocator.getAuthenticationService();
        const project = await this.stateManager.getCurrentProject();

        const { ensureAdobeIOAuth } = await import('@/core/auth/adobeAuthGuard');
        const authResult = await ensureAdobeIOAuth({
            authManager,
            logger: this.logger,
            logPrefix: '[Configure]',
            projectContext: {
                organization: project?.adobe?.organization,
                projectId: project?.adobe?.projectId,
                workspace: project?.adobe?.workspace,
            },
            warningMessage: `Adobe sign-in required to ${operationDescription}.`,
        });

        if (!authResult.authenticated) {
            if (!authResult.cancelled) {
                vscode.window.showErrorMessage('Sign-in failed or was cancelled. Please try again.');
            }
            return false;
        }

        // Auth confirmed, run the operation
        try {
            await operation();
            return true;
        } catch (error) {
            this.logger.error(`[Configure] Failed to ${operationDescription}:`, error as Error);
            return false;
        }
    }
}
