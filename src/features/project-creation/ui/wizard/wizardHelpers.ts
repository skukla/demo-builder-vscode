/**
 * Helper functions for WizardContainer component (SOP §3, §4 compliance)
 */

import type { WizardStep, WizardState, ComponentSelection } from '@/types/webview';

/**
 * Step configuration for wizard navigation
 */
export interface WizardStepConfig {
    id: WizardStep;
    name: string;
}

/**
 * Extended step configuration with optional component requirements.
 * Used for loading wizard-steps.json which may include requiredComponents.
 */
export interface WizardStepConfigWithRequirements {
    id: string;
    name: string;
    enabled: boolean;
    /** Optional: Component IDs that must ALL be selected for this step to appear (AND logic) */
    requiredComponents?: string[];
    /** Optional: Component IDs where ANY selection makes this step appear (OR logic) */
    requiredAny?: string[];
}

// ============================================================================
// Component-Specific Step Filtering
// ============================================================================

/**
 * Check if a specific component is selected in the component selection state.
 *
 * Searches across all component categories: frontend, backend, dependencies,
 * integrations, and appBuilderApps.
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

    // Check array fields (dependencies, integrations, appBuilderApps)
    if (selectedComponents.dependencies?.includes(componentId)) return true;
    if (selectedComponents.integrations?.includes(componentId)) return true;
    if (selectedComponents.appBuilderApps?.includes(componentId)) return true;

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
): Array<{ id: WizardStep; name: string }> {
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
            appBuilderApps: importedSettings.selections.appBuilder || [],
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
 * Determine next button text based on wizard state
 *
 * Extracts nested ternary (SOP §3):
 * `isConfirmingSelection ? 'Continue' : (currentStepIndex === totalSteps - 2 ? 'Create Project' : 'Continue')`
 */
export function getNextButtonText(
    isConfirmingSelection: boolean,
    currentStepIndex: number,
    totalSteps: number,
    isEditMode?: boolean,
): string {
    if (isConfirmingSelection) return 'Continue';
    if (currentStepIndex === totalSteps - 2) {
        return isEditMode ? 'Save Changes' : 'Create Project';
    }
    return 'Continue';
}

/**
 * Check if mesh component is selected in wizard state
 *
 * Extracts deep optional chaining (SOP §4):
 * `state.components?.dependencies?.includes('commerce-mesh') ?? false`
 */
export function hasMeshComponentSelected(components: ComponentSelection | undefined): boolean {
    return components?.dependencies?.includes('commerce-mesh') ?? false;
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
    wizardSteps: Array<{ id: string; name: string; enabled: boolean }> | undefined,
): Array<{ id: WizardStep; name: string }> {
    if (!wizardSteps || wizardSteps.length === 0) {
        return [];
    }
    return wizardSteps
        .filter(step => step.enabled)
        .map(step => ({ id: step.id as WizardStep, name: step.name }));
}

// ============================================================================
// Project Configuration Builder
// ============================================================================

/**
 * Build project configuration from wizard state for project creation
 */
export function buildProjectConfig(wizardState: WizardState) {
    return {
        projectName: wizardState.projectName,
        projectTemplate: wizardState.projectTemplate,
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
            appBuilderApps: wizardState.components?.appBuilderApps || [],
        },
        apiMesh: wizardState.apiMesh,
        componentConfigs: wizardState.componentConfigs,
    };
}
