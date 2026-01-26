import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
    getEnabledWizardSteps,
    initializeComponentsFromImport,
    initializeAdobeContextFromImport,
    initializeProjectName,
    getFirstEnabledStep,
    isStepSatisfied,
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
            hasEdsConfig: !!editSettings.edsConfig,
        });

        // Debug: Log EDS config details for step satisfaction troubleshooting
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

        return {
            currentStep: firstStep,
            projectName: editProject.projectName,
            wizardMode: 'edit',
            editMode: true,  // Legacy, use wizardMode
            editProjectPath: editProject.projectPath,
            editOriginalName: editProject.projectName,  // For duplicate validation
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
                appBuilder: editSettings.selections.appBuilder || [],
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
            // Package/Stack/Addons from source project
            selectedPackage: editSettings.selectedPackage,
            selectedStack: editSettings.selectedStack,
            selectedAddons: editSettings.selectedAddons,
            // EDS configuration from source project (for EDS stacks)
            // Construct selectedRepo and selectedSite objects for list pre-selection
            edsConfig: editSettings.edsConfig ? {
                accsHost: '',
                storeViewCode: '',
                customerGroup: '',
                repoName: editSettings.edsConfig.repoName || '',
                daLiveOrg: editSettings.edsConfig.daLiveOrg || '',
                daLiveSite: editSettings.edsConfig.daLiveSite || '',
                // Note: templateOwner, templateRepo, contentSource, patches are derived
                // from brand+stack in WelcomeStep, not stored per-project
                // Don't assume authenticated - let hooks validate tokens on step visit
                // Set user/org from saved config so UI can display them while checking
                githubAuth: (editSettings.edsConfig.githubOwner && editSettings.edsConfig.repoName) ? {
                    isAuthenticated: false,  // Will be validated by useGitHubAuth hook
                    isChecking: true,        // Indicate validation pending
                    user: { login: editSettings.edsConfig.githubOwner },
                } : undefined,
                daLiveAuth: editSettings.edsConfig.daLiveOrg ? {
                    isAuthenticated: false,  // Will be validated by useDaLiveAuth hook
                    isChecking: true,        // Indicate validation pending
                } : undefined,
                repoUrl: editSettings.edsConfig.repoUrl,
                // Pre-select GitHub repo if owner and name are available
                repoMode: (editSettings.edsConfig.githubOwner && editSettings.edsConfig.repoName) ? 'existing' : undefined,
                selectedRepo: (editSettings.edsConfig.githubOwner && editSettings.edsConfig.repoName) ? {
                    id: `${editSettings.edsConfig.githubOwner}/${editSettings.edsConfig.repoName}`,
                    name: editSettings.edsConfig.repoName,
                    fullName: `${editSettings.edsConfig.githubOwner}/${editSettings.edsConfig.repoName}`,
                    // Include htmlUrl for storefrontSetupHandlers which uses selectedRepo.htmlUrl
                    htmlUrl: `https://github.com/${editSettings.edsConfig.githubOwner}/${editSettings.edsConfig.repoName}`,
                } : undefined,
                // Pre-select DA.live site if site name is available
                selectedSite: editSettings.edsConfig.daLiveSite ? {
                    id: editSettings.edsConfig.daLiveSite,
                    name: editSettings.edsConfig.daLiveSite,
                } : undefined,
            } : undefined,
        };
    }

    // CREATE/IMPORT MODE: Use helper functions for cleaner initialization
    const initialComponents = initializeComponentsFromImport(importedSettings, componentDefaults);
    const adobeContext = initializeAdobeContextFromImport(importedSettings);
    const initialProjectName = initializeProjectName(importedSettings, existingProjectNames);

    // Determine wizard mode: 'import' if settings provided, otherwise 'create'
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
        adobeAuth: {
            isAuthenticated: false,  // Start as false, will be checked on auth step
            isChecking: false,       // Allow the check to proceed
        },
        components: initialComponents,
        adobeOrg: adobeContext.org,
        adobeProject: adobeContext.project,
        adobeWorkspace: adobeContext.workspace,
        // Package/Stack/Addons from imported settings
        selectedPackage: importedSettings?.selectedPackage,
        selectedStack: importedSettings?.selectedStack,
        selectedAddons: importedSettings?.selectedAddons,
        // EDS configuration from imported settings (for EDS stacks)
        // Construct selectedRepo and selectedSite objects for list pre-selection
        edsConfig: importedSettings?.edsConfig ? {
            accsHost: '',
            storeViewCode: '',
            customerGroup: '',
            repoName: importedSettings.edsConfig.repoName || '',
            daLiveOrg: importedSettings.edsConfig.daLiveOrg || '',
            daLiveSite: importedSettings.edsConfig.daLiveSite || '',
            // Note: templateOwner, templateRepo, contentSource, patches are derived
            // from brand+stack in WelcomeStep, not stored per-project
            // Mark GitHub/DA.live as authenticated since importing from existing project
            githubAuth: (importedSettings.edsConfig.githubOwner && importedSettings.edsConfig.repoName) ? {
                isAuthenticated: true,
                user: { login: importedSettings.edsConfig.githubOwner },
            } : undefined,
            daLiveAuth: importedSettings.edsConfig.daLiveOrg ? {
                isAuthenticated: true,
                org: importedSettings.edsConfig.daLiveOrg,
            } : undefined,
            repoUrl: importedSettings.edsConfig.repoUrl,
            // Pre-select GitHub repo if owner and name are available
            repoMode: (importedSettings.edsConfig.githubOwner && importedSettings.edsConfig.repoName) ? 'existing' : undefined,
            selectedRepo: (importedSettings.edsConfig.githubOwner && importedSettings.edsConfig.repoName) ? {
                id: `${importedSettings.edsConfig.githubOwner}/${importedSettings.edsConfig.repoName}`,
                name: importedSettings.edsConfig.repoName,
                fullName: `${importedSettings.edsConfig.githubOwner}/${importedSettings.edsConfig.repoName}`,
                // Include htmlUrl for storefrontSetupHandlers which uses selectedRepo.htmlUrl
                htmlUrl: `https://github.com/${importedSettings.edsConfig.githubOwner}/${importedSettings.edsConfig.repoName}`,
            } : undefined,
            // Pre-select DA.live site if site name is available
            selectedSite: importedSettings.edsConfig.daLiveSite ? {
                id: importedSettings.edsConfig.daLiveSite,
                name: importedSettings.edsConfig.daLiveSite,
            } : undefined,
        } : undefined,
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

        // Step 4: Apply stack-based and mode-based filtering
        const filteredSteps = filterStepsForStack(stepsWithConditions, selectedStack, {
            isEditMode: !!editProject,
        });

        return filteredSteps.map(step => ({
            id: step.id as WizardStep,
            name: step.name,
            description: step.description,
        }));
    }, [wizardSteps, stacks, state.selectedStack, editProject]);

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
                // Recompute which steps are still satisfied with the new state
                // IMPORTANT: Preserve any steps that were manually completed by user actions
                // Reset all org-dependent steps (project → workspace → mesh → settings)
                // These form a cascade: org owns projects, projects own workspaces,
                // workspaces own meshes, and settings may reference org credentials
                setCompletedSteps(prev => {
                    const orgDependentSteps: WizardStep[] = [
                        'adobe-project',
                        'adobe-workspace',
                        'settings',
                    ];
                    // Remove org-dependent steps that are no longer satisfied
                    const preserved = prev.filter(stepId => !orgDependentSteps.includes(stepId));
                    // Re-add org-dependent steps if still satisfied
                    const satisfiedOrgSteps = orgDependentSteps.filter(stepId =>
                        isStepSatisfied(stepId, state),
                    );
                    return [...preserved, ...satisfiedOrgSteps];
                });
                setConfirmedSteps(prev => {
                    const orgDependentSteps: WizardStep[] = [
                        'adobe-project',
                        'adobe-workspace',
                        'settings',
                    ];
                    const preserved = prev.filter(stepId => !orgDependentSteps.includes(stepId));
                    const satisfiedOrgSteps = orgDependentSteps.filter(stepId =>
                        isStepSatisfied(stepId, state),
                    );
                    return [...preserved, ...satisfiedOrgSteps];
                });
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
    const [isPreparingReview, setIsPreparingReview] = useState(false);

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
        isPreparingReview,
        setIsPreparingReview,
        componentsData,
        setComponentsData,
    };
}
