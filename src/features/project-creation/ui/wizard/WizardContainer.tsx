import {
    View,
    Flex,
    Heading,
    Button,
    Text,
} from '@adobe/react-spectrum';
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { TimelineNav } from './TimelineNav';
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
import { useFocusTrap } from '@/core/ui/hooks';

interface WizardContainerProps {
    componentDefaults?: ComponentSelection;
    wizardSteps?: { id: string; name: string; enabled: boolean }[];
}

// UI Constants (local to this component)
// Note: UI animation timings kept local (not in @/core/utils/timeoutConfig)
// because they're tied to CSS transitions, not backend operation timeouts
const STEP_TRANSITION_DURATION_MS = 300; // Matches CSS transition in <style> block

const LOADING_OVERLAY_STYLES = {
    container: {
        position: 'absolute' as const,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        borderRadius: '4px',
    },
    innerCircle: {
        backgroundColor: 'var(--spectrum-global-color-gray-50)',
        padding: '24px',
        borderRadius: '50%',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    spinner: {
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        border: '3px solid var(--spectrum-global-color-blue-400)',
        borderTopColor: 'transparent',
        animation: 'spin 1s linear infinite',
    },
};

// Helper: Build project configuration from wizard state
const buildProjectConfig = (wizardState: WizardState) => ({
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
});

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

export function WizardContainer({ componentDefaults, wizardSteps }: WizardContainerProps) {
    // Use the provided configuration, filtering out disabled steps
    // NOTE: Must filter before using in hooks to avoid conditional hook calls
    // Wrapped in useMemo to prevent changing on every render
    const WIZARD_STEPS = useMemo(() => {
        return (wizardSteps && wizardSteps.length > 0)
            ? wizardSteps.filter(step => step.enabled).map(step => ({ id: step.id as WizardStep, name: step.name }))
            : [];
    }, [wizardSteps]);

    const [state, setState] = useState<WizardState>({
        currentStep: 'welcome',
        projectName: '',
        projectTemplate: 'citisignal',
        componentConfigs: {},
        adobeAuth: {
            isAuthenticated: false,  // Start as false, will be checked on auth step
            isChecking: false,  // Allow the check to proceed
        },
        components: componentDefaults || undefined,
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

    // Store response from get-components-data handler (includes full component data with envVars)
    const [componentsData, setComponentsData] = useState<{
        success: boolean;
        type: string;
        data: ComponentsData;
    } | null>(null);

    // Listen for feedback messages from extension
    useEffect(() => {
        const unsubscribe = vscode.onMessage('feedback', (message: FeedbackMessage) => {
            // Update creation progress if in project-creation step
            if (state.currentStep === 'project-creation' && state.creationProgress) {
                setState(prev => {
                    const currentProgress = prev.creationProgress;
                    if (!currentProgress) return prev;

                    return {
                        ...prev,
                        creationProgress: {
                            ...currentProgress,
                            currentOperation: message.primary,
                            progress: message.progress || currentProgress.progress,
                            message: message.secondary || currentProgress.message,
                            logs: message.log
                                ? [...currentProgress.logs, message.log]
                                : currentProgress.logs,
                            error: message.error,
                        },
                    };
                });
            }
        });

        return unsubscribe;
    }, [state.currentStep, state.creationProgress]);

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
        // Small delay to let step render and transition complete
        const timer = setTimeout(() => {
            if (!stepContentRef.current) return;

            // Find first focusable element in step content (exclude footer buttons)
            const focusableSelector =
                'button:not([disabled]):not([tabindex="-1"]), ' +
                'input:not([disabled]):not([tabindex="-1"]), ' +
                'select:not([disabled]):not([tabindex="-1"]), ' +
                'textarea:not([disabled]):not([tabindex="-1"]), ' +
                '[tabindex]:not([tabindex="-1"])';

            const focusableElements = stepContentRef.current.querySelectorAll(focusableSelector);
            if (focusableElements.length > 0) {
                (focusableElements[0] as HTMLElement).focus();
            }
        }, 150); // Wait for step transition animation

        return () => clearTimeout(timer);
    }, [state.currentStep]);

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
                console.error('[WizardContainer] Failed to load components data:', error);
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

            // Wait for fade-out to complete, then update state and fade in
            setTimeout(() => {
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
            }, STEP_TRANSITION_DURATION_MS);
        } else {
            // For forward navigation, keep original behavior with delayed state update
            setTimeout(() => {
                setState(prev => ({ ...prev, currentStep: step }));
                setIsTransitioning(false);
            }, STEP_TRANSITION_DURATION_MS);
        }
    }, [WIZARD_STEPS]);

    // Timeline navigation (backward only)
    const goToStepViaTimeline = useCallback((step: WizardStep) => {
        const currentIndex = getCurrentStepIndex();
        const targetIndex = WIZARD_STEPS.findIndex(s => s.id === step);

        // Only allow backward navigation via timeline
        if (targetIndex > currentIndex) {
            return;
        }

        // Use internal navigation function
        navigateToStep(step, targetIndex, currentIndex);
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
                console.error('Failed to proceed to next step:', error);
                // Error display handled by backend via creationProgress feedback messages
                setIsConfirmingSelection(false);
            }
        }
    }, [state, completedSteps, highestCompletedStepIndex, getCurrentStepIndex, navigateToStep, WIZARD_STEPS]);

    const handleCancel = useCallback(() => {
        vscode.postMessage('cancel');
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
                return <WelcomeStep {...props} />;
            case 'component-selection':
                return <ComponentSelectionStep {...props} componentsData={componentsData as unknown as Record<string, unknown> | undefined} />;
            case 'prerequisites':
                return <PrerequisitesStep {...props} componentsData={componentsData as unknown as Record<string, unknown> | undefined} currentStep={state.currentStep} />;
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
            <div ref={wizardContainerRef as any} style={{ display: 'flex', height: '100%', width: '100%' }}>
                {/* Timeline Navigation */}
                <View 
                    width="size-3000" 
                    height="100%"
                    UNSAFE_className={cn('min-w-240', 'max-w-240')}
                >
                    <TimelineNav
                        steps={WIZARD_STEPS}
                        currentStep={state.currentStep}
                        completedSteps={completedSteps}
                        highestCompletedStepIndex={highestCompletedStepIndex}
                        onStepClick={goToStepViaTimeline}
                    />
                </View>

                {/* Content Area */}
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%', width: '100%' }}>
                    {/* Header */}
                    <View 
                        padding="size-400"
                        UNSAFE_className={cn('border-b', 'bg-gray-75')}
                    >
                        <Heading level={1} marginBottom="size-100">
                            Create Demo Project
                        </Heading>
                        <Heading level={3} UNSAFE_className={cn('font-normal', 'text-gray-600')}>
                            {currentStepName}
                        </Heading>
                    </View>

                    {/* Step Content */}
                    <div
                        ref={stepContentRef}
                        style={{ width: '100%', height: '100%', overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}
                    >
                        <div
                            style={{ height: '100%', width: '100%' }}
                            className={cn(
                                'step-content',
                                animationDirection,
                                isTransitioning && 'transitioning',
                                'transition-all',
                            )}
                        >
                            {renderStep()}
                        </div>

                        {/* Confirmation overlay during backend calls */}
                        {isConfirmingSelection && (
                            <div style={LOADING_OVERLAY_STYLES.container}>
                                <div style={LOADING_OVERLAY_STYLES.innerCircle}>
                                    <div style={LOADING_OVERLAY_STYLES.spinner} />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    {!isLastStep && (
                        <View
                            padding="size-400"
                            UNSAFE_className={cn('border-t', 'bg-gray-75')}
                        >
                            <div style={{ maxWidth: '800px', width: '100%' }}>
                                <Flex justifyContent="space-between" width="100%">
                                    <Button
                                        variant="secondary"
                                        onPress={handleCancel}
                                        isQuiet
                                        isDisabled={isConfirmingSelection}
                                    >
                                        Cancel
                                    </Button>
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
                                            {isConfirmingSelection
                                                ? 'Continue'
                                                : (currentStepIndex === WIZARD_STEPS.length - 2 ? 'Create Project' : 'Continue')
                                            }
                                        </Button>
                                    </Flex>
                                </Flex>
                            </div>
                        </View>
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