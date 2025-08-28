import React, { useState, useCallback, useEffect, useRef } from 'react';
import { 
    View, 
    Flex, 
    Heading, 
    Button
} from '@adobe/react-spectrum';
import { WizardState, WizardStep, FeedbackMessage } from '../../types';
import { TimelineNav } from './TimelineNav';
import { WelcomeStep } from '../steps/WelcomeStep';
import { PrerequisitesStep } from '../steps/PrerequisitesStep';
import { AdobeAuthStep } from '../steps/AdobeAuthStep';
import { OrgSelectionStep } from '../steps/OrgSelectionStep';
import { ProjectSelectionStep } from '../steps/ProjectSelectionStep';
import { CommerceConfigStep } from '../steps/CommerceConfigStep';
import { ReviewStep } from '../steps/ReviewStep';
import { CreatingStep } from '../steps/CreatingStep';
import { vscode } from '../../app/vscodeApi';

const WIZARD_STEPS: { id: WizardStep; name: string }[] = [
    { id: 'welcome', name: 'Project Details' },
    { id: 'prerequisites', name: 'Prerequisites' },
    { id: 'adobe-auth', name: 'Adobe Auth' },
    { id: 'org-selection', name: 'Organization' },
    { id: 'project-selection', name: 'Project' },
    { id: 'commerce-config', name: 'Commerce' },
    { id: 'review', name: 'Review' },
    { id: 'creating', name: 'Creating' }
];

export function WizardContainer() {
    const [state, setState] = useState<WizardState>({
        currentStep: 'welcome',
        projectName: '',
        projectTemplate: 'commerce-paas',
        adobeAuth: {
            isAuthenticated: false,
            isChecking: false
        }
    });

    const [canProceed, setCanProceed] = useState(false);
    const [feedback, setFeedback] = useState<FeedbackMessage | null>(null);
    const [completedSteps, setCompletedSteps] = useState<WizardStep[]>([]);
    const [animationDirection, setAnimationDirection] = useState<'forward' | 'backward'>('forward');
    const contentRef = useRef<HTMLDivElement>(null);

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

    const getCurrentStepIndex = () => {
        return WIZARD_STEPS.findIndex(step => step.id === state.currentStep);
    };

    const goToStep = useCallback((step: WizardStep) => {
        const currentIndex = getCurrentStepIndex();
        const targetIndex = WIZARD_STEPS.findIndex(s => s.id === step);
        
        setAnimationDirection(targetIndex > currentIndex ? 'forward' : 'backward');
        
        // Add animation class
        if (contentRef.current) {
            contentRef.current.classList.add('transitioning');
            setTimeout(() => {
                setState(prev => ({ ...prev, currentStep: step }));
                contentRef.current?.classList.remove('transitioning');
            }, 300);
        } else {
            setState(prev => ({ ...prev, currentStep: step }));
        }
    }, [state.currentStep]);

    const goNext = useCallback(() => {
        const currentIndex = getCurrentStepIndex();
        if (currentIndex < WIZARD_STEPS.length - 1) {
            // Mark current step as completed
            if (!completedSteps.includes(state.currentStep)) {
                setCompletedSteps(prev => [...prev, state.currentStep]);
            }
            goToStep(WIZARD_STEPS[currentIndex + 1].id);
        }
    }, [state.currentStep, completedSteps]);

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
    }, [state.currentStep, handleCancel]);

    const updateState = useCallback((updates: Partial<WizardState>) => {
        setState(prev => ({ ...prev, ...updates }));
    }, []);

    const renderStep = () => {
        const props = {
            state,
            updateState,
            onNext: goNext,
            onBack: goBack,
            setCanProceed
        };

        switch (state.currentStep) {
            case 'welcome':
                return <WelcomeStep {...props} />;
            case 'prerequisites':
                return <PrerequisitesStep {...props} />;
            case 'adobe-auth':
                return <AdobeAuthStep {...props} />;
            case 'org-selection':
                return <OrgSelectionStep {...props} />;
            case 'project-selection':
                return <ProjectSelectionStep {...props} />;
            case 'commerce-config':
                return <CommerceConfigStep {...props} />;
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
            UNSAFE_style={{
                display: 'flex',
                overflow: 'hidden'
            }}
        >
            <Flex height="100%">
                {/* Timeline Navigation */}
                <View 
                    width="size-3000" 
                    height="100%"
                    UNSAFE_style={{
                        minWidth: '240px',
                        maxWidth: '240px'
                    }}
                >
                    <TimelineNav
                        steps={WIZARD_STEPS}
                        currentStep={state.currentStep}
                        completedSteps={completedSteps}
                        onStepClick={goToStep}
                    />
                </View>

                {/* Content Area */}
                <Flex direction="column" flex height="100%">
                    {/* Header */}
                    <View 
                        padding="size-400"
                        UNSAFE_style={{
                            borderBottom: '1px solid var(--spectrum-global-color-gray-300)',
                            background: 'var(--spectrum-global-color-gray-75)'
                        }}
                    >
                        <Heading level={1} marginBottom="size-100">
                            Create Demo Project
                        </Heading>
                        <Heading level={3} UNSAFE_style={{ 
                            fontWeight: 400,
                            color: 'var(--spectrum-global-color-gray-600)'
                        }}>
                            {currentStepName}
                        </Heading>
                    </View>

                    {/* Step Content */}
                    <View 
                        flex
                        padding="size-400"
                        UNSAFE_style={{ 
                            overflow: 'hidden',
                            position: 'relative'
                        }}
                    >
                        <View
                            ref={contentRef}
                            height="100%"
                            UNSAFE_className={`step-content ${animationDirection}`}
                            UNSAFE_style={{
                                transition: 'transform 0.3s ease-in-out, opacity 0.3s ease-in-out'
                            }}
                        >
                            {renderStep()}
                        </View>
                    </View>

                    {/* Footer */}
                    {!isLastStep && (
                        <View
                            padding="size-400"
                            UNSAFE_style={{
                                borderTop: '1px solid var(--spectrum-global-color-gray-300)',
                                background: 'var(--spectrum-global-color-gray-75)'
                            }}
                        >
                            <Flex justifyContent="space-between" width="100%">
                                <Button 
                                    variant="secondary" 
                                    onPress={handleCancel}
                                    isQuiet
                                >
                                    Cancel
                                </Button>
                                <Flex gap="size-100">
                                    <Button
                                        variant="secondary"
                                        onPress={goBack}
                                        isQuiet
                                    >
                                        Back
                                    </Button>
                                    <Button
                                        variant="accent"
                                        onPress={goNext}
                                        isDisabled={!canProceed}
                                    >
                                        {currentStepIndex === WIZARD_STEPS.length - 2 ? 'Create Project' : 'Continue'}
                                    </Button>
                                </Flex>
                            </Flex>
                        </View>
                    )}
                </Flex>
            </Flex>

            <style jsx>{`
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