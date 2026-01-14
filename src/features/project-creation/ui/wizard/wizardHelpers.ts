/**
 * Helper functions for WizardContainer component (SOP §3, §4 compliance)
 */

import { hasMeshInDependencies } from '@/core/constants';
import type { DemoPackage, GitSource } from '@/types/demoPackages';
import type { WizardStep, WizardState, WizardMode, ComponentSelection } from '@/types/webview';

/**
 * Step configuration for wizard navigation
 */
export interface WizardStepConfig {
    id: WizardStep;
    name: string;
    description?: string;
}

/**
 * Extended step configuration with optional component requirements.
 * Used for loading wizard-steps.json which may include requiredComponents.
 */
export interface WizardStepConfigWithRequirements {
    id: string;
    name: string;
    description?: string;
    enabled: boolean;
    /** Optional: Component IDs that must ALL be selected for this step to appear (AND logic) */
    requiredComponents?: string[];
    /** Optional: Component IDs where ANY selection makes this step appear (OR logic) */
    requiredAny?: string[];
    /** Optional: Condition for stack-based filtering */
    condition?: {
        /** Stack property that must be truthy for this step to be shown */
        stackRequires?: 'requiresGitHub' | 'requiresDaLive';
        /** If true, this step is only shown when NO predefined stack is selected */
        showWhenNoStack?: boolean;
    };
}

// ============================================================================
// Component-Specific Step Filtering
// ============================================================================

/**
 * Check if a specific component is selected in the component selection state.
 *
 * Searches across all component categories: frontend, backend, dependencies,
 * integrations, and appBuilder.
 *
 * @param componentId - The component ID to check
 * @param selectedComponents - Current component selection state
 * @returns true if component is selected, false otherwise
 */
export function isComponentSelected(
    componentId: string,
    selectedComponents: ComponentSelection | undefined,
): boolean {
    if (!selectedComponents) return false;

    // Check string fields (frontend, backend)
    if (selectedComponents.frontend === componentId) return true;
    if (selectedComponents.backend === componentId) return true;

    // Check array fields (dependencies, integrations, appBuilder)
    if (selectedComponents.dependencies?.includes(componentId)) return true;
    if (selectedComponents.integrations?.includes(componentId)) return true;
    if (selectedComponents.appBuilder?.includes(componentId)) return true;

    return false;
}

/**
 * Filter wizard steps based on component selection.
 *
 * Steps without requiredComponents always pass (backward compatible).
 * Steps with requiredComponents pass only if ALL required components are selected.
 *
 * @param allSteps - All configured wizard steps with requirements
 * @param selectedComponents - Currently selected components
 * @returns Filtered steps that should be displayed
 */
export function filterStepsByComponents(
    allSteps: WizardStepConfigWithRequirements[],
    selectedComponents: ComponentSelection | undefined,
): Array<{ id: WizardStep; name: string; description?: string }> {
    return allSteps
        .filter(step => {
            // Disabled steps never shown
            if (!step.enabled) return false;

            // requiredComponents: ALL must be selected (AND logic)
            if (step.requiredComponents && step.requiredComponents.length > 0) {
                return step.requiredComponents.every(componentId =>
                    isComponentSelected(componentId, selectedComponents),
                );
            }

            // requiredAny: ANY must be selected (OR logic)
            if (step.requiredAny && step.requiredAny.length > 0) {
                return step.requiredAny.some(componentId =>
                    isComponentSelected(componentId, selectedComponents),
                );
            }

            // No requirements = always shown (backward compatible)
            return true;
        })
        .map(step => ({
            id: step.id as WizardStep,
            name: step.name,
            description: step.description,
        }));
}

/**
 * Determine navigation direction based on target and current indices.
 *
 * @returns 'forward' when navigating to a later step, 'backward' otherwise
 */
export function getNavigationDirection(
    targetIndex: number,
    currentIndex: number,
): 'forward' | 'backward' {
    return targetIndex > currentIndex ? 'forward' : 'backward';
}

/**
 * Filter completed steps when navigating backward.
 *
 * When navigating backward, we need to remove:
 * - The target step itself
 * - All steps that come after the target step
 *
 * Special case: Going to first step (index 0) clears ALL completions.
 *
 * @param completedSteps - Current completed steps
 * @param targetStep - The step we're navigating to
 * @param targetIndex - Index of target step
 * @param wizardSteps - All wizard steps configuration
 * @returns Filtered array of completed steps
 */
export function filterCompletedStepsForBackwardNav(
    completedSteps: WizardStep[],
    targetStep: WizardStep,
    targetIndex: number,
    wizardSteps: WizardStepConfig[],
): WizardStep[] {
    // Special case: first step clears everything
    if (targetIndex === 0) {
        return [];
    }

    return completedSteps.filter(completedStep => {
        // Always remove the target step
        if (completedStep === targetStep) {
            return false;
        }

        // Keep only steps that come before the target
        const stepIndex = wizardSteps.findIndex(ws => ws.id === completedStep);
        return stepIndex < targetIndex;
    });
}

/**
 * Find step indices for Adobe selection steps.
 *
 * Used to determine which state needs to be cleared during backward navigation.
 */
export interface AdobeStepIndices {
    workspaceIndex: number;
    projectIndex: number;
}

/**
 * Get indices of Adobe selection steps in the wizard.
 */
export function getAdobeStepIndices(wizardSteps: WizardStepConfig[]): AdobeStepIndices {
    return {
        workspaceIndex: wizardSteps.findIndex(s => s.id === 'adobe-workspace'),
        projectIndex: wizardSteps.findIndex(s => s.id === 'adobe-project'),
    };
}

/**
 * Compute state updates needed when navigating backward.
 *
 * Clears Adobe selections and caches when navigating before their respective steps.
 * This maintains state consistency - if user goes back before project selection,
 * both project AND workspace selections should be cleared.
 *
 * @param currentState - Current wizard state
 * @param targetStep - Step we're navigating to
 * @param targetIndex - Index of target step
 * @param indices - Adobe step indices
 * @returns Partial state updates to apply
 */
export function computeStateUpdatesForBackwardNav(
    currentState: WizardState,
    targetStep: WizardStep,
    targetIndex: number,
    indices: AdobeStepIndices,
): Partial<WizardState> {
    const updates: Partial<WizardState> = {
        currentStep: targetStep,
    };

    // Clear workspace and its cache when going before workspace step
    if (indices.workspaceIndex !== -1 && targetIndex < indices.workspaceIndex) {
        updates.adobeWorkspace = undefined;
        updates.workspacesCache = undefined;
    }

    // Clear project and its cache (plus dependent caches) when going before project step
    if (indices.projectIndex !== -1 && targetIndex < indices.projectIndex) {
        updates.adobeProject = undefined;
        updates.projectsCache = undefined;
        // Also clear workspace since workspaces are project-specific
        updates.adobeWorkspace = undefined;
        updates.workspacesCache = undefined;
    }

    return updates;
}

// ============================================================================
// State Initialization Helpers
// ============================================================================

/**
 * Imported settings shape for wizard pre-population
 */
export interface ImportedSettings {
    source?: {
        project?: string;
    };
    selections?: {
        frontend?: string;
        backend?: string;
        dependencies?: string[];
        integrations?: string[];
        appBuilder?: string[];
    };
    configs?: Record<string, Record<string, string | boolean | number | undefined>>;
    adobe?: {
        orgId?: string;
        orgName?: string;
        projectId?: string;
        projectName?: string;
        projectTitle?: string;
        workspaceId?: string;
        workspaceName?: string;
        workspaceTitle?: string;
    };
    /** Package ID from the source project (e.g., 'citisignal', 'buildright') */
    selectedPackage?: string;
    /** Stack ID from the source project (e.g., 'headless-paas') */
    selectedStack?: string;
    /** Selected optional addons (e.g., ['demo-inspector']) */
    selectedAddons?: string[];
}

/**
 * Configuration for editing an existing project
 */
export interface EditProjectConfig {
    projectName: string;
    projectPath: string;
    settings: ImportedSettings;
}

/**
 * Build initial component selection from imported settings or defaults.
 *
 * @param importedSettings - Settings from import/copy operation
 * @param componentDefaults - Default component selection
 * @returns Component selection or undefined
 */
export function initializeComponentsFromImport(
    importedSettings: ImportedSettings | null | undefined,
    componentDefaults: ComponentSelection | undefined,
): ComponentSelection | undefined {
    if (importedSettings?.selections) {
        return {
            frontend: importedSettings.selections.frontend,
            backend: importedSettings.selections.backend,
            dependencies: importedSettings.selections.dependencies || [],
            integrations: importedSettings.selections.integrations || [],
            appBuilder: importedSettings.selections.appBuilder || [],
        };
    }
    return componentDefaults || undefined;
}

/**
 * Adobe context initialization result
 */
export interface InitialAdobeContext {
    org?: { id: string; code: string; name: string };
    project?: { id: string; name: string; title?: string };
    workspace?: { id: string; name: string; title?: string };
}

/**
 * Build initial Adobe context from imported settings.
 *
 * @param importedSettings - Settings from import/copy operation
 * @returns Adobe context with org, project, and workspace
 */
export function initializeAdobeContextFromImport(
    importedSettings: ImportedSettings | null | undefined,
): InitialAdobeContext {
    const result: InitialAdobeContext = {};

    if (importedSettings?.adobe?.orgId) {
        result.org = {
            id: importedSettings.adobe.orgId,
            code: '',
            name: importedSettings.adobe.orgName || '',
        };
    }

    if (importedSettings?.adobe?.projectId) {
        result.project = {
            id: importedSettings.adobe.projectId,
            name: importedSettings.adobe.projectName || '',
            title: importedSettings.adobe.projectTitle,
        };
    }

    if (importedSettings?.adobe?.workspaceId) {
        result.workspace = {
            id: importedSettings.adobe.workspaceId,
            name: importedSettings.adobe.workspaceName || '',
            title: importedSettings.adobe.workspaceTitle,
        };
    }

    return result;
}

/**
 * Generate a unique project name that doesn't conflict with existing names.
 * Uses lowercase-hyphen format: "name-copy", "name-copy-2", etc.
 *
 * @param baseName - Original project name
 * @param existingNames - List of existing project names
 * @returns Unique project name
 */
export function generateUniqueProjectName(
    baseName: string,
    existingNames: string[],
): string {
    if (!existingNames.includes(baseName)) {
        return baseName;
    }

    // Try "name-copy"
    const copyName = `${baseName}-copy`;
    if (!existingNames.includes(copyName)) {
        return copyName;
    }

    // Try "name-copy-2", "name-copy-3", etc.
    let counter = 2;
    while (existingNames.includes(`${baseName}-copy-${counter}`)) {
        counter++;
    }
    return `${baseName}-copy-${counter}`;
}

/**
 * Determine initial project name from imported settings.
 *
 * @param importedSettings - Settings from import/copy operation
 * @param existingNames - List of existing project names
 * @returns Initial project name (empty string if no import)
 */
export function initializeProjectName(
    importedSettings: ImportedSettings | null | undefined,
    existingNames: string[],
): string {
    if (importedSettings?.source?.project) {
        return generateUniqueProjectName(
            importedSettings.source.project,
            existingNames,
        );
    }
    return '';
}

/**
 * Get the first enabled step from wizard configuration.
 *
 * @param wizardSteps - Wizard step configuration
 * @returns First enabled step ID or 'adobe-auth' as fallback
 */
export function getFirstEnabledStep(
    wizardSteps: Array<{ id: string; enabled: boolean }> | undefined,
): WizardStep {
    const enabledSteps = wizardSteps?.filter(step => step.enabled) || [];
    return (enabledSteps.length > 0 ? enabledSteps[0].id : 'adobe-auth') as WizardStep;
}

// ============================================================================
// UI Helper Functions
// ============================================================================

/**
 * Determine whether to show wizard footer (SOP §10 compliance)
 *
 * Extracts long validation chain to named helper for readability.
 * Footer is hidden on final step, mesh-deployment (has own buttons), and during review preparation.
 *
 * @param isLastStep - Whether current step is the final step
 * @param currentStep - Current step ID
 * @param isPreparingReview - Whether review preparation is in progress
 * @returns true if footer should be shown
 */
export function shouldShowWizardFooter(
    isLastStep: boolean,
    currentStep: string,
    isPreparingReview: boolean,
): boolean {
    return !isLastStep && currentStep !== 'mesh-deployment' && !isPreparingReview;
}

/**
 * Get wizard title based on mode
 *
 * - create: "Create Demo Project"
 * - edit: "Edit Project"
 * - import: "Import Project" (covers both file import and project copy)
 */
export function getWizardTitle(wizardMode?: WizardMode): string {
    switch (wizardMode) {
        case 'edit': return 'Edit Project';
        case 'import': return 'Import Project';
        default: return 'Create Demo Project';
    }
}

/**
 * Required steps that must always be visited in review mode (edit/import)
 * These steps are never auto-skipped because they require fresh validation:
 * - welcome: User may want to change project name or stack
 * - prerequisites: Runtime checks that may have changed
 * - adobe-auth: Token validation required
 * - settings: User should verify component configuration values
 */
export const REQUIRED_REVIEW_STEPS: WizardStep[] = ['welcome', 'prerequisites', 'adobe-auth', 'settings'];

/**
 * Check if a step is "satisfied" (has data from import/edit)
 *
 * A step is satisfied if it has the necessary data filled in from
 * imported settings or an edited project. This is used to determine
 * which steps can be auto-completed vs which need user input.
 *
 * Note: Required review steps (welcome, prerequisites, adobe-auth)
 * should always be visited regardless of satisfaction.
 */
export function isStepSatisfied(stepId: WizardStep, state: WizardState): boolean {
    // Required review steps NEVER start as satisfied
    // These always need fresh validation/action regardless of imported data
    if (REQUIRED_REVIEW_STEPS.includes(stepId)) {
        return false;
    }

    switch (stepId) {
        // Component selection
        case 'component-selection':
            return Boolean(state.components?.frontend || state.components?.backend);

        // Adobe I/O context (after auth is validated, these can be satisfied)
        case 'adobe-org':
            return Boolean(state.adobeOrg?.id);

        case 'adobe-project':
            return Boolean(state.adobeProject?.id);

        case 'adobe-workspace':
            return Boolean(state.adobeWorkspace?.id);

        // EDS configuration
        case 'eds-repository-config':
            return Boolean(state.edsConfig?.repoName || state.edsConfig?.selectedRepo);

        case 'data-source-config':
            return Boolean(state.edsConfig?.daLiveSite || state.edsConfig?.selectedSite);

        case 'connect-services':
            return Boolean(state.edsConfig?.githubAuth?.isAuthenticated);

        // Component configuration (step ID can be 'settings' or 'component-config')
        case 'settings':
        case 'component-config':
            return Boolean(state.componentConfigs && Object.keys(state.componentConfigs).length > 0);

        // API Mesh (if enabled)
        case 'api-mesh':
            return Boolean(state.apiMesh?.meshExists);

        // Terminal steps - never satisfied (need user action)
        case 'review':
        case 'project-creation':
            return false;

        default:
            return false;
    }
}

/**
 * Find the first incomplete step after a given index
 *
 * Used for smart navigation in review mode - skips satisfied steps
 * to jump directly to steps that need user input.
 *
 * A step is considered "complete" only if BOTH:
 * 1. isStepSatisfied() returns true (has valid data)
 * 2. Step is in completedSteps (user has confirmed it)
 *
 * This ensures steps removed from completedSteps (e.g., after stack change)
 * will not be skipped even if they still have data.
 *
 * @returns The index of the first incomplete step, or -1 if all complete
 */
export function findFirstIncompleteStep(
    state: WizardState,
    steps: Array<{ id: WizardStep; name: string }>,
    afterIndex: number,
    beforeIndex: number,
    completedSteps?: WizardStep[],
): number {
    for (let i = afterIndex + 1; i < beforeIndex; i++) {
        const step = steps[i];
        const isSatisfied = isStepSatisfied(step.id, state);
        const isConfirmed = completedSteps?.includes(step.id) ?? false;
        
        // Step is incomplete if either: no data OR not confirmed by user
        if (!isSatisfied || !isConfirmed) {
            return i;
        }
    }
    return -1; // All steps complete
}

/**
 * Determine next button text based on wizard state
 *
 * Project creation has two phases:
 * 1. storefront-setup: Publishes the storefront (GitHub repo, DA.live content, Helix config)
 * 2. project-creation: Deploys the mesh and other project components
 *
 * The "Create" button only appears on the Final Review step, which precedes
 * project-creation. The storefront-setup step shows "Continue" because it's
 * an intermediate creation step, not the final one.
 *
 * - Edit mode on review: "Save Changes"
 * - Create/import mode on review: "Create"
 * - All other steps: "Continue"
 */
export function getNextButtonText(
    isConfirmingSelection: boolean,
    currentStepIndex: number,
    totalSteps: number,
    wizardMode?: WizardMode,
    currentStepId?: string,
): string {
    if (isConfirmingSelection) return 'Continue';
    // Only show "Create"/"Save Changes" on Final Review step
    if (currentStepIndex === totalSteps - 2 && currentStepId === 'review') {
        return wizardMode === 'edit' ? 'Save Changes' : 'Create';
    }
    return 'Continue';
}

/**
 * Check if any mesh component is selected in wizard state
 *
 * Checks if dependencies include any mesh component ID (EDS or Headless).
 * Uses hasMeshInDependencies for type-safe mesh detection.
 */
export function hasMeshComponentSelected(components: ComponentSelection | undefined): boolean {
    return hasMeshInDependencies(components?.dependencies);
}

/**
 * Get indices of completed steps in the wizard step array
 *
 * Extracts inline array operations (SOP §4):
 * `completedSteps.map(s => WIZARD_STEPS.findIndex(ws => ws.id === s))`
 */
export function getCompletedStepIndices(
    completedSteps: WizardStep[],
    wizardSteps: Array<{ id: WizardStep; name: string }>,
): number[] {
    return completedSteps.map(stepId => wizardSteps.findIndex(ws => ws.id === stepId));
}

/**
 * Filter and map wizard steps to only enabled steps
 *
 * Extracts filter+map chain (SOP §4):
 * `wizardSteps.filter(step => step.enabled).map(step => ({ id: step.id as WizardStep, name: step.name }))`
 */
export function getEnabledWizardSteps(
    wizardSteps: Array<{ id: string; name: string; description?: string; enabled: boolean }> | undefined,
): Array<{ id: WizardStep; name: string; description?: string }> {
    if (!wizardSteps || wizardSteps.length === 0) {
        return [];
    }
    return wizardSteps
        .filter(step => step.enabled)
        .map(step => ({ id: step.id as WizardStep, name: step.name, description: step.description }));
}

// ============================================================================
// Project Configuration Builder
// ============================================================================

/**
 * Build project configuration from wizard state for project creation
 *
 * @param wizardState - Current wizard state
 * @param importedSettings - Optional imported settings for mesh reuse detection
 * @param packages - Optional packages array to resolve frontend source from storefronts
 */
export function buildProjectConfig(
    wizardState: WizardState,
    importedSettings?: ImportedSettings | null,
    packages?: DemoPackage[],
) {
    // Extract MESH_ENDPOINT from componentConfigs if it exists (from imported settings)
    let importedMeshEndpoint: string | undefined;
    if (wizardState.componentConfigs) {
        for (const componentConfig of Object.values(wizardState.componentConfigs)) {
            if (componentConfig?.MESH_ENDPOINT && typeof componentConfig.MESH_ENDPOINT === 'string') {
                importedMeshEndpoint = componentConfig.MESH_ENDPOINT;
                break;
            }
        }
    }

    // Resolve frontend source from selected package/storefront
    // Packages contain storefronts keyed by stack ID (e.g., 'headless-paas', 'eds-paas')
    let frontendSource: GitSource | undefined;
    if (packages && wizardState.selectedStack && wizardState.selectedPackage) {
        const pkg = packages.find(p => p.id === wizardState.selectedPackage);
        const storefront = pkg?.storefronts?.[wizardState.selectedStack];
        if (storefront?.source) {
            frontendSource = storefront.source;
        }
    }

    return {
        projectName: wizardState.projectName,
        adobe: {
            organization: wizardState.adobeOrg?.id,
            projectId: wizardState.adobeProject?.id,
            projectName: wizardState.adobeProject?.name,
            projectTitle: wizardState.adobeProject?.title,
            workspace: wizardState.adobeWorkspace?.id,
            workspaceName: wizardState.adobeWorkspace?.name,
            workspaceTitle: wizardState.adobeWorkspace?.title,
        },
        components: {
            frontend: wizardState.components?.frontend,
            backend: wizardState.components?.backend,
            dependencies: wizardState.components?.dependencies || [],
            integrations: wizardState.components?.integrations || [],
            appBuilder: wizardState.components?.appBuilder || [],
        },
        apiMesh: wizardState.apiMesh,
        componentConfigs: wizardState.componentConfigs,
        // Track imported workspace for mesh reuse detection
        // If user selects same workspace as imported settings, we can skip mesh deployment
        importedWorkspaceId: importedSettings?.adobe?.workspaceId,
        importedMeshEndpoint,
        // Package/Stack selections
        selectedPackage: wizardState.selectedPackage,
        selectedStack: wizardState.selectedStack,
        // Selected optional addons (e.g., ['demo-inspector'])
        selectedAddons: wizardState.selectedAddons || [],
        // Frontend source from package storefront (source of truth for repos)
        frontendSource,
        // Edit mode: re-use existing project directory
        editMode: wizardState.editMode,
        editProjectPath: wizardState.editProjectPath,
        // EDS configuration (for Edge Delivery Services stacks)
        edsConfig: wizardState.edsConfig ? {
            repoName: wizardState.edsConfig.repoName || '',
            repoMode: wizardState.edsConfig.repoMode || 'new',
            existingRepo: wizardState.edsConfig.selectedRepo?.fullName || wizardState.edsConfig.existingRepo,
            resetToTemplate: wizardState.edsConfig.resetToTemplate,
            daLiveOrg: wizardState.edsConfig.daLiveOrg || '',
            daLiveSite: wizardState.edsConfig.selectedSite?.name || wizardState.edsConfig.daLiveSite || '',
            accsEndpoint: wizardState.edsConfig.accsHost,
            githubOwner: wizardState.edsConfig.githubAuth?.user?.login || '',
            isPrivate: wizardState.edsConfig.selectedRepo?.isPrivate,
            skipContent: wizardState.edsConfig.skipContent,
            // Ingestion tool is only needed when ACO addon is selected
            skipTools: !wizardState.selectedAddons?.includes('adobe-commerce-aco'),
            // Whether to reset existing site content (replaces all content with demo data)
            resetSiteContent: wizardState.edsConfig.resetSiteContent || false,
        } : undefined,
    };

    return config;
}
