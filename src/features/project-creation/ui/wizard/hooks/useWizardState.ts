import { useState, useMemo } from 'react';
import {
    getEnabledWizardSteps,
    initializeComponentsFromImport,
    initializeAdobeContextFromImport,
    initializeProjectName,
    getFirstEnabledStep,
    ImportedSettings,
    EditProjectConfig,
    WizardStepConfigWithRequirements,
} from '../wizardHelpers';
import { filterStepsForStack, WizardStepWithCondition } from '../stepFiltering';
import { webviewLogger } from '@/core/ui/utils/webviewLogger';
import type { ComponentsData } from '@/features/project-creation/ui/steps/ReviewStep';
import type { WizardState, WizardStep, ComponentSelection } from '@/types/webview';
import type { Stack } from '@/types/stacks';

const log = webviewLogger('useWizardState');

interface UseWizardStateProps {
    componentDefaults?: ComponentSelection;
    wizardSteps?: WizardStepConfigWithRequirements[];
    existingProjectNames?: string[];
    importedSettings?: ImportedSettings | null;
    editProject?: EditProjectConfig;
    /** Available stacks for filtering steps based on selectedStack */
    stacks?: Stack[];
}

interface UseWizardStateReturn {
    /** The current wizard state */
    state: WizardState;
    /** Update function to merge partial updates into state */
    updateState: (updates: Partial<WizardState>) => void;
    /** Function to directly set state (for message handlers) */
    setState: React.Dispatch<React.SetStateAction<WizardState>>;
    /** The filtered list of enabled wizard steps */
    WIZARD_STEPS: Array<{ id: WizardStep; name: string }>;
    /** Steps that have been completed by the user */
    completedSteps: WizardStep[];
    /** Update completed steps */
    setCompletedSteps: React.Dispatch<React.SetStateAction<WizardStep[]>>;
    /** Highest completed step index (for progress tracking) */
    highestCompletedStepIndex: number;
    /** Update highest completed step index */
    setHighestCompletedStepIndex: React.Dispatch<React.SetStateAction<number>>;
    /** Whether the user can proceed to the next step */
    canProceed: boolean;
    /** Set whether user can proceed */
    setCanProceed: React.Dispatch<React.SetStateAction<boolean>>;
    /** Animation direction for step transitions */
    animationDirection: 'forward' | 'backward';
    /** Set animation direction */
    setAnimationDirection: React.Dispatch<React.SetStateAction<'forward' | 'backward'>>;
    /** Whether a step transition is in progress */
    isTransitioning: boolean;
    /** Set transitioning state */
    setIsTransitioning: React.Dispatch<React.SetStateAction<boolean>>;
    /** Whether backend is confirming a selection (loading state) */
    isConfirmingSelection: boolean;
    /** Set confirming selection state */
    setIsConfirmingSelection: React.Dispatch<React.SetStateAction<boolean>>;
    /** Whether preparing review step (import mode) */
    isPreparingReview: boolean;
    /** Set preparing review state */
    setIsPreparingReview: React.Dispatch<React.SetStateAction<boolean>>;
    /** Full component data with envVars from backend */
    componentsData: { success: boolean; type: string; data: ComponentsData } | null;
    /** Set components data */
    setComponentsData: React.Dispatch<React.SetStateAction<{ success: boolean; type: string; data: ComponentsData } | null>>;
}

/**
 * Compute initial state based on mode (edit vs create) and any imported settings
 */
function computeInitialState(
    wizardSteps: { id: string; name: string; enabled: boolean }[] | undefined,
    editProject: EditProjectConfig | undefined,
    importedSettings: ImportedSettings | null | undefined,
    componentDefaults: ComponentSelection | undefined,
    existingProjectNames: string[],
): WizardState {
    const firstStep = getFirstEnabledStep(wizardSteps);

    // EDIT MODE: Initialize with project data, start at first step
    if (editProject) {
        const editSettings = editProject.settings;
        log.info('Initializing wizard in edit mode', {
            projectName: editProject.projectName,
            projectPath: editProject.projectPath,
            hasSelections: !!editSettings.selections,
            hasAdobe: !!editSettings.adobe,
            hasConfigs: !!editSettings.configs,
        });

        return {
            currentStep: firstStep,
            projectName: editProject.projectName,
            projectTemplate: 'citisignal',
            editMode: true,
            editProjectPath: editProject.projectPath,
            componentConfigs: editSettings.configs || {},
            adobeAuth: {
                isAuthenticated: true, // Assumed authenticated for edit mode
                isChecking: false,
            },
            components: editSettings.selections ? {
                frontend: editSettings.selections.frontend,
                backend: editSettings.selections.backend,
                dependencies: editSettings.selections.dependencies || [],
                integrations: editSettings.selections.integrations || [],
                appBuilderApps: editSettings.selections.appBuilder || [],
            } : undefined,
            adobeOrg: editSettings.adobe?.orgId ? {
                id: editSettings.adobe.orgId,
                code: '',
                name: editSettings.adobe.orgName || '',
            } : undefined,
            adobeProject: editSettings.adobe?.projectId ? {
                id: editSettings.adobe.projectId,
                name: editSettings.adobe.projectName || '',
                title: editSettings.adobe.projectTitle,
            } : undefined,
            adobeWorkspace: editSettings.adobe?.workspaceId ? {
                id: editSettings.adobe.workspaceId,
                name: editSettings.adobe.workspaceName || '',
                title: editSettings.adobe.workspaceTitle,
            } : undefined,
        };
    }

    // CREATE MODE: Use helper functions for cleaner initialization
    const initialComponents = initializeComponentsFromImport(importedSettings, componentDefaults);
    const adobeContext = initializeAdobeContextFromImport(importedSettings);
    const initialProjectName = initializeProjectName(importedSettings, existingProjectNames);

    if (importedSettings) {
        log.info('Initializing wizard with imported settings', {
            hasSelections: !!importedSettings.selections,
            hasAdobe: !!importedSettings.adobe,
            hasConfigs: !!importedSettings.configs,
            sourceProject: importedSettings.source?.project,
            generatedName: initialProjectName,
        });
    }

    return {
        currentStep: firstStep,
        projectName: initialProjectName,
        projectTemplate: 'citisignal',
        componentConfigs: importedSettings?.configs || {},
        adobeAuth: {
            isAuthenticated: false,  // Start as false, will be checked on auth step
            isChecking: false,       // Allow the check to proceed
        },
        components: initialComponents,
        adobeOrg: adobeContext.org,
        adobeProject: adobeContext.project,
        adobeWorkspace: adobeContext.workspace,
    };
}

/**
 * Hook to manage all wizard state including initialization, transitions, and UI state
 *
 * Handles:
 * - Edit mode vs create mode initialization
 * - Import settings handling
 * - Transition animations
 * - Step completion tracking
 */
export function useWizardState({
    componentDefaults,
    wizardSteps,
    existingProjectNames,
    importedSettings,
    editProject,
    stacks,
}: UseWizardStateProps): UseWizardStateReturn {
    // Main wizard state (declared before WIZARD_STEPS so we can use selectedStack)
    const [state, setState] = useState<WizardState>(() =>
        computeInitialState(wizardSteps, editProject, importedSettings, componentDefaults, existingProjectNames || []),
    );

    // Filter steps based on enabled flag AND stack conditions
    // When a predefined stack is selected, hide steps with showWhenNoStack: true
    // (e.g., Component Selection is hidden because the stack determines components)
    const WIZARD_STEPS = useMemo(() => {
        // Step 1: Get all enabled steps
        const enabledSteps = getEnabledWizardSteps(wizardSteps);

        // Step 2: Look up the selected Stack object from the stacks array
        const selectedStack = state.selectedStack
            ? stacks?.find(s => s.id === state.selectedStack)
            : undefined;

        // Step 3: Convert to format expected by filterStepsForStack
        const stepsWithConditions: WizardStepWithCondition[] = enabledSteps.map(step => {
            // Find the original step config to get the condition
            const originalStep = wizardSteps?.find(ws => ws.id === step.id);
            return {
                id: step.id,
                name: step.name,
                condition: originalStep?.condition,
            };
        });

        // Step 4: Apply stack-based filtering
        const filteredSteps = filterStepsForStack(stepsWithConditions, selectedStack);

        return filteredSteps.map(step => ({
            id: step.id as WizardStep,
            name: step.name,
        }));
    }, [wizardSteps, stacks, state.selectedStack]);

    // Step completion tracking
    const [completedSteps, setCompletedSteps] = useState<WizardStep[]>(() => {
        if (editProject) {
            // All steps completed except project-creation (terminal step)
            return WIZARD_STEPS
                .filter(step => step.id !== 'project-creation')
                .map(step => step.id as WizardStep);
        }
        return [];
    });
    const [highestCompletedStepIndex, setHighestCompletedStepIndex] = useState(-1);

    // Transition/animation state
    const [animationDirection, setAnimationDirection] = useState<'forward' | 'backward'>('forward');
    const [isTransitioning, setIsTransitioning] = useState(false);

    // UI loading states
    const [canProceed, setCanProceed] = useState(false);
    const [isConfirmingSelection, setIsConfirmingSelection] = useState(false);
    const [isPreparingReview, setIsPreparingReview] = useState(false);

    // Component data from backend
    const [componentsData, setComponentsData] = useState<{
        success: boolean;
        type: string;
        data: ComponentsData;
    } | null>(null);

    // Convenience update function
    const updateState = (updates: Partial<WizardState>) => {
        setState(prev => ({ ...prev, ...updates }));
    };

    return {
        state,
        updateState,
        setState,
        WIZARD_STEPS,
        completedSteps,
        setCompletedSteps,
        highestCompletedStepIndex,
        setHighestCompletedStepIndex,
        canProceed,
        setCanProceed,
        animationDirection,
        setAnimationDirection,
        isTransitioning,
        setIsTransitioning,
        isConfirmingSelection,
        setIsConfirmingSelection,
        isPreparingReview,
        setIsPreparingReview,
        componentsData,
        setComponentsData,
    };
}
