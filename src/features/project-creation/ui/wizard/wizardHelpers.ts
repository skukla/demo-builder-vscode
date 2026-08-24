/**
 * Helper functions for WizardContainer component (SOP §3, §4 compliance)
 */

import { getStackById } from '../hooks/useSelectedStack';
import { isMeshComponentId } from '@/core/constants';
import { clearCompletedFrom } from '@/core/ui/utils/stepCompletion';
import type { CustomBlockLibrary } from '@/types/blockLibraries';
import type { DemoPackage, GitSource } from '@/types/demoPackages';
import type { WizardStep, WizardState, WizardMode, ComponentSelection } from '@/types/webview';
import type { ProjectCreationConfig } from '@/types/webviewRequests';
import type { ImportedSettings, WizardStepDefinition } from '@/types/wizard';

/**
 * Filters committed custom block library selections to remove any that
 * are no longer present in the current VS Code settings defaults.
 *
 * When a user removes a custom library URL from settings, the modal
 * correctly re-initializes from defaults. But the wizard state (shown
 * on brand tiles) must also be reconciled.
 */
export function filterRemovedCustomLibraries(
    selected: CustomBlockLibrary[] | undefined,
    defaults: CustomBlockLibrary[] | undefined,
): CustomBlockLibrary[] {
    if (!selected?.length) return [];
    if (!defaults) return selected;

    const validKeys = new Set(defaults.map((d) => `${d.source.owner}/${d.source.repo}`));
    return selected.filter((lib) => validKeys.has(`${lib.source.owner}/${lib.source.repo}`));
}

/**
 * Step configuration for wizard navigation
 */
export interface WizardStepConfig {
    id: WizardStep;
    name: string;
    description?: string;
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
    allSteps: WizardStepDefinition[],
    selectedComponents: ComponentSelection | undefined,
): Array<{ id: WizardStep; name: string; description?: string }> {
    return allSteps
        .filter((step) => {
            // Disabled steps never shown
            if (!step.enabled) return false;

            // requiredComponents: ALL must be selected (AND logic)
            if (step.requiredComponents && step.requiredComponents.length > 0) {
                return step.requiredComponents.every((componentId) =>
                    isComponentSelected(componentId, selectedComponents),
                );
            }

            // requiredAny: ANY must be selected (OR logic)
            if (step.requiredAny && step.requiredAny.length > 0) {
                return step.requiredAny.some((componentId) =>
                    isComponentSelected(componentId, selectedComponents),
                );
            }

            // No requirements = always shown (backward compatible)
            return true;
        })
        .map((step) => ({
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
    // Shared with the Commerce sub-steps — same drop-target-and-after semantics.
    return clearCompletedFrom(
        completedSteps,
        wizardSteps.map((ws) => ws.id),
        targetStep,
        targetIndex,
    );
}

/**
 * Index of the step that owns Adobe I/O project + workspace selection.
 *
 * The Adobe project + workspace pickers now live INSIDE the `build-your-project`
 * step's Integrations (Mesh) tile, so backward-nav clearing keys off that step's
 * index: navigating before it clears the (now co-located) project AND workspace.
 */
export interface AdobeStepIndices {
    /** Index of `build-your-project` (the picker host), or -1 when absent. */
    buildStepIndex: number;
}

/**
 * Get the index of the step that hosts the Adobe project/workspace pickers.
 */
export function getAdobeStepIndices(wizardSteps: WizardStepConfig[]): AdobeStepIndices {
    return {
        buildStepIndex: wizardSteps.findIndex((s) => s.id === 'build-your-project'),
    };
}

/**
 * Compute state updates needed when navigating backward.
 *
 * Clears the Adobe project + workspace selections (and their caches) when
 * navigating BEFORE the `build-your-project` step that now hosts their pickers.
 * Project and workspace are co-located there, so both clear together — keeping
 * state consistent on re-traversal (the pickers re-load + re-auto-select).
 *
 * @param _currentState - Current wizard state (unused; signature kept for callers)
 * @param targetStep - Step we're navigating to
 * @param targetIndex - Index of target step
 * @param indices - Picker-host step index
 * @returns Partial state updates to apply
 */
export function computeStateUpdatesForBackwardNav(
    _currentState: WizardState,
    targetStep: WizardStep,
    targetIndex: number,
    indices: AdobeStepIndices,
): Partial<WizardState> {
    const updates: Partial<WizardState> = {
        currentStep: targetStep,
    };

    // Clear project + workspace (and caches) when going before the picker host.
    if (indices.buildStepIndex !== -1 && targetIndex < indices.buildStepIndex) {
        updates.adobeProject = undefined;
        updates.projectsCache = undefined;
        updates.adobeWorkspace = undefined;
        updates.workspacesCache = undefined;
    }

    return updates;
}

// ============================================================================
// State Initialization Helpers
// ============================================================================

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
export function generateUniqueProjectName(baseName: string, existingNames: string[]): string {
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
        return generateUniqueProjectName(importedSettings.source.project, existingNames);
    }
    return '';
}

/**
 * Get the first enabled step from wizard configuration.
 *
 * @param wizardSteps - Wizard step configuration
 * @returns First enabled step ID or 'welcome' as fallback
 */
export function getFirstEnabledStep(
    wizardSteps: Array<{ id: string; enabled: boolean }> | undefined,
): WizardStep {
    const enabledSteps = wizardSteps?.filter((step) => step.enabled) || [];
    return (enabledSteps.length > 0 ? enabledSteps[0].id : 'welcome') as WizardStep;
}

// ============================================================================
// UI Helper Functions
// ============================================================================

/**
 * Determine whether to show wizard footer (SOP §10 compliance)
 *
 * Extracts long validation chain to named helper for readability.
 * Footer is hidden on the final step and on steps that render their own footer
 * (mesh-deployment). The group-paced steps use the shared wizard footer.
 *
 * @param isLastStep - Whether current step is the final step
 * @param currentStep - Current step ID
 * @returns true if footer should be shown
 */
const STEPS_WITH_OWN_FOOTER = new Set(['mesh-deployment']);

export function shouldShowWizardFooter(isLastStep: boolean, currentStep: string): boolean {
    return !isLastStep && !STEPS_WITH_OWN_FOOTER.has(currentStep);
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
        case 'edit':
            return 'Edit Project';
        case 'import':
            return 'Import Project';
        default:
            return 'Create Demo Project';
    }
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
 * The label follows the step ID, not its index: storefront-setup sits between
 * review and create-project, so review is no longer second-to-last. Keying on the
 * id keeps the label correct regardless of how many steps the active stack shows.
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
    // Only show "Create"/"Save Changes" on the Final Review step (id-driven).
    if (currentStepId === 'review') {
        return wizardMode === 'edit' ? 'Save Changes' : 'Create';
    }
    return 'Continue';
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
    return completedSteps.map((stepId) => wizardSteps.findIndex((ws) => ws.id === stepId));
}

/**
 * Filter and map wizard steps to only enabled steps
 *
 * Extracts filter+map chain (SOP §4):
 * `wizardSteps.filter(step => step.enabled).map(step => ({ id: step.id as WizardStep, name: step.name }))`
 */
export function getEnabledWizardSteps(
    wizardSteps:
        | Array<{ id: string; name: string; description?: string; enabled: boolean }>
        | undefined,
): Array<{ id: WizardStep; name: string; description?: string }> {
    if (!wizardSteps || wizardSteps.length === 0) {
        return [];
    }
    return wizardSteps
        .filter((step) => step.enabled)
        .map((step) => ({
            id: step.id as WizardStep,
            name: step.name,
            description: step.description,
        }));
}

// ============================================================================
// Project Configuration Builder
// ============================================================================

/** Extract imported MESH_ENDPOINT from componentConfigs */
function extractImportedMeshEndpoint(
    componentConfigs: WizardState['componentConfigs'],
): string | undefined {
    if (!componentConfigs) return undefined;
    for (const componentConfig of Object.values(componentConfigs)) {
        if (componentConfig?.MESH_ENDPOINT && typeof componentConfig.MESH_ENDPOINT === 'string') {
            return componentConfig.MESH_ENDPOINT;
        }
    }
    return undefined;
}

/** Validate stack/package configuration consistency and log warnings */
function validateStackPackageConfig(
    wizardState: ProjectConfigSource,
    packages: DemoPackage[] | undefined,
): void {
    if (wizardState.selectedStack && !wizardState.selectedPackage) {
        console.warn(
            '[Demo Builder] Incomplete configuration: architecture is selected but brand/package is missing. ' +
                'This may result in missing storefront data.',
        );
        // eslint-disable-next-line no-console
        console.log(
            '[buildProjectConfig] Validation warning - selectedStack without selectedPackage:',
            {
                selectedPackage: wizardState.selectedPackage,
                selectedStack: wizardState.selectedStack,
                hasPackages: !!packages,
                packagesCount: packages?.length || 0,
            },
        );
    }
}

/** Resolve frontend source from selected package/storefront combination */
function resolveFrontendSourceFromPackage(
    wizardState: ProjectConfigSource,
    packages: DemoPackage[] | undefined,
): GitSource | undefined {
    if (!packages || !wizardState.selectedStack || !wizardState.selectedPackage) {
        return undefined;
    }
    const pkg = packages.find((p) => p.id === wizardState.selectedPackage);
    return pkg?.storefronts?.[wizardState.selectedStack]?.source;
}

/** Validate that stack lookup succeeded and log warnings if not */
function validateStackLookup(
    wizardState: ProjectConfigSource,
    stack: ReturnType<typeof getStackById> | undefined,
): void {
    if (wizardState.selectedStack && !stack) {
        console.warn(
            `[Demo Builder] Configuration warning: selected architecture '${wizardState.selectedStack}' not found. ` +
                'Components may be missing from project.',
        );
        // eslint-disable-next-line no-console
        console.log('[buildProjectConfig] Validation warning - stack lookup failed:', {
            selectedStack: wizardState.selectedStack,
            selectedPackage: wizardState.selectedPackage,
            stackFound: false,
        });
    }
}

/** Build EDS config object for project creation from wizard EDS state */
function buildProjectEdsConfig(wizardState: ProjectConfigSource) {
    const eds = wizardState.edsConfig;
    if (!eds) return undefined;

    return {
        repoName: eds.repoName || '',
        repoMode: eds.repoMode || 'new',
        existingRepo: eds.selectedRepo?.fullName || eds.existingRepo,
        resetToTemplate: eds.resetToTemplate,
        daLiveOrg: eds.daLiveOrg || '',
        daLiveSite: eds.selectedSite?.name || eds.daLiveSite || '',
        accsEndpoint: eds.accsHost,
        githubOwner: eds.githubAuth?.user?.login || '',
        isPrivate: eds.selectedRepo?.isPrivate,
        skipContent: eds.skipContent,
        skipTools: !wizardState.selectedAddons?.includes('adobe-commerce-aco'),
        resetSiteContent: eds.resetSiteContent || false,
        templateOwner: eds.templateOwner,
        templateRepo: eds.templateRepo,
        contentSource: eds.contentSource,
        accountContentSource: eds.accountContentSource,
        patches: eds.patches,
        contentPatches: eds.contentPatches,
        contentPatchSource: eds.contentPatchSource,
        codePatches: eds.codePatches,
        codePatchSource: eds.codePatchSource,
        repoUrl: eds.repoUrl,
        preflightComplete: eds.preflightComplete,
    };
}

/**
 * SDK-code charset — boundary parity with the dashboard's addConsoleApis
 * handler; codes outside it never reach the manifest or the subscribe union.
 */
const SDK_CODE_RE = /^[A-Za-z0-9_-]+$/;

/**
 * The per-integration picks, charset-filtered per key, with keys left empty
 * dropped. This is what PERSISTS — the derived flat union that used to ride
 * beside it was retired with attribution step 07 (2026-08-23).
 *
 * `__existing__` stays its own key: those picks have an unrecoverable owner,
 * which is not the same as having none.
 *
 * @param selectedConsoleApis - wizard picks, keyed by integration id
 * @returns the sanitized record, or undefined when nothing valid is picked
 */
function sanitizeConsoleApiPicks(
    selectedConsoleApis: Record<string, string[]> | undefined,
): Record<string, string[]> | undefined {
    const entries = Object.entries(selectedConsoleApis ?? {})
        .map(([id, codes]): [string, string[]] => [
            id,
            [...new Set(codes.filter((c) => SDK_CODE_RE.test(c)))],
        ])
        .filter(([, codes]) => codes.length > 0);
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/**
 * Build project configuration from wizard state for project creation
 *
 * @param wizardState - Current wizard state
 * @param importedSettings - Optional imported settings for mesh reuse detection
 * @param packages - Optional packages array to resolve frontend source from storefronts
 */
/**
 * The slice of wizard state {@link buildProjectConfig} actually reads. A full
 * WizardState is assignable; the MCP create_project tool builds exactly this
 * slice headlessly (it used to cast a partial object
 * `as unknown as WizardState`, which hid every missing field).
 */
export type ProjectConfigSource = Pick<
    WizardState,
    | 'projectName'
    | 'projectTitle'
    | 'adobeOrg'
    | 'adobeProject'
    | 'adobeWorkspace'
    | 'componentConfigs'
    | 'selectedStack'
    | 'apiMesh'
    | 'storeDiscoveryData'
    | 'selectedPackage'
    | 'datapack'
    | 'selectedAppBuilderComponents'
    | 'appBuilderComponentSources'
    | 'selectedConsoleApis'
    | 'selectedAddons'
    | 'selectedBlockLibraries'
    | 'customBlockLibraries'
    | 'editProjectPath'
    | 'edsConfig'
>;

export function buildProjectConfig(
    wizardState: ProjectConfigSource,
    importedSettings?: ImportedSettings | null,
    packages?: DemoPackage[],
): ProjectCreationConfig {
    const importedMeshEndpoint = extractImportedMeshEndpoint(wizardState.componentConfigs);
    validateStackPackageConfig(wizardState, packages);
    const frontendSource = resolveFrontendSourceFromPackage(wizardState, packages);
    const stack = wizardState.selectedStack ? getStackById(wizardState.selectedStack) : undefined;
    validateStackLookup(wizardState, stack);

    // Debug: trace EDS config values at project creation time
    // eslint-disable-next-line no-console
    console.log('[buildProjectConfig] Package/Stack/EDS config:', {
        selectedPackage: wizardState.selectedPackage,
        selectedStack: wizardState.selectedStack,
        hasEdsConfig: !!wizardState.edsConfig,
        repoUrl: wizardState.edsConfig?.repoUrl,
        daLiveOrg: wizardState.edsConfig?.daLiveOrg,
        daLiveSite: wizardState.edsConfig?.daLiveSite,
    });

    return {
        projectName: wizardState.projectName,
        projectTitle: wizardState.projectTitle,
        adobe: {
            organization: wizardState.adobeOrg?.id,
            organizationName: wizardState.adobeOrg?.name,
            projectId: wizardState.adobeProject?.id,
            projectName: wizardState.adobeProject?.name,
            projectTitle: wizardState.adobeProject?.title,
            workspace: wizardState.adobeWorkspace?.id,
            workspaceName: wizardState.adobeWorkspace?.name,
            workspaceTitle: wizardState.adobeWorkspace?.title,
        },
        components: stack
            ? {
                  frontend: stack.frontend,
                  backend: stack.backend,
                  // The mesh's wizard-side home is selectedAppBuilderComponents
                  // (D3); the WIRE still carries it here in dependencies, which
                  // is where creation installs it and where the persisted
                  // componentSelections keep it (ADR-011).
                  dependencies: [
                      ...(stack.dependencies || []),
                      ...(wizardState.selectedAppBuilderComponents || []).filter(isMeshComponentId),
                  ],
                  integrations: [],
                  appBuilder: [],
              }
            : undefined,
        apiMesh: wizardState.apiMesh,
        componentConfigs: wizardState.componentConfigs,
        // The discovered store hierarchy, which the wizard fetched and would
        // otherwise throw away. Persisting it is what lets any later surface
        // name a scope CODE without a second Commerce call.
        commerceStoreStructure: wizardState.storeDiscoveryData,
        importedWorkspaceId: importedSettings?.adobe?.workspaceId,
        importedMeshEndpoint,
        selectedPackage: wizardState.selectedPackage,
        selectedStack: wizardState.selectedStack,
        // Recorded for the dashboard to install later — never imported here.
        datapack: wizardState.datapack,
        selectedAppBuilderComponents: wizardState.selectedAppBuilderComponents ?? [],
        appBuilderComponentSources: wizardState.appBuilderComponentSources ?? {},
        componentApiPicks: sanitizeConsoleApiPicks(wizardState.selectedConsoleApis),
        selectedAddons: wizardState.selectedAddons || [],
        selectedBlockLibraries: wizardState.selectedBlockLibraries || [],
        customBlockLibraries: wizardState.customBlockLibraries || [],
        frontendSource,
        editProjectPath: wizardState.editProjectPath,
        edsConfig: buildProjectEdsConfig(wizardState),
    };
}
