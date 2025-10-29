import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
    View,
    Flex,
    Heading,
    Button,
    Text
} from '@adobe/react-spectrum';
import { WizardState, WizardStep, FeedbackMessage, ComponentSelection } from '@/webview-ui/shared/types';
import { TimelineNav } from './TimelineNav';
import { WelcomeStep } from '@/features/project-creation/ui/steps/WelcomeStep';
import { ComponentSelectionStep } from '@/features/components/ui/steps/ComponentSelectionStep';
import { PrerequisitesStep } from '@/features/prerequisites/ui/steps/PrerequisitesStep';
import { AdobeAuthStep } from '@/features/authentication/ui/steps/AdobeAuthStep';
import { AdobeProjectStep } from '@/features/authentication/ui/steps/AdobeProjectStep';
import { AdobeWorkspaceStep } from '@/features/authentication/ui/steps/AdobeWorkspaceStep';
import { ApiMeshStep } from '@/features/mesh/ui/steps/ApiMeshStep';
import { ComponentConfigStep } from '@/features/components/ui/steps/ComponentConfigStep';
import { ReviewStep } from '@/features/project-creation/ui/steps/ReviewStep';
import { ProjectCreationStep } from '@/features/project-creation/ui/steps/ProjectCreationStep';
import { vscode } from '@/webview-ui/shared/vscode-api';
import { cn } from '@/webview-ui/shared/utils/classNames';

interface WizardContainerProps {
    componentDefaults?: ComponentSelection;
    wizardSteps?: { id: string; name: string; enabled: boolean }[];
}

export function WizardContainer({ componentDefaults, wizardSteps }: WizardContainerProps) {
    // Configuration is required - no fallback
    if (!wizardSteps || wizardSteps.length === 0) {
        return (
            <View padding="size-400" height="100vh">
                <Heading level={2}>Configuration Error</Heading>
                <Text>Wizard configuration not loaded. Please restart the extension.</Text>
            </View>
        );
    }
    
    // Use the provided configuration, filtering out disabled steps
    const WIZARD_STEPS = wizardSteps
        .filter(step => step.enabled)
        .map(step => ({ id: step.id as WizardStep, name: step.name }));
    
    const [state, setState] = useState<WizardState>({
        currentStep: 'welcome',
        projectName: '',
        projectTemplate: 'commerce-paas',
        componentConfigs: {},
        adobeAuth: {
            isAuthenticated: undefined,  // Start as undefined to indicate not yet checked
            isChecking: false  // Allow the check to proceed
        },
        components: componentDefaults || undefined
    });

    const [canProceed, setCanProceed] = useState(false);
    const [feedback, setFeedback] = useState<FeedbackMessage | null>(null);
    const [completedSteps, setCompletedSteps] = useState<WizardStep[]>([]);
    const [highestCompletedStepIndex, setHighestCompletedStepIndex] = useState(-1);
    const [animationDirection, setAnimationDirection] = useState<'forward' | 'backward'>('forward');
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [isConfirmingSelection, setIsConfirmingSelection] = useState(false);
    const [componentsData, setComponentsData] = useState<import('@/types/components').ComponentRegistry | null>(null);

    // Listen for feedback messages from extension
    useEffect(() => {
        const unsubscribe = vscode.onMessage('feedback', (message: FeedbackMessage) => {
            setFeedback(message);
            
            // Update creation progress if in project-creation step
            if (state.currentStep === 'project-creation' && state.creationProgress) {
                setState(prev => ({
                    ...prev,
                    creationProgress: {
                        ...prev.creationProgress!,
                        currentOperation: message.primary,
                        progress: message.progress || prev.creationProgress!.progress,
                        message: message.secondary || prev.creationProgress!.message,
                        logs: message.log 
                            ? [...prev.creationProgress!.logs, message.log]
                            : prev.creationProgress!.logs,
                        error: message.error
                    }
                }));
            }
        });

        return unsubscribe;
    }, [state.currentStep, state.creationProgress]);

    // Listen for creationProgress messages from extension
    useEffect(() => {
        const unsubscribe = vscode.onMessage('creationProgress', (progressData: unknown) => {
            console.log('Received creationProgress:', progressData);
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
                    error: data.error
                }
            }));
        });

        return unsubscribe;
    }, []);

    // Note: We no longer auto-close the wizard on success
    // The ProjectCreationStep has Browse Files and Close buttons instead

    // Listen for components data from extension
    useEffect(() => {
        const unsubscribe = vscode.onMessage('componentsLoaded', (data: unknown) => {
            console.log('Received components data:', data);
            // Type assertion: data is expected to be ComponentConfigs from extension
            setComponentsData(data as ComponentConfigs);
        });

        // Request components when component mounts
        vscode.postMessage('loadComponents');

        return unsubscribe;
    }, []);

    const getCurrentStepIndex = useCallback(() => {
        return WIZARD_STEPS.findIndex(step => step.id === state.currentStep);
    }, [state.currentStep]);

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
            }, 300);
        } else {
            // For forward navigation, keep original behavior with delayed state update
            setTimeout(() => {
                setState(prev => ({ ...prev, currentStep: step }));
                setIsTransitioning(false);
            }, 300);
        }
    }, []);

    // Timeline navigation (backward only)
    const goToStepViaTimeline = useCallback((step: WizardStep) => {
        console.log('Timeline navigation to:', step);
        const currentIndex = getCurrentStepIndex();
        const targetIndex = WIZARD_STEPS.findIndex(s => s.id === step);

        // Only allow backward navigation via timeline
        if (targetIndex > currentIndex) {
            console.log('Forward navigation must use Continue button');
            return;
        }

        // Use internal navigation function
        navigateToStep(step, targetIndex, currentIndex);
    }, [getCurrentStepIndex, navigateToStep]);

    const goNext = useCallback(async () => {
        const currentIndex = getCurrentStepIndex();

        if (currentIndex < WIZARD_STEPS.length - 1) {
            const nextStep = WIZARD_STEPS[currentIndex + 1];

            // BACKEND CALL ON CONTINUE PATTERN:
            // User selections update UI state immediately (in step components)
            // Actual backend operations happen here when user commits via Continue
            try {
                // Show loading overlay while backend operations execute
                // Content remains visible, buttons disabled
                setIsConfirmingSelection(true);

                // Project selection: Commit the UI selection to backend
                if (state.currentStep === 'adobe-project' && state.adobeProject?.id) {
                    console.log('Making backend call to select project:', state.adobeProject.id);
                    const result = await vscode.request('select-project', { projectId: state.adobeProject.id });
                    if (!result.success) {
                        throw new Error(result.error || 'Failed to select project');
                    }
                }

                // Workspace selection: Commit the UI selection to backend
                if (state.currentStep === 'adobe-workspace' && state.adobeWorkspace?.id) {
                    console.log('Making backend call to select workspace:', state.adobeWorkspace.id);
                    const result = await vscode.request('select-workspace', { workspaceId: state.adobeWorkspace.id });
                    if (!result.success) {
                        throw new Error(result.error || 'Failed to select workspace');
                    }
                }

                // Project creation: Trigger project creation when moving from review to project-creation step
                if (state.currentStep === 'review' && nextStep.id === 'project-creation') {
                    console.log('Triggering project creation with state:', state);
                    
                    // Build project configuration from wizard state
                    const projectConfig = {
                        projectName: state.projectName,
                        projectTemplate: state.projectTemplate,
                        adobe: {
                            organization: state.adobeOrg?.id,
                            projectId: state.adobeProject?.id,
                            projectName: state.adobeProject?.name,
                            workspace: state.adobeWorkspace?.id,
                            workspaceName: state.adobeWorkspace?.name
                        },
                        components: {
                            frontend: state.components?.frontend,
                            backend: state.components?.backend,
                            dependencies: state.components?.dependencies || [],
                            externalSystems: state.components?.externalSystems || [],
                            appBuilderApps: state.components?.appBuilderApps || []
                        },
                        apiMesh: state.apiMesh,
                        componentConfigs: state.componentConfigs
                    };
                    
                    // Send to backend - don't await, let it run asynchronously
                    vscode.createProject(projectConfig);
                }

                // Mark current step as completed only after successful backend operation
                if (!completedSteps.includes(state.currentStep)) {
                    setCompletedSteps(prev => [...prev, state.currentStep]);
                    // Track the highest completed step index for navigation purposes
                    setHighestCompletedStepIndex(Math.max(highestCompletedStepIndex, currentIndex));
                }

                // Clear loading overlay before transition
                setIsConfirmingSelection(false);

                // Proceed to next step now that backend is synchronized
                navigateToStep(nextStep.id, currentIndex + 1, currentIndex);

            } catch (error) {
                console.error('Failed to proceed to next step:', error);
                setFeedback({
                    type: 'error',
                    message: error instanceof Error ? error.message : 'Failed to proceed. Please try again.'
                });
                // Clear loading state on error
                setIsConfirmingSelection(false);
            }
        } else {
            console.log('Already at last step');
        }
    }, [state.currentStep, state.adobeProject, state.adobeWorkspace, completedSteps, canProceed, getCurrentStepIndex, navigateToStep]);

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
    }, [getCurrentStepIndex, navigateToStep, handleCancel]);

    const updateState = useCallback((updates: Partial<WizardState>) => {
        setState(prev => ({ ...prev, ...updates }));
    }, []);

    // Focus trap for tab navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Tab') {
                // Get all focusable elements within the wizard
                const focusableElements = document.querySelectorAll(
                    'button:not([disabled]):not([tabindex="-1"]), ' +
                    'input:not([disabled]):not([tabindex="-1"]), ' +
                    'select:not([disabled]):not([tabindex="-1"]), ' +
                    'textarea:not([disabled]):not([tabindex="-1"]), ' +
                    '[tabindex]:not([tabindex="-1"]):not([tabindex="0"])'
                );

                const focusableArray = Array.from(focusableElements);
                if (focusableArray.length === 0) return;

                const currentIndex = focusableArray.indexOf(document.activeElement as HTMLElement);

                e.preventDefault(); // Prevent default tab behavior

                if (e.shiftKey) {
                    // Shift+Tab - go backwards
                    const nextIndex = currentIndex <= 0 ? focusableArray.length - 1 : currentIndex - 1;
                    (focusableArray[nextIndex] as HTMLElement).focus();
                } else {
                    // Tab - go forwards
                    const nextIndex = currentIndex >= focusableArray.length - 1 ? 0 : currentIndex + 1;
                    (focusableArray[nextIndex] as HTMLElement).focus();
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [state.currentStep]);

    const renderStep = () => {
        const props = {
            state,
            updateState,
            onNext: goNext,
            onBack: goBack,
            setCanProceed,
            componentsData
        };

        // Calculate required Node versions based on selected components
        const getRequiredNodeVersions = (): string[] => {
            const versions = new Set<string>();
            
            // Check if API Mesh is selected (requires Node 18)
            if (state.components?.dependencies?.includes('commerce-mesh')) {
                versions.add('18');
            }
            
            // Check if App Builder apps are selected (require Node 22)
            if (state.components?.appBuilderApps && state.components.appBuilderApps.length > 0) {
                versions.add('22');
            }
            
            // Frontend may require latest
            if (state.components?.frontend === 'citisignal-nextjs') {
                versions.add('latest');
            }
            
            return Array.from(versions);
        };

        switch (state.currentStep) {
            case 'welcome':
                return <WelcomeStep {...props} />;
            case 'component-selection':
                return <ComponentSelectionStep {...props} componentsData={componentsData} />;
            case 'prerequisites':
                return <PrerequisitesStep {...props} requiredNodeVersions={getRequiredNodeVersions()} componentsData={componentsData} currentStep={state.currentStep} />;
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
                return <ReviewStep {...props} />;
            case 'project-creation':
                return <ProjectCreationStep state={state} />;
            default:
                return null;
        }
    };

    const currentStepIndex = getCurrentStepIndex();
    const isFirstStep = currentStepIndex === 0;
    const isLastStep = state.currentStep === 'project-creation';
    const currentStepName = WIZARD_STEPS[currentStepIndex]?.name;

    return (
        <View 
            backgroundColor="gray-50"
            width="100%"
            height="100vh"
            UNSAFE_className={cn('flex', 'overflow-hidden')}
        >
            <div style={{ display: 'flex', height: '100%', width: '100%' }}>
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
                        style={{ width: '100%', height: '100%', overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}
                        className={cn('overflow-y-auto', 'overflow-x-hidden', 'relative')}
                    >
                        <div
                            style={{ height: '100%', width: '100%' }}
                            className={cn(
                                'step-content',
                                animationDirection,
                                isTransitioning && 'transitioning',
                                'transition-all'
                            )}
                        >
                            {renderStep()}
                        </div>

                        {/* Confirmation overlay during backend calls */}
                        {isConfirmingSelection && (
                            <div style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                zIndex: 1000,
                                borderRadius: '4px'
                            }}>
                                <div style={{
                                    backgroundColor: 'var(--spectrum-global-color-gray-50)',
                                    padding: '24px',
                                    borderRadius: '50%',
                                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <div style={{
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '50%',
                                        border: '3px solid var(--spectrum-global-color-blue-400)',
                                        borderTopColor: 'transparent',
                                        animation: 'spin 1s linear infinite'
                                    }}></div>
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
                                            onPress={() => {
                                                console.log('Continue button clicked!');
                                                goNext();
                                            }}
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