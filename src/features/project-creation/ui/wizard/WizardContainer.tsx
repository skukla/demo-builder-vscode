import {
    View,
    Flex,
    Heading,
    Button,
    Text,
} from '@adobe/react-spectrum';
import { PageHeader, PageFooter } from '@/core/ui/components/layout';
import { LoadingOverlay } from '@/core/ui/components/feedback';
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
    getNextButtonText,
    hasMeshComponentSelected,
    getCompletedStepIndices,
    getEnabledWizardSteps,
    getNavigationDirection,
    filterCompletedStepsForBackwardNav,
    getAdobeStepIndices,
    computeStateUpdatesForBackwardNav,
    initializeComponentsFromImport,
    initializeAdobeContextFromImport,
    initializeProjectName,
    getFirstEnabledStep,
    buildProjectConfig,
    ImportedSettings,
} from './wizardHelpers';
import { WizardStepRenderer } from './WizardStepRenderer';
import { useMeshDeployment } from '@/features/mesh/ui/steps/useMeshDeployment';
import type { ComponentsData } from '@/features/project-creation/ui/steps/ReviewStep';
import { WizardState, WizardStep, FeedbackMessage, ComponentSelection } from '@/types/webview';
import { cn } from '@/core/ui/utils/classNames';
import { hasValidTitle } from '@/core/ui/utils/titleHelpers';
import { vscode } from '@/core/ui/utils/vscode-api';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { webviewLogger } from '@/core/ui/utils/webviewLogger';
import { useFocusTrap, FOCUSABLE_SELECTOR } from '@/core/ui/hooks';
import { ErrorBoundary } from '@/core/ui/components/ErrorBoundary';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

const log = webviewLogger('WizardContainer');

// Note: ImportedSettings interface and generateUniqueProjectName moved to wizardHelpers.ts
// Re-export ImportedSettings for consumers that import from WizardContainer
export type { ImportedSettings };

interface WizardContainerProps {
    componentDefaults?: ComponentSelection;
    wizardSteps?: { id: string; name: string; enabled: boolean }[];
    existingProjectNames?: string[];
    importedSettings?: ImportedSettings | null;
}


// Helper: Handle backend calls for step transitions
const handleStepBackendCalls = async (currentStep: string, nextStepId: string, wizardState: WizardState) => {
    // Project selection: Commit the UI selection to backend
    if (currentStep === 'adobe-project' && wizardState.adobeProject?.id) {
        const result = await vscode.request('select-project', { projectId: wizardState.adobeProject.id }) as { success: boolean; error?: string };
        if (!result.success) {
            throw new Error(result.error || 'Failed to select project');
        }
    }

    // Workspace selection: Commit the UI selection to backend
    if (currentStep === 'adobe-workspace' && wizardState.adobeWorkspace?.id) {
        const result = await vscode.request('select-workspace', { workspaceId: wizardState.adobeWorkspace.id }) as { success: boolean; error?: string };
        if (!result.success) {
            throw new Error(result.error || 'Failed to select workspace');
        }
    }

    // Project creation: Trigger project creation when moving from review to project-creation step
    if (currentStep === 'review' && nextStepId === 'project-creation') {
        const projectConfig = buildProjectConfig(wizardState);
        vscode.createProject(projectConfig);
    }
};

export function WizardContainer({ componentDefaults, wizardSteps, existingProjectNames, importedSettings }: WizardContainerProps) {
    // Use the provided configuration, filtering out disabled steps
    // NOTE: Must filter before using in hooks to avoid conditional hook calls
    // Wrapped in useMemo to prevent changing on every render
    const WIZARD_STEPS = useMemo(() => getEnabledWizardSteps(wizardSteps), [wizardSteps]);

    // Note: Welcome step removed in Step 3 - wizard now starts at first enabled step
    // Compute initial step inside lazy initializer to use prop value on mount
    const [state, setState] = useState<WizardState>(() => {
        // Use helper functions for cleaner initialization
        const firstStep = getFirstEnabledStep(wizardSteps);
        const initialComponents = initializeComponentsFromImport(importedSettings, componentDefaults);
        const adobeContext = initializeAdobeContextFromImport(importedSettings);
        const initialProjectName = initializeProjectName(importedSettings, existingProjectNames || []);

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
                isChecking: false,  // Allow the check to proceed
            },
            components: initialComponents,
            adobeOrg: adobeContext.org,
            adobeProject: adobeContext.project,
            adobeWorkspace: adobeContext.workspace,
        };
    });

    const [canProceed, setCanProceed] = useState(false);
    const [completedSteps, setCompletedSteps] = useState<WizardStep[]>([]);
    const [highestCompletedStepIndex, setHighestCompletedStepIndex] = useState(-1);
    const [animationDirection, setAnimationDirection] = useState<'forward' | 'backward'>('forward');
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [isConfirmingSelection, setIsConfirmingSelection] = useState(false);
    const [isPreparingReview, setIsPreparingReview] = useState(false);

    // Mesh deployment hook - called unconditionally per Rules of Hooks
    // Only activates when mesh-deployment step is enabled AND mesh component selected
    const hasMeshComponent = useMemo(
        () => hasMeshComponentSelected(state.components),
        [state.components]
    );

    const meshDeployment = useMeshDeployment({
        hasMeshComponent: hasMeshComponent && state.currentStep === 'mesh-deployment',
        workspaceId: state.adobeWorkspace?.id,
    });

    // Focus trap for keyboard navigation (replaces manual implementation)
    const wizardContainerRef = useFocusTrap<HTMLDivElement>({
        enabled: true,
        autoFocus: false,  // Wizard steps manage their own focus
        containFocus: true,  // Prevent escape (WCAG 2.1 AA)
    });

    // Ref for step content area (to focus first element when step changes)
    const stepContentRef = useRef<HTMLDivElement>(null);

    // Ref for tracking navigation transition timeout (to prevent race conditions)
    const transitionTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Ref for import mode auto-navigation timers (cleanup on unmount)
    const importNavTimerRef = useRef<NodeJS.Timeout | null>(null);
    const importNavClearTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Store response from get-components-data handler (includes full component data with envVars)
    const [componentsData, setComponentsData] = useState<{
        success: boolean;
        type: string;
        data: ComponentsData;
    } | null>(null);

    // Hydrate project title from API if needed (handles old projects without projectTitle stored)
    // This runs once when wizard opens with copied/imported data that has title === name (fallback)
    useEffect(() => {
        const project = state.adobeProject;
        if (!project?.id || !project.name) return;
        if (hasValidTitle(project)) return;

        log.debug('Project title needs hydration, fetching from API', {
            id: project.id,
            currentTitle: project.title
        });

        // Fetch projects from API to get correct title
        webviewClient.request<{ success: boolean; data?: Array<{ id: string; name: string; title?: string }> }>('get-projects')
            .then(response => {
                const projects = response?.data;
                if (!Array.isArray(projects)) return;

                const matchingProject = projects.find(p => p.id === project.id);
                if (hasValidTitle(matchingProject)) {
                    log.info('Hydrating project title from API', {
                        from: project.title,
                        to: matchingProject?.title
                    });
                    setState(prev => ({
                        ...prev,
                        adobeProject: {
                            ...prev.adobeProject!,
                            title: matchingProject?.title,
                        },
                    }));
                }
            })
            .catch(err => {
                log.warn('Failed to hydrate project title', err);
            });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Run once on mount - intentionally not reactive to state changes

    // Listen for feedback messages from extension
    // Register ONCE on mount - check conditions inside functional update to avoid stale closures
    useEffect(() => {
        const unsubscribe = vscode.onMessage('feedback', (message: FeedbackMessage) => {
            // Use functional update to check conditions with current state (no stale closures)
            setState(prev => {
                // Only update if in project-creation step with active progress
                if (prev.currentStep !== 'project-creation' || !prev.creationProgress) {
                    return prev; // No change
                }

                return {
                    ...prev,
                    creationProgress: {
                        ...prev.creationProgress,
                        currentOperation: message.primary,
                        progress: message.progress || prev.creationProgress.progress,
                        message: message.secondary || prev.creationProgress.message,
                        logs: message.log
                            ? [...prev.creationProgress.logs, message.log]
                            : prev.creationProgress.logs,
                        error: message.error,
                    },
                };
            });
        });

        return unsubscribe;
    }, []); // Empty deps - register listener ONCE to prevent re-registration

    // Listen for creationProgress messages from extension
    useEffect(() => {
        const unsubscribe = vscode.onMessage('creationProgress', (progressData: unknown) => {
            // Type guard: ensure progressData has expected shape
            const data = progressData as {
                currentOperation?: string;
                progress?: number;
                message?: string;
                logs?: string[];
                error?: string;
            };
            setState(prev => ({
                ...prev,
                creationProgress: {
                    currentOperation: data.currentOperation || 'Processing',
                    progress: data.progress || 0,
                    message: data.message || '',
                    logs: data.logs || [],
                    error: data.error,
                },
            }));
        });

        return unsubscribe;
    }, []);

    // Auto-focus first element in step content when step changes
    useEffect(() => {
        // Don't auto-focus on steps that manage their own focus or use natural tab order
        // - component-selection, component-config: Complex Spectrum components with delayed rendering
        // - prerequisites: Natural tab order works better (Recheck button is first)
        const selfManagedFocusSteps = new Set(['component-selection', 'component-config', 'prerequisites']);

        if (selfManagedFocusSteps.has(state.currentStep)) {
            // Step handles its own focus management or uses natural tab order
            return;
        }

        // Longer delay to let step render, transition complete, and Spectrum components mount
        const timer = setTimeout(() => {
            if (!stepContentRef.current) return;

            // Find first focusable element in step content (includes native elements and Spectrum ARIA roles)
            const focusableElements = stepContentRef.current.querySelectorAll(FOCUSABLE_SELECTOR);

            if (focusableElements.length > 0) {
                (focusableElements[0] as HTMLElement).focus();
            }
        }, TIMEOUTS.STEP_CONTENT_FOCUS);

        return () => clearTimeout(timer);
    }, [state.currentStep]);

    // Cleanup all timers on unmount (prevents memory leaks and state updates on unmounted component)
    useEffect(() => {
        return () => {
            if (transitionTimerRef.current) {
                clearTimeout(transitionTimerRef.current);
                transitionTimerRef.current = null;
            }
            if (importNavTimerRef.current) {
                clearTimeout(importNavTimerRef.current);
                importNavTimerRef.current = null;
            }
            if (importNavClearTimerRef.current) {
                clearTimeout(importNavClearTimerRef.current);
                importNavClearTimerRef.current = null;
            }
        };
    }, []);

    // Notify sidebar of step changes (for wizard progress display)
    useEffect(() => {
        const stepIndex = WIZARD_STEPS.findIndex(step => step.id === state.currentStep);
        if (stepIndex >= 0) {
            // Step numbers are 1-indexed for display, also send completed steps for clickability
            vscode.postMessage('wizardStepChanged', {
                step: stepIndex + 1,
                completedSteps: getCompletedStepIndices(completedSteps, WIZARD_STEPS),
            });
        }
    }, [state.currentStep, completedSteps, WIZARD_STEPS]);

    // Note: We no longer auto-close the wizard on success
    // The ProjectCreationStep has Browse Files and Close buttons instead

    // Track whether we've already requested components (prevent double-load in StrictMode)
    const componentsRequestedRef = useRef(false);

    // Load full component data with envVars using request-response pattern
    useEffect(() => {
        const loadData = async () => {
            if (componentsRequestedRef.current) {
                return; // Prevent double-load in StrictMode
            }
            componentsRequestedRef.current = true;

            try {
                const response = await vscode.request<{
                    success: boolean;
                    type: string;
                    data: ComponentsData;
                }>('get-components-data');

                setComponentsData(response);
            } catch (error) {
                log.error('Failed to load components data', error instanceof Error ? error : undefined);
            }
        };

        loadData();
    }, []);

    const getCurrentStepIndex = useCallback(() => {
        return WIZARD_STEPS.findIndex(step => step.id === state.currentStep);
    }, [state.currentStep, WIZARD_STEPS]);

    // Internal navigation function used by both timeline and Continue button
    const navigateToStep = useCallback((step: WizardStep, targetIndex: number, currentIndex: number) => {
        // Use helper function for direction
        setAnimationDirection(getNavigationDirection(targetIndex, currentIndex));
        setIsTransitioning(true);

        // If moving backward, remove completions for the target step and all steps after it
        if (targetIndex < currentIndex) {
            // Use helper function for filtering completed steps
            setCompletedSteps(prev =>
                filterCompletedStepsForBackwardNav(prev, step, targetIndex, WIZARD_STEPS)
            );

            // Get Adobe step indices for state clearing logic
            const adobeIndices = getAdobeStepIndices(WIZARD_STEPS);

            // Clear any existing transition timer to prevent race conditions
            if (transitionTimerRef.current) {
                clearTimeout(transitionTimerRef.current);
            }

            // Wait for fade-out to complete, then update state and fade in
            transitionTimerRef.current = setTimeout(() => {
                setState(prev => {
                    // Use helper function for state updates
                    const updates = computeStateUpdatesForBackwardNav(
                        prev,
                        step,
                        targetIndex,
                        adobeIndices
                    );
                    return { ...prev, ...updates };
                });
                setIsTransitioning(false);
                transitionTimerRef.current = null;
            }, TIMEOUTS.STEP_TRANSITION);
        } else {
            // Clear any existing transition timer to prevent race conditions
            if (transitionTimerRef.current) {
                clearTimeout(transitionTimerRef.current);
            }

            // For forward navigation, keep original behavior with delayed state update
            transitionTimerRef.current = setTimeout(() => {
                setState(prev => ({ ...prev, currentStep: step }));
                setIsTransitioning(false);
                transitionTimerRef.current = null;
            }, TIMEOUTS.STEP_TRANSITION);
        }
    }, [WIZARD_STEPS]);

    // Listen for navigation requests from sidebar (must be after getCurrentStepIndex and navigateToStep)
    useEffect(() => {
        const unsubscribe = vscode.onMessage('navigateToStep', (data: { stepIndex: number }) => {
            const targetIndex = data.stepIndex;
            const currentIndex = getCurrentStepIndex();

            // Only allow backward navigation (to completed steps)
            if (targetIndex < currentIndex && targetIndex >= 0) {
                const targetStep = WIZARD_STEPS[targetIndex];
                if (targetStep) {
                    navigateToStep(targetStep.id, targetIndex, currentIndex);
                }
            }
        });

        return unsubscribe;
    }, [getCurrentStepIndex, navigateToStep, WIZARD_STEPS]);

    // Note: Import mode navigation now handled in goNext (not auto-triggered)
    // This allows user to see auth success before clicking Continue to proceed

    const goNext = useCallback(async () => {
        const currentIndex = getCurrentStepIndex();

        // IMPORT MODE: Skip to review when clicking Continue on auth step
        // User sees auth success, clicks Continue, then sees "Preparing review" before landing on review
        if (importedSettings && state.currentStep === 'adobe-auth') {
            const reviewIndex = WIZARD_STEPS.findIndex(step => step.id === 'review');
            if (reviewIndex === -1) {
                log.warn('Review step not found in wizard steps');
                return;
            }

            log.info('Import mode: navigating from auth to review');

            // Show preparing overlay (replaces current view content)
            setIsPreparingReview(true);

            // Brief delay to show the preparing message before navigating
            importNavTimerRef.current = setTimeout(() => {
                // Mark all steps before review as completed (so user can navigate back)
                const stepsToComplete: WizardStep[] = [];
                for (let i = 0; i < reviewIndex; i++) {
                    stepsToComplete.push(WIZARD_STEPS[i].id);
                }
                setCompletedSteps(stepsToComplete);
                setHighestCompletedStepIndex(reviewIndex - 1);

                // Navigate to review
                navigateToStep('review', reviewIndex, currentIndex);

                // Clear loading state after navigation completes
                importNavClearTimerRef.current = setTimeout(() => {
                    setIsPreparingReview(false);
                }, TIMEOUTS.STEP_TRANSITION);
            }, TIMEOUTS.IMPORT_TRANSITION_FEEDBACK);

            return; // Exit early - don't do normal navigation
        }

        if (currentIndex < WIZARD_STEPS.length - 1) {
            const nextStep = WIZARD_STEPS[currentIndex + 1];

            // BACKEND CALL ON CONTINUE PATTERN:
            // User selections update UI state immediately (in step components)
            // Actual backend operations happen here when user commits via Continue
            try {
                // Show loading overlay while backend operations execute
                setIsConfirmingSelection(true);

                // Execute backend calls for step transition
                await handleStepBackendCalls(state.currentStep, nextStep.id, state);

                // Mark current step as completed only after successful backend operation
                if (!completedSteps.includes(state.currentStep)) {
                    setCompletedSteps(prev => [...prev, state.currentStep]);
                    setHighestCompletedStepIndex(Math.max(highestCompletedStepIndex, currentIndex));
                }

                // Clear loading overlay and proceed to next step
                setIsConfirmingSelection(false);
                navigateToStep(nextStep.id, currentIndex + 1, currentIndex);

            } catch (error) {
                log.error('Failed to proceed to next step', error instanceof Error ? error : undefined);
                // Error display handled by backend via creationProgress feedback messages
                setIsConfirmingSelection(false);
            }
        }
    }, [state, completedSteps, highestCompletedStepIndex, getCurrentStepIndex, navigateToStep, WIZARD_STEPS, importedSettings]);

    const handleCancel = useCallback(() => {
        vscode.postMessage('cancel');
    }, []);

    const handleShowLogs = useCallback(() => {
        vscode.postMessage('show-logs');
    }, []);

    const goBack = useCallback(() => {
        const currentIndex = getCurrentStepIndex();
        if (currentIndex === 0) {
            // On first step, go back means cancel and return to welcome
            handleCancel();
        } else if (currentIndex > 0) {
            const targetIndex = currentIndex - 1;
            navigateToStep(WIZARD_STEPS[targetIndex].id, targetIndex, currentIndex);
        }
    }, [getCurrentStepIndex, navigateToStep, handleCancel, WIZARD_STEPS]);

    const updateState = useCallback((updates: Partial<WizardState>) => {
        setState(prev => ({ ...prev, ...updates }));
    }, []);

    // Handle cancel from mesh deployment step
    // This triggers project cleanup and returns to wizard start
    const handleMeshDeploymentCancel = useCallback(() => {
        // Send cancel message to extension for cleanup
        vscode.postMessage('cancel-project-creation');
        // Also trigger standard cancel to close wizard
        handleCancel();
    }, [handleCancel]);

    // Configuration error check - AFTER all hooks to comply with Rules of Hooks
    if (WIZARD_STEPS.length === 0) {
        return (
            <View padding="size-400" height="100vh">
                <Heading level={2}>Configuration Error</Heading>
                <Text>Wizard configuration not loaded. Please restart the extension.</Text>
            </View>
        );
    }

    const currentStepIndex = getCurrentStepIndex();
    const isLastStep = state.currentStep === 'project-creation';
    const currentStepName = WIZARD_STEPS[currentStepIndex]?.name;

    return (
        <View
            backgroundColor="gray-50"
            width="100%"
            height="100vh"
            UNSAFE_className={cn('flex', 'overflow-hidden')}
        >
            <div ref={wizardContainerRef} className="flex h-full w-full">
                {/* Content Area - Timeline moved to sidebar */}
                <div className="flex-column flex-1 h-full w-full">
                    {/* Header */}
                    <PageHeader
                        title="Create Demo Project"
                        subtitle={currentStepName}
                    />

                    {/* Step Content */}
                    <div
                        ref={stepContentRef}
                        className="w-full h-full overflow-y-auto overflow-x-hidden relative"
                    >
                        <div
                            className={cn(
                                'h-full',
                                'w-full',
                                'step-content',
                                animationDirection,
                                isTransitioning && 'transitioning',
                                'transition-all',
                            )}
                        >
                            <ErrorBoundary
                                key={state.currentStep}
                                onError={(error) => log.error('Step error:', error)}
                            >
                                <WizardStepRenderer
                                    currentStep={state.currentStep}
                                    state={state}
                                    updateState={updateState}
                                    onNext={goNext}
                                    onBack={goBack}
                                    setCanProceed={setCanProceed}
                                    componentsData={componentsData}
                                    completedSteps={completedSteps}
                                    existingProjectNames={existingProjectNames}
                                    isPreparingReview={isPreparingReview}
                                    meshDeploymentState={meshDeployment.state}
                                    onMeshRetry={meshDeployment.retry}
                                    onMeshCancel={handleMeshDeploymentCancel}
                                />
                            </ErrorBoundary>
                        </div>

                        {/* Confirmation overlay during backend calls */}
                        <LoadingOverlay isVisible={isConfirmingSelection} />
                    </div>

                    {/* Footer - hidden on project-creation, mesh-deployment (own buttons), and during preparing review transition */}
                    {!isLastStep && state.currentStep !== 'mesh-deployment' && !isPreparingReview && (
                        <PageFooter
                            leftContent={
                                <Button
                                    variant="secondary"
                                    onPress={handleCancel}
                                    isQuiet
                                    isDisabled={isConfirmingSelection}
                                >
                                    Cancel
                                </Button>
                            }
                            centerContent={
                                <Button
                                    variant="secondary"
                                    onPress={handleShowLogs}
                                    isQuiet
                                >
                                    Logs
                                </Button>
                            }
                            rightContent={
                                <Flex gap="size-100">
                                    {currentStepIndex > 0 && (
                                        <Button
                                            variant="secondary"
                                            onPress={goBack}
                                            isQuiet
                                            isDisabled={isConfirmingSelection}
                                        >
                                            Back
                                        </Button>
                                    )}
                                    <Button
                                        variant="accent"
                                        onPress={goNext}
                                        isDisabled={!canProceed || isConfirmingSelection}
                                    >
                                        {getNextButtonText(isConfirmingSelection, currentStepIndex, WIZARD_STEPS.length)}
                                    </Button>
                                </Flex>
                            }
                            constrainWidth={true}
                        />
                    )}
                </div>
            </div>
        </View>
    );
}