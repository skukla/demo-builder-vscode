import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { filterStepsForStack, WizardStepWithCondition } from '../stepFiltering';
import { hasMeshInDependencies } from '@/core/constants';
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
import { webviewLogger } from '@/core/ui/utils/webviewLogger';
import type { ComponentsData } from '@/features/project-creation/ui/steps/ReviewStep';
import type { Stack } from '@/types/stacks';
import type { WizardState, WizardStep, ComponentSelection } from '@/types/webview';

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
    WIZARD_STEPS: Array<{ id: WizardStep; name: string; description?: string }>;
    /** Steps that have been completed by the user */
    completedSteps: WizardStep[];
    /** Update completed steps */
    setCompletedSteps: React.Dispatch<React.SetStateAction<WizardStep[]>>;
    /** Steps confirmed by user in edit mode (clicked Continue) */
    confirmedSteps: WizardStep[];
    /** Update confirmed steps */
    setConfirmedSteps: React.Dispatch<React.SetStateAction<WizardStep[]>>;
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
    /** Full component data with envVars from backend */
    componentsData: { success: boolean; type: string; data: ComponentsData } | null;
    /** Set components data */
    setComponentsData: React.Dispatch<React.SetStateAction<{ success: boolean; type: string; data: ComponentsData } | null>>;
}

/**
 * Build EDS config for edit mode from saved project settings.
 * Auth tokens are NOT assumed valid -- hooks validate on step visit.
 */
function buildEditModeEdsConfig(
    edsConfig: NonNullable<ImportedSettings['edsConfig']>,
): WizardState['edsConfig'] {
    const owner = edsConfig.githubOwner || '';
    const repo = edsConfig.repoName || '';
    const site = edsConfig.daLiveSite || '';
    const hasGithub = Boolean(owner && repo);
    const hasDaLive = Boolean(edsConfig.daLiveOrg);

    return {
        accsHost: '',
        storeViewCode: '',
        customerGroup: '',
        repoName: repo,
        daLiveOrg: edsConfig.daLiveOrg || '',
        daLiveSite: site,
        githubAuth: hasGithub ? {
            isAuthenticated: false,
            isChecking: true,
            user: { login: owner },
        } : undefined,
        daLiveAuth: hasDaLive ? {
            isAuthenticated: false,
            isChecking: true,
        } : undefined,
        repoUrl: edsConfig.repoUrl,
        repoMode: hasGithub ? 'existing' : undefined,
        selectedRepo: hasGithub ? {
            id: `${owner}/${repo}`,
            name: repo,
            fullName: `${owner}/${repo}`,
            htmlUrl: `https://github.com/${owner}/${repo}`,
        } : undefined,
        selectedSite: site ? {
            id: site,
            name: site,
        } : undefined,
    };
}

/**
 * Build EDS config for import mode from imported project settings.
 * Auth tokens are assumed valid since importing from existing project.
 */
function buildImportModeEdsConfig(
    edsConfig: NonNullable<ImportedSettings['edsConfig']>,
): WizardState['edsConfig'] {
    const owner = edsConfig.githubOwner || '';
    const repo = edsConfig.repoName || '';
    const site = edsConfig.daLiveSite || '';
    const hasGithub = Boolean(owner && repo);
    const hasDaLive = Boolean(edsConfig.daLiveOrg);

    return {
        accsHost: '',
        storeViewCode: '',
        customerGroup: '',
        repoName: repo,
        daLiveOrg: edsConfig.daLiveOrg || '',
        daLiveSite: site,
        githubAuth: hasGithub ? {
            isAuthenticated: true,
            user: { login: owner },
        } : undefined,
        daLiveAuth: hasDaLive ? {
            isAuthenticated: true,
            org: edsConfig.daLiveOrg,
        } : undefined,
        repoUrl: edsConfig.repoUrl,
        repoMode: hasGithub ? 'existing' : undefined,
        selectedRepo: hasGithub ? {
            id: `${owner}/${repo}`,
            name: repo,
            fullName: `${owner}/${repo}`,
            htmlUrl: `https://github.com/${owner}/${repo}`,
        } : undefined,
        selectedSite: site ? {
            id: site,
            name: site,
        } : undefined,
    };
}

/** Build Adobe context objects from edit settings */
function buildEditModeAdobeContext(adobe: ImportedSettings['adobe']) {
    return {
        org: adobe?.orgId ? { id: adobe.orgId, code: '', name: adobe.orgName || '' } : undefined,
        project: adobe?.projectId ? { id: adobe.projectId, name: adobe.projectName || '', title: adobe.projectTitle } : undefined,
        workspace: adobe?.workspaceId ? { id: adobe.workspaceId, name: adobe.workspaceName || '', title: adobe.workspaceTitle } : undefined,
    };
}

/** Build component selection from edit settings */
function buildEditModeComponents(selections: ImportedSettings['selections']): ComponentSelection | undefined {
    if (!selections) return undefined;
    return {
        frontend: selections.frontend,
        backend: selections.backend,
        dependencies: selections.dependencies || [],
        integrations: selections.integrations || [],
        appBuilder: selections.appBuilder || [],
    };
}

/** Initialize wizard state for edit mode */
function buildEditModeState(
    firstStep: WizardStep,
    editProject: EditProjectConfig,
): WizardState {
    const editSettings = editProject.settings;
    log.info('Initializing wizard in edit mode', {
        projectName: editProject.projectName,
        projectPath: editProject.projectPath,
        hasSelections: !!editSettings.selections,
        hasAdobe: !!editSettings.adobe,
        hasConfigs: !!editSettings.configs,
        hasEdsConfig: !!editSettings.edsConfig,
    });

    if (editSettings.edsConfig) {
        log.info('Edit mode EDS config:', {
            githubOwner: editSettings.edsConfig.githubOwner,
            repoName: editSettings.edsConfig.repoName,
            daLiveOrg: editSettings.edsConfig.daLiveOrg,
            daLiveSite: editSettings.edsConfig.daLiveSite,
        });
    } else {
        log.warn('Edit mode: No EDS config found in project settings');
    }

    const adobeContext = buildEditModeAdobeContext(editSettings.adobe);

    return {
        currentStep: firstStep,
        projectName: editProject.projectName,
        wizardMode: 'edit',
        editMode: true,
        editProjectPath: editProject.projectPath,
        editOriginalName: editProject.projectName,
        componentConfigs: editSettings.configs || {},
        adobeAuth: { isAuthenticated: true, isChecking: false },
        components: buildEditModeComponents(editSettings.selections),
        adobeOrg: adobeContext.org,
        adobeProject: adobeContext.project,
        adobeWorkspace: adobeContext.workspace,
        selectedPackage: editSettings.selectedPackage,
        selectedStack: editSettings.selectedStack,
        selectedAddons: editSettings.selectedAddons,
        selectedBlockLibraries: editSettings.selectedBlockLibraries,
        customBlockLibraries: editSettings.customBlockLibraries,
        edsConfig: editSettings.edsConfig
            ? buildEditModeEdsConfig(editSettings.edsConfig)
            : undefined,
    };
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

    if (editProject) {
        return buildEditModeState(firstStep, editProject);
    }

    // CREATE/IMPORT MODE
    const initialComponents = initializeComponentsFromImport(importedSettings, componentDefaults);
    const adobeContext = initializeAdobeContextFromImport(importedSettings);
    const initialProjectName = initializeProjectName(importedSettings, existingProjectNames);
    const wizardMode = importedSettings ? 'import' : 'create';

    if (importedSettings) {
        log.info(`Initializing wizard in ${wizardMode} mode`, {
            hasSelections: !!importedSettings.selections,
            hasAdobe: !!importedSettings.adobe,
            hasConfigs: !!importedSettings.configs,
            configKeys: importedSettings.configs ? Object.keys(importedSettings.configs) : [],
            sourceProject: importedSettings.source?.project,
            generatedName: initialProjectName,
        });
    }

    return {
        currentStep: firstStep,
        projectName: initialProjectName,
        wizardMode,
        componentConfigs: importedSettings?.configs || {},
        adobeAuth: { isAuthenticated: false, isChecking: false },
        components: initialComponents,
        adobeOrg: adobeContext.org,
        adobeProject: adobeContext.project,
        adobeWorkspace: adobeContext.workspace,
        selectedPackage: importedSettings?.selectedPackage,
        selectedStack: importedSettings?.selectedStack,
        selectedAddons: importedSettings?.selectedAddons,
        selectedBlockLibraries: importedSettings?.selectedBlockLibraries,
        customBlockLibraries: importedSettings?.customBlockLibraries,
        edsConfig: importedSettings?.edsConfig
            ? buildImportModeEdsConfig(importedSettings.edsConfig)
            : undefined,
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
                description: step.description,
                condition: originalStep?.condition,
            };
        });

        // Step 4: Determine if mesh is included (from stack dependencies + user optional selections)
        const effectiveDeps = [
            ...(selectedStack?.dependencies || []),
            ...(state.selectedOptionalDependencies || []),
        ];
        const meshIncluded = hasMeshInDependencies(effectiveDeps);

        // Step 5: Apply stack-based, mode-based, and mesh-based filtering
        const filteredSteps = filterStepsForStack(stepsWithConditions, selectedStack, {
            isEditMode: !!editProject,
            hasMesh: meshIncluded,
        });

        return filteredSteps.map(step => ({
            id: step.id as WizardStep,
            name: step.name,
            description: step.description,
        }));
    }, [wizardSteps, stacks, state.selectedStack, state.selectedOptionalDependencies, editProject]);

    // Step completion tracking
    // Neither import mode nor edit mode pre-marks steps as completed
    // User must go through each step sequentially (consistent UX)
    const [completedSteps, setCompletedSteps] = useState<WizardStep[]>([]);

    // Steps confirmed by user (clicked Continue)
    // No steps are pre-confirmed - user must visit each
    const [confirmedSteps, setConfirmedSteps] = useState<WizardStep[]>([]);
    const [highestCompletedStepIndex, setHighestCompletedStepIndex] = useState(-1);

    // Track org ID to detect changes (for recomputing completedSteps)
    const prevOrgIdRef = useRef<string | undefined>(state.adobeOrg?.id);
    // Track if we've seen the first org (to distinguish initial mount from actual changes)
    const hasSeenOrgRef = useRef<boolean>(Boolean(state.adobeOrg?.id));

    // Recompute completedSteps when organization changes
    // When user re-authenticates with a different org, project/workspace are cleared
    // and those steps should no longer show as completed
    useEffect(() => {
        const currentOrgId = state.adobeOrg?.id;
        const prevOrgId = prevOrgIdRef.current;

        // Only act if:
        // 1. We've seen an org before (not first-time setting)
        // 2. The org actually changed to a DIFFERENT value
        const orgActuallyChanged = hasSeenOrgRef.current &&
            prevOrgId !== undefined &&
            currentOrgId !== undefined &&
            prevOrgId !== currentOrgId;

        if (orgActuallyChanged) {
            const isReviewMode = state.wizardMode && state.wizardMode !== 'create';
            if (isReviewMode) {
                // Reset all org-dependent steps (project → workspace → mesh → settings)
                // These form a cascade: org owns projects, projects own workspaces,
                // workspaces own meshes, and settings may reference org credentials
                // Remove org-dependent steps - user must re-traverse them
                const orgDependentSteps: WizardStep[] = [
                    'adobe-project',
                    'adobe-workspace',
                    'settings',
                ];
                setCompletedSteps(prev =>
                    prev.filter(stepId => !orgDependentSteps.includes(stepId)),
                );
                setConfirmedSteps(prev =>
                    prev.filter(stepId => !orgDependentSteps.includes(stepId)),
                );
                log.info(`Org changed (${prevOrgId} → ${currentOrgId}), updated org-dependent steps`);
            }
        }

        // Track that we've seen an org
        if (currentOrgId) {
            hasSeenOrgRef.current = true;
        }
        // Update ref for next comparison
        prevOrgIdRef.current = currentOrgId;
    }, [state.adobeOrg?.id, state.wizardMode, state.adobeProject?.id, state.adobeWorkspace?.id, WIZARD_STEPS]);

    // Transition/animation state
    const [animationDirection, setAnimationDirection] = useState<'forward' | 'backward'>('forward');
    const [isTransitioning, setIsTransitioning] = useState(false);

    // UI loading states
    const [canProceed, setCanProceed] = useState(false);
    const [isConfirmingSelection, setIsConfirmingSelection] = useState(false);

    // Component data from backend
    const [componentsData, setComponentsData] = useState<{
        success: boolean;
        type: string;
        data: ComponentsData;
    } | null>(null);

    // Convenience update function
    // IMPORTANT: Must be memoized to prevent infinite loops in child components
    // that depend on updateState in their useEffect dependency arrays
    const updateState = useCallback((updates: Partial<WizardState>) => {
        setState(prev => ({ ...prev, ...updates }));
    }, []);

    return {
        state,
        updateState,
        setState,
        WIZARD_STEPS,
        completedSteps,
        setCompletedSteps,
        confirmedSteps,
        setConfirmedSteps,
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
        componentsData,
        setComponentsData,
    };
}
