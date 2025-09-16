import React, { useState, useCallback, useEffect, useRef } from 'react';
import { 
    View, 
    Flex, 
    Heading, 
    Button,
    Text
} from '@adobe/react-spectrum';
import { WizardState, WizardStep, FeedbackMessage } from '../../types';
import { TimelineNav } from './TimelineNav';
import { WelcomeStep } from '../steps/WelcomeStep';
import { ComponentSelectionStep } from '../steps/ComponentSelectionStep';
import { PrerequisitesStep } from '../steps/PrerequisitesStep';
import { AdobeAuthStep } from '../steps/AdobeAuthStep';
import { AdobeProjectStep } from '../steps/AdobeProjectStep';
import { AdobeWorkspaceStep } from '../steps/AdobeWorkspaceStep';
import { ComponentConfigStep } from '../steps/ComponentConfigStep';
import { ReviewStep } from '../steps/ReviewStep';
import { CreatingStep } from '../steps/CreatingStep';
import { vscode } from '../../app/vscodeApi';
import { cn } from '../../utils/classNames';

interface WizardContainerProps {
    componentDefaults?: any;
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
            isAuthenticated: undefined,  // Start as undefined to trigger auth check
            isChecking: false  // Allow the check to proceed
        },
        components: componentDefaults || undefined
    });

    const [canProceed, setCanProceed] = useState(false);
    const [feedback, setFeedback] = useState<FeedbackMessage | null>(null);
    const [completedSteps, setCompletedSteps] = useState<WizardStep[]>([]);
    const [animationDirection, setAnimationDirection] = useState<'forward' | 'backward'>('forward');
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [isConfirmingSelection, setIsConfirmingSelection] = useState(false);
    const [componentsData, setComponentsData] = useState<any>(null);

    // Listen for feedback messages from extension
    useEffect(() => {
        const unsubscribe = vscode.onMessage('feedback', (message: FeedbackMessage) => {
            setFeedback(message);
            
            // Update creation progress if in creating step
            if (state.currentStep === 'creating' && state.creationProgress) {
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

    // Listen for components data from extension
    useEffect(() => {
        const unsubscribe = vscode.onMessage('componentsLoaded', (data: any) => {
            console.log('Received components data:', data);
            setComponentsData(data);
        });

        // Request components when component mounts
        vscode.postMessage('loadComponents');

        return unsubscribe;
    }, []);

    const getCurrentStepIndex = useCallback(() => {
        return WIZARD_STEPS.findIndex(step => step.id === state.currentStep);
    }, [state.currentStep]);

    const goToStep = useCallback((step: WizardStep) => {
        console.log('goToStep called with:', step);
        const currentIndex = getCurrentStepIndex();
        const targetIndex = WIZARD_STEPS.findIndex(s => s.id === step);
        
        setAnimationDirection(targetIndex > currentIndex ? 'forward' : 'backward');
        setIsTransitioning(true);
        
        // Update state after animation starts
        setTimeout(() => {
            setState(prev => {
                console.log('Setting new step:', step, 'from:', prev.currentStep);
                return { ...prev, currentStep: step };
            });
            setIsTransitioning(false);
        }, 300);
    }, [getCurrentStepIndex]);

    const goNext = useCallback(async () => {
        console.log('goNext called, current step:', state.currentStep, 'canProceed:', canProceed);
        const currentIndex = getCurrentStepIndex();
        console.log('Current index:', currentIndex, 'Total steps:', WIZARD_STEPS.length);

        if (currentIndex < WIZARD_STEPS.length - 1) {
            const nextStep = WIZARD_STEPS[currentIndex + 1];
            console.log('Moving to next step:', nextStep.id);

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

                // Mark current step as completed only after successful backend operation
                if (!completedSteps.includes(state.currentStep)) {
                    setCompletedSteps(prev => [...prev, state.currentStep]);
                }

                // Clear loading overlay before transition
                setIsConfirmingSelection(false);

                // Proceed to next step now that backend is synchronized
                goToStep(nextStep.id);

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
    }, [state.currentStep, state.adobeProject, state.adobeWorkspace, completedSteps, canProceed, getCurrentStepIndex, goToStep]);

    const handleCancel = useCallback(() => {
        vscode.postMessage('cancel');
    }, []);

    const goBack = useCallback(() => {
        const currentIndex = getCurrentStepIndex();
        if (currentIndex === 0) {
            // On first step, go back means cancel and return to welcome
            handleCancel();
        } else if (currentIndex > 0) {
            goToStep(WIZARD_STEPS[currentIndex - 1].id);
        }
    }, [getCurrentStepIndex, goToStep, handleCancel]);

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
            setCanProceed
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
                return <PrerequisitesStep {...props} requiredNodeVersions={getRequiredNodeVersions()} componentsData={componentsData} />;
            case 'adobe-auth':
                return <AdobeAuthStep {...props} />;
            case 'adobe-project':
                return <AdobeProjectStep {...props} />;
            case 'adobe-workspace':
                return <AdobeWorkspaceStep {...props} />;
            case 'component-config':
                return <ComponentConfigStep {...props} />;
            case 'review':
                return <ReviewStep {...props} />;
            case 'creating':
                return <CreatingStep state={state} />;
            default:
                return null;
        }
    };

    const currentStepIndex = getCurrentStepIndex();
    const isFirstStep = currentStepIndex === 0;
    const isLastStep = state.currentStep === 'creating';
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
                        onStepClick={goToStep}
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