import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import {
    loadAppBuilderComponentSecretFlags,
    persistAppBuilderComponentSecrets,
    splitAppBuilderComponentSecrets,
} from '../handlers/appBuilderComponentSecrets';
import { configureHandlers } from '../handlers/configureHandlers';
import { mergeEnvValuesFromSources } from './configureEnvLoader';
import { ProjectDashboardWebviewCommand } from './showDashboard';
import { createPanelHandlerContext } from '@/commands/handlerContextFactory';
import { BaseWebviewCommand } from '@/core/base';
import { WebviewCommunicationManager } from '@/core/communication';
import { COMPONENT_IDS } from '@/core/constants';
import { ServiceLocator } from '@/core/di';
import { dispatchHandler, getRegisteredTypes } from '@/core/handlers';
import { buildOrgTargetFromProjectAdobe, withOrgContext } from '@/core/shell';
import { getBundleUri } from '@/core/utils/bundleUri';
import { parseEnvFile } from '@/core/utils/envParser';
import { getWebviewHTML } from '@/core/utils/getWebviewHTMLWithBundles';
import { getProvidedEnvVars } from '@/features/app-builder/services/appBuilderComponentState';
import {
    loadDeclaredSecretFlags,
    migrateDeclaredSecrets,
    reKeyProjectSecrets,
} from '@/features/components/services/commerceSecretMigration';
import { ComponentRegistryManager } from '@/features/components/services/ComponentRegistryManager';
import { withEnvVarKeys } from '@/features/components/services/componentTransforms';
import { detectStorefrontChanges, isEdsProject, republishStorefrontConfig } from '@/features/eds';
import {
    getEwCanvasBranch,
    resolveProjectAuthoringExperience,
} from '@/features/eds/handlers/edsHelpers';
import { applyAuthoringExperienceFlip } from '@/features/eds/services/authoringExperienceFlip';
import { markMeshUpdateDeclined } from '@/features/mesh/services/meshUpdateDecline';
import { detectMeshChanges } from '@/features/mesh/services/stalenessDetector';
import { regenerateProjectEnvFiles } from '@/features/project-creation/helpers';
import { getAvailableAppBuilderComponents } from '@/features/project-creation/services/appBuilderComponentCatalogLoader';
import { handleRenameProject } from '@/features/projects-dashboard/handlers/dashboardHandlers';
import { Project } from '@/types';
import type { AuthoringExperience } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext } from '@/types/handlers';
import { getComponentInstanceEntries, getEdsDaLiveUrl } from '@/types/typeGuards';
import type { ConfigureInitialData } from '@/types/webviewPayloads';

const AUTHORING_EXPERIENCES: ReadonlySet<AuthoringExperience> = new Set<AuthoringExperience>([
    'da-live-classic',
    'experience-workspace',
]);

// Component configuration type (key-value pairs for environment variables)
type ComponentConfigs = Record<string, Record<string, string>>;

export class ConfigureProjectWebviewCommand extends BaseWebviewCommand<ConfigureInitialData> {
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

    /** Project name captured in execute() so the loading screen can show it. */
    private loadingProjectName?: string;

    protected getLoadingHeader(): { title: string; subtitle?: string } {
        return { title: this.getWebviewTitle(), subtitle: this.loadingProjectName };
    }

    public async execute(): Promise<void> {
        try {
            // Get current project
            const project = await this.stateManager.getCurrentProject();
            if (!project) {
                await this.showWarning('No project found to configure.');
                return;
            }
            this.loadingProjectName = project.name;

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
            envVars: withEnvVarKeys(registry.envVars),
        };

        // Load existing env values from component .env files
        const existingEnvValues = await this.loadExistingEnvValues(project);

        // Get existing project names for rename validation
        const allProjects = await this.stateManager.getAllProjects();
        const existingProjectNames = allProjects.map((p) => p.name);

        // Get current theme
        const theme =
            vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';

        // AppBuilderComponent bucket-3/bucket-2 surface: the catalog for the project's
        // selection, the provided ("connected") values, and the "is set" flags
        // for secrets (booleans only — secret VALUES never travel to the webview).
        const appBuilderComponentCatalog = getAvailableAppBuilderComponents(
            project.componentSelections?.backend ?? '',
            project.componentSelections?.frontend ?? '',
        );
        const providedEnvVars = getProvidedEnvVars(project);
        const appBuilderComponentSecretFlags = await loadAppBuilderComponentSecretFlags(
            appBuilderComponentCatalog,
            project.path,
            this.context.secrets,
        );
        // The same signal for COMPONENT-declared secrets. The webview cannot read
        // the keychain, and two things there depend on knowing a value exists: the
        // store-discovery trigger, and the password field, which would otherwise
        // render empty and let a blank be saved over a good credential.
        const componentSecretFlags = await loadDeclaredSecretFlags(
            Object.keys(project.componentConfigs ?? {}),
            project.path,
            this.context.secrets,
        );

        return {
            theme,
            project,
            componentsData,
            existingEnvValues,
            existingProjectNames,
            isEds: isEdsProject(project),
            authoringExperience: resolveProjectAuthoringExperience(project),
            appBuilderComponentCatalog,
            providedEnvVars,
            appBuilderComponentSecretFlags,
            componentSecretFlags,
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
        comm.onStreaming(
            'save-configuration',
            async (data: {
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
                    const pathBeforeRename = project.path;
                    if (data.newProjectName && data.newProjectName !== project.name) {
                        const renameResult = await handleRenameProject(
                            this.createHandlerContext(),
                            {
                                projectPath: project.path,
                                newName: data.newProjectName,
                            },
                        );

                        if (!renameResult.success) {
                            throw new Error(renameResult.error || 'Failed to rename project');
                        }

                        // Reload project after rename (path may have changed)
                        project = await this.stateManager.getCurrentProject();
                        if (!project) {
                            throw new Error('Project not found after rename');
                        }

                        // The SecretStorage key is keyed on the project PATH, so a
                        // rename orphans it. Follow the path before anything reads a
                        // credential: an already-migrated secret is no longer in
                        // componentConfigs, so a missed re-key loses it from both
                        // places and the Configure field simply reads blank.
                        await reKeyProjectSecrets(
                            pathBeforeRename,
                            project.path,
                            Object.keys(project.componentConfigs ?? {}),
                            this.context.secrets,
                            (line) => this.logger.info(`[Configure] ${line}`),
                        );
                    }

                    // SECRET SAFETY (repo is PUBLIC): split appBuilderComponent `type:'secret'`
                    // values out of componentConfigs → VS Code SecretStorage BEFORE any
                    // detection/persistence/.env work. The sanitized configs (no secrets)
                    // are what every downstream path sees; secrets never reach the
                    // manifest, the .env file, or the change-detectors.
                    const appBuilderComponentCatalog = getAvailableAppBuilderComponents(
                        project.componentSelections?.backend ?? '',
                        project.componentSelections?.frontend ?? '',
                    );
                    const split = splitAppBuilderComponentSecrets(
                        data.componentConfigs,
                        appBuilderComponentCatalog,
                    );
                    // Values are all strings here (the Configure payload is text/secret
                    // strings); the split only deletes secret keys, so the narrow local
                    // ComponentConfigs shape is preserved.
                    const appBuilderSanitized = split.sanitizedConfigs as ComponentConfigs;
                    await persistAppBuilderComponentSecrets(
                        split.secrets,
                        project.path,
                        this.context.secrets,
                        this.logger,
                    );

                    // Same guarantee for COMPONENT-declared secrets (`secret: true` in
                    // components.json) — the Commerce credentials. Write-through with a
                    // verified read-back: a value only leaves componentConfigs once
                    // SecretStorage is proven to hold it, so it is never in neither place
                    // (`.rptc/complete/component-secret-routing/`, phase 2).
                    const migration = await migrateDeclaredSecrets(
                        appBuilderSanitized,
                        project.path,
                        this.context.secrets,
                        (line) => this.logger.info(`[Configure] ${line}`),
                    );
                    if (migration.retained.length > 0) {
                        // Not fatal, and not silent: the save proceeds with the value
                        // exactly where it was, and the next one tries again.
                        this.logger.warn(
                            `[Configure] ${migration.retained.length} secret(s) could not be ` +
                                `moved to SecretStorage and remain in project config: ` +
                                `${migration.retained.join(', ')}`,
                        );
                    }
                    const sanitizedConfigs = migration.sanitizedConfigs as ComponentConfigs;

                    // Detect if mesh configuration changed BEFORE saving.
                    // Org-targeted: with an empty staleness baseline this fetches
                    // the deployed config over the `aio` CLI, and an unwrapped call
                    // queries whatever org the CLI's process-global selection
                    // happens to hold.
                    const meshChanges = await withOrgContext(
                        buildOrgTargetFromProjectAdobe(project.adobe),
                        () => detectMeshChanges(project, sanitizedConfigs),
                    );

                    // Detect if storefront configuration changed (EDS projects only)
                    const storefrontChanges = detectStorefrontChanges(project, sanitizedConfigs);

                    // Update project state
                    project.componentConfigs = sanitizedConfigs;
                    if (meshChanges.hasChanges) {
                        project.meshStatusSummary = 'stale';
                    }
                    if (storefrontChanges.hasChanges) {
                        project.edsStorefrontStatusSummary = 'stale';
                    }

                    // Re-arm the apply prompts for THIS change. Without it, a
                    // single earlier "Later" muted them for the whole session:
                    // the handlers below saw `shouldShow === false`, returned
                    // before prompting, and the save reported success while the
                    // storefront kept serving the previous config.
                    if (meshChanges.hasChanges || storefrontChanges.hasChanges) {
                        await vscode.commands.executeCommand('demoBuilder._internal.configChanged');
                    }

                    // Persist the EDS authoring-experience preference (setup-time choice).
                    // Capture whether it changed so we can re-apply the DA editor.path after save.
                    const authoringChanged = this.applyAuthoringExperienceMetadata(
                        project,
                        data.authoringExperience,
                    );

                    await this.stateManager.saveProject(project);

                    // Push the new Author label + DA URL to an already-open dashboard
                    // immediately (a fast, local postMessage — NOT a network call, so
                    // it stays in the synchronous save path; the deferred DA side-
                    // effects below are the slow network work). Non-fatal: a missing
                    // dashboard or a postMessage failure must never block the save.
                    if (authoringChanged && data.authoringExperience) {
                        try {
                            const edsDaLiveUrl = getEdsDaLiveUrl(
                                project,
                                data.authoringExperience,
                                getEwCanvasBranch(),
                            );
                            await ProjectDashboardWebviewCommand.sendAuthoringExperienceUpdate(
                                edsDaLiveUrl,
                            );
                        } catch (error) {
                            this.logger.warn(
                                `[Configure] Failed to push authoring-experience update to dashboard: ${(error as Error).message}`,
                            );
                        }
                    }

                    // Register programmatic writes BEFORE writing files
                    await this.registerProgrammaticWrites(project, sanitizedConfigs);

                    // Regenerate .env files
                    await this.regenerateEnvFiles(project);

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
                        this.showPostSaveNotifications(
                            project,
                            meshChanges,
                            storefrontChanges,
                            authoringChanged,
                        );
                    });

                    return result;
                } catch (error) {
                    this.logger.error('[Configure] Failed to save configuration:', error as Error);
                    await vscode.window.showErrorMessage(
                        `Failed to save configuration: ${(error as Error).message}`,
                    );
                    return {
                        success: false,
                        error: (error as Error).message,
                        code: ErrorCode.CONFIG_INVALID,
                    };
                }
            },
        );
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
        const previous = edsInstance.metadata?.authoringExperience as
            | AuthoringExperience
            | undefined;
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
                // Narrate the steps the shared flip runs (editor.path always;
                // Quick Edit + config.json regen are Experience-Workspace-only).
                // The shared service performs the ordering internally.
                progress.report({ message: 'Updating the DA.live editor link…' });
                if (experience === 'experience-workspace') {
                    progress.report({ message: 'Wiring Quick Edit into the storefront…' });
                }
                await applyAuthoringExperienceFlip(project, experience, {
                    context: this.context,
                    logger: this.logger,
                    saveProject: (p) => this.stateManager.saveProject(p),
                });
            },
        );
    }

    /**
     * Load existing environment variable values from component .env files
     * and project root .env (for values from non-installed components like backends)
     */
    private async loadExistingEnvValues(
        project: Project,
    ): Promise<Record<string, Record<string, string>>> {
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
                    break; // Found it, stop looking
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
    private async registerProgrammaticWrites(
        project: Project,
        componentConfigs: ComponentConfigs,
    ): Promise<void> {
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
        await vscode.commands.executeCommand(
            'demoBuilder._internal.registerProgrammaticWrites',
            filePaths,
        );
    }

    /**
     * Regenerate .env files for the project's installed components.
     *
     * Delegates to the canonical regenerateProjectEnvFiles helper — the same
     * registry-driven path used at creation and by EDS Reset — so Configure-saved
     * .env files match creation exactly (derived values, grouping, per-component
     * resolution) instead of a hand-rolled flat dump. Reads componentConfigs from
     * the (already-updated) project; the root .env is written by ProjectConfigWriter
     * on saveProject.
     */
    private async regenerateEnvFiles(project: Project): Promise<void> {
        const registryManager = new ComponentRegistryManager(this.context.extensionPath);
        const registry = await registryManager.loadRegistry();
        await regenerateProjectEnvFiles(project, registry, this.logger);
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
            await this.communicationManager?.sendMessage('deployment-status', {
                isDeploying: false,
            });
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
                        persist: (p) => this.stateManager.saveProject(p),
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
                        await vscode.commands.executeCommand(
                            'demoBuilder._internal.storefrontActionTaken',
                        );
                        this.showSuccessMessage(
                            'Storefront configuration republished successfully',
                        );
                    } else {
                        vscode.window.showErrorMessage(
                            `Failed to republish storefront: ${result.error}`,
                        );
                    }
                },
            );
        } catch (error) {
            this.logger.error('[Configure] Failed to republish storefront:', error as Error);
            vscode.window.showErrorMessage(
                `Failed to republish storefront: ${(error as Error).message}`,
            );
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
            contextualNotificationShown =
                await this.handleCombinedMeshStorefrontNotification(project);
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
        const shouldShowMesh = await vscode.commands.executeCommand(
            'demoBuilder._internal.shouldShowMeshNotification',
        );
        const shouldShowStorefront = await vscode.commands.executeCommand(
            'demoBuilder._internal.shouldShowStorefrontNotification',
        );

        if (!shouldShowMesh && !shouldShowStorefront) {
            this.logger.debug(
                '[Configure] Combined notification already shown this session, suppressing',
            );
            return false;
        }

        await vscode.commands.executeCommand('demoBuilder._internal.markMeshNotificationShown');
        await vscode.commands.executeCommand(
            'demoBuilder._internal.markStorefrontNotificationShown',
        );

        const selection = await vscode.window.showWarningMessage(
            'Configuration saved. Apply changes to mesh and storefront?',
            'Apply Changes',
            'Later',
        );

        if (selection === 'Apply Changes') {
            await this.ensureAuthAndApply(
                () =>
                    this.withDeploymentStatus(async () => {
                        await vscode.commands.executeCommand('demoBuilder.deployMesh');
                        const freshProject = await this.stateManager.getCurrentProject();
                        if (freshProject) {
                            await this.republishStorefront(freshProject);
                        }
                    }),
                'apply changes to mesh and storefront',
            );
        } else if (selection === 'Later') {
            // Keyed-only write (ADR-011 D3 Step 07): the decline lands on the keyed mesh entry.
            markMeshUpdateDeclined(project);
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
        const shouldShow = await vscode.commands.executeCommand(
            'demoBuilder._internal.shouldShowStorefrontNotification',
        );
        if (!shouldShow) {
            this.logger.debug(
                '[Configure] Storefront notification already shown this session, suppressing',
            );
            return false;
        }

        await vscode.commands.executeCommand(
            'demoBuilder._internal.markStorefrontNotificationShown',
        );

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
        const shouldShow = await vscode.commands.executeCommand(
            'demoBuilder._internal.shouldShowMeshNotification',
        );
        if (!shouldShow) {
            this.logger.debug(
                '[Configure] Mesh notification already shown this session, suppressing',
            );
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
                () =>
                    this.withDeploymentStatus(async () => {
                        await vscode.commands.executeCommand('demoBuilder.deployMesh');
                    }),
                'redeploy mesh',
            );
        } else if (selection === 'Later') {
            // Keyed-only write (ADR-011 D3 Step 07): the decline lands on the keyed mesh entry.
            if (markMeshUpdateDeclined(project)) {
                await this.stateManager.saveProject(project);
                await ProjectDashboardWebviewCommand.refreshStatus();
            }
        }

        return true;
    }

    /** Handle notification when only non-mesh configs changed and demo is running */
    private async handleRestartNotification(): Promise<boolean> {
        const shouldShow = await vscode.commands.executeCommand(
            'demoBuilder._internal.shouldShowRestartNotification',
        );
        if (!shouldShow) {
            this.logger.debug(
                '[Configure] Restart notification already shown this session, suppressing',
            );
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
                vscode.window.showErrorMessage(
                    'Sign-in failed or was cancelled. Please try again.',
                );
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
