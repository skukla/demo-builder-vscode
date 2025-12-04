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
import { getNextButtonText } from './wizardHelpers';
import { AdobeAuthStep } from '@/features/authentication/ui/steps/AdobeAuthStep';
import { AdobeProjectStep } from '@/features/authentication/ui/steps/AdobeProjectStep';
import { AdobeWorkspaceStep } from '@/features/authentication/ui/steps/AdobeWorkspaceStep';
import { ComponentConfigStep } from '@/features/components/ui/steps/ComponentConfigStep';
import { ComponentSelectionStep } from '@/features/components/ui/steps/ComponentSelectionStep';
import { ApiMeshStep } from '@/features/mesh/ui/steps/ApiMeshStep';
import { PrerequisitesStep } from '@/features/prerequisites/ui/steps/PrerequisitesStep';
import { ProjectCreationStep } from '@/features/project-creation/ui/steps/ProjectCreationStep';
import { ReviewStep, ComponentsData } from '@/features/project-creation/ui/steps/ReviewStep';
import { WelcomeStep } from '@/features/project-creation/ui/steps/WelcomeStep';
import { WizardState, WizardStep, FeedbackMessage, ComponentSelection } from '@/types/webview';
import { cn } from '@/core/ui/utils/classNames';
import { vscode } from '@/core/ui/utils/vscode-api';
import { webviewLogger } from '@/core/ui/utils/webviewLogger';
import { useFocusTrap, FOCUSABLE_SELECTOR } from '@/core/ui/hooks';
import { ErrorBoundary } from '@/core/ui/components/ErrorBoundary';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

const log = webviewLogger('WizardContainer');

interface WizardContainerProps {
    componentDefaults?: ComponentSelection;
    wizardSteps?: { id: string; name: string; enabled: boolean }[];
    existingProjectNames?: string[];
}


// Helper: Build project configuration from wizard state
const buildProjectConfig = (wizardState: WizardState) => {
    const config = {
        projectName: wizardState.projectName,
        projectTemplate: wizardState.projectTemplate,
        adobe: {
            organization: wizardState.adobeOrg?.id,
            projectId: wizardState.adobeProject?.id,
            projectName: wizardState.adobeProject?.name,
            workspace: wizardState.adobeWorkspace?.id,
            workspaceName: wizardState.adobeWorkspace?.name,
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

    return config;
};

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

export function WizardContainer({ componentDefaults, wizardSteps, existingProjectNames }: WizardContainerProps) {
    // Use the provided configuration, filtering out disabled steps
    // NOTE: Must filter before using in hooks to avoid conditional hook calls
    // Wrapped in useMemo to prevent changing on every render
    const WIZARD_STEPS = useMemo(() => {
        return (wizardSteps && wizardSteps.length > 0)
            ? wizardSteps.filter(step => step.enabled).map(step => ({ id: step.id as WizardStep, name: step.name }))
            : [];
    }, [wizardSteps]);

    // Note: Welcome step removed in Step 3 - wizard now starts at first enabled step
    // Compute initial step inside lazy initializer to use prop value on mount
    const [state, setState] = useState<WizardState>(() => {
        const enabledSteps = wizardSteps?.filter(step => step.enabled) || [];
        const firstStep = (enabledSteps.length > 0 ? enabledSteps[0].id : 'adobe-auth') as WizardStep;
        return {
            currentStep: firstStep,
            projectName: '',
            projectTemplate: 'citisignal',
            componentConfigs: {},
            adobeAuth: {
                isAuthenticated: false,  // Start as false, will be checked on auth step
                isChecking: false,  // Allow the check to proceed
            },
            components: componentDefaults || undefined,
        };
    });

    const [canProceed, setCanProceed] = useState(false);
    const [completedSteps, setCompletedSteps] = useState<WizardStep[]>([]);
    const [highestCompletedStepIndex, setHighestCompletedStepIndex] = useState(-1);
    const [animationDirection, setAnimationDirection] = useState<'forward' | 'backward'>('forward');
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [isConfirmingSelection, setIsConfirmingSelection] = useState(false);

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

    // Store response from get-components-data handler (includes full component data with envVars)
    const [componentsData, setComponentsData] = useState<{
        success: boolean;
        type: string;
        data: ComponentsData;
    } | null>(null);

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

    // Cleanup transition timer on unmount
    useEffect(() => {
        return () => {
            if (transitionTimerRef.current) {
                clearTimeout(transitionTimerRef.current);
                transitionTimerRef.current = null;
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
                completedSteps: completedSteps.map(s => WIZARD_STEPS.findIndex(ws => ws.id === s)),
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
        setAnimationDirection(targetIndex > currentIndex ? 'forward' : 'backward');
        setIsTransitioning(true);

        // If moving backward, remove completions for the target step and all steps after it
        if (targetIndex < currentIndex) {
            // Special case for first step - clear all completions
            if (targetIndex === 0) {
                setCompletedSteps([]);
            } else {
                // Normal backward navigation logic
                setCompletedSteps(prev => {
                    const filtered = prev.filter(completedStep => {
                        // For the target step, always remove it
                        if (completedStep === step) {
                            return false;
                        }

                        // For other steps, keep only those before the target
                        const stepIndex = WIZARD_STEPS.findIndex(ws => ws.id === completedStep);
                        return stepIndex < targetIndex;
                    });

                    return filtered;
                });
            }

            // For backward navigation, prepare state changes but don't switch step yet
            // This prevents showing new content during fade-out animation
            const workspaceIndex = WIZARD_STEPS.findIndex(s => s.id === 'adobe-workspace');
            const projectIndex = WIZARD_STEPS.findIndex(s => s.id === 'adobe-project');

            // Clear any existing transition timer to prevent race conditions
            if (transitionTimerRef.current) {
                clearTimeout(transitionTimerRef.current);
            }

            // Wait for fade-out to complete, then update state and fade in
            transitionTimerRef.current = setTimeout(() => {
                setState(prev => {
                    const newState = { ...prev, currentStep: step };

                    // Clear selections only when going BEFORE selection steps (not TO them)
                    // Clear workspace and its cache when going before workspace step
                    if (workspaceIndex !== -1 && targetIndex < workspaceIndex) {
                        newState.adobeWorkspace = undefined;
                        newState.workspacesCache = undefined;
                    }

                    // Clear project and its cache (plus dependent caches) when going before project step
                    if (projectIndex !== -1 && targetIndex < projectIndex) {
                        newState.adobeProject = undefined;
                        newState.projectsCache = undefined;
                        // Also clear workspace cache since workspaces are project-specific
                        newState.adobeWorkspace = undefined;
                        newState.workspacesCache = undefined;
                    }

                    return newState;
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

    const goNext = useCallback(async () => {
        const currentIndex = getCurrentStepIndex();

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
    }, [state, completedSteps, highestCompletedStepIndex, getCurrentStepIndex, navigateToStep, WIZARD_STEPS]);

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

    const renderStep = () => {
        const props = {
            state,
            updateState,
            onNext: goNext,
            onBack: goBack,
            setCanProceed,
            componentsData,
        };

        switch (state.currentStep) {
            case 'welcome':
                return <WelcomeStep {...props} existingProjectNames={existingProjectNames} />;
            case 'component-selection':
                return <ComponentSelectionStep {...props} componentsData={componentsData?.data as Record<string, unknown>} />;
            case 'prerequisites':
                return <PrerequisitesStep {...props} componentsData={componentsData?.data as Record<string, unknown>} currentStep={state.currentStep} />;
            case 'adobe-auth':
                return <AdobeAuthStep {...props} />;
            case 'adobe-project':
                return <AdobeProjectStep {...props} completedSteps={completedSteps} />;
            case 'adobe-workspace':
                return <AdobeWorkspaceStep {...props} completedSteps={completedSteps} />;
            case 'api-mesh':
                return <ApiMeshStep {...props} completedSteps={completedSteps} />;
            case 'settings':
                return <ComponentConfigStep {...props} />;
            case 'review':
                return <ReviewStep state={state} updateState={updateState} setCanProceed={setCanProceed} componentsData={componentsData?.data} />;
            case 'project-creation':
                return <ProjectCreationStep state={state} onBack={goBack} />;
            default:
                return null;
        }
    };

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
                                {renderStep()}
                            </ErrorBoundary>
                        </div>

                        {/* Confirmation overlay during backend calls */}
                        <LoadingOverlay isVisible={isConfirmingSelection} />
                    </div>

                    {/* Footer */}
                    {!isLastStep && (
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
                                    <Button
                                        variant="secondary"
                                        onPress={goBack}
                                        isQuiet
                                        isDisabled={isConfirmingSelection}
                                    >
                                        Back
                                    </Button>
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

            <style>{`
                .step-content {
                    opacity: 1;
                    transform: translateX(0);
                }
                
                .step-content.transitioning {
                    opacity: 0;
                }
                
                .step-content.transitioning.forward {
                    transform: translateX(-20px);
                }
                
                .step-content.transitioning.backward {
                    transform: translateX(20px);
                }

                @keyframes slideInFromRight {
                    from {
                        opacity: 0;
                        transform: translateX(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(0);
                    }
                }

                @keyframes slideInFromLeft {
                    from {
                        opacity: 0;
                        transform: translateX(-20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(0);
                    }
                }
            `}</style>
        </View>
    );
}