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
import { ComponentSelectionStep } from '../steps/ComponentSelectionStep';
import { PrerequisitesStep } from '../steps/PrerequisitesStep';
import { AdobeSetupStep } from '../steps/AdobeSetupStep';
import { CommerceConfigStep } from '../steps/CommerceConfigStep';
import { ReviewStep } from '../steps/ReviewStep';
import { CreatingStep } from '../steps/CreatingStep';
import { vscode } from '../../app/vscodeApi';
import { cn } from '../../utils/classNames';

// Default steps if not provided from configuration
const DEFAULT_WIZARD_STEPS: { id: WizardStep; name: string }[] = [
    { id: 'welcome', name: 'Project Details' },
    { id: 'component-selection', name: 'Components' },
    { id: 'prerequisites', name: 'Prerequisites' },
    { id: 'adobe-auth', name: 'Adobe Auth' },
    { id: 'org-selection', name: 'Organization' },
    { id: 'project-selection', name: 'Project' },
    { id: 'commerce-config', name: 'Commerce' },
    { id: 'review', name: 'Review' },
    { id: 'creating', name: 'Creating' }
];

interface WizardContainerProps {
    componentDefaults?: any;
    wizardSteps?: { id: string; name: string; enabled: boolean }[];
}

export function WizardContainer({ componentDefaults, wizardSteps }: WizardContainerProps) {
    // Use provided steps or fall back to defaults
    const WIZARD_STEPS = wizardSteps 
        ? wizardSteps.map(step => ({ id: step.id as WizardStep, name: step.name }))
        : DEFAULT_WIZARD_STEPS;
    const [state, setState] = useState<WizardState>({
        currentStep: 'welcome',
        projectName: '',
        projectTemplate: 'commerce-paas',
        adobeAuth: {
            isAuthenticated: false,
            isChecking: false
        },
        components: componentDefaults || undefined
    });

    const [canProceed, setCanProceed] = useState(false);
    const [feedback, setFeedback] = useState<FeedbackMessage | null>(null);
    const [completedSteps, setCompletedSteps] = useState<WizardStep[]>([]);
    const [animationDirection, setAnimationDirection] = useState<'forward' | 'backward'>('forward');
    const [isTransitioning, setIsTransitioning] = useState(false);
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

    const goNext = useCallback(() => {
        console.log('goNext called, current step:', state.currentStep, 'canProceed:', canProceed);
        const currentIndex = getCurrentStepIndex();
        console.log('Current index:', currentIndex, 'Total steps:', WIZARD_STEPS.length);
        
        if (currentIndex < WIZARD_STEPS.length - 1) {
            const nextStep = WIZARD_STEPS[currentIndex + 1];
            console.log('Moving to next step:', nextStep.id);
            
            // Mark current step as completed
            if (!completedSteps.includes(state.currentStep)) {
                setCompletedSteps(prev => [...prev, state.currentStep]);
            }
            goToStep(nextStep.id);
        } else {
            console.log('Already at last step');
        }
    }, [state.currentStep, completedSteps, canProceed, getCurrentStepIndex, goToStep]);

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
            case 'adobe-setup':
                return <AdobeSetupStep {...props} />;
            case 'adobe-auth':
                // Legacy step, now merged into adobe-setup
                return <AdobeSetupStep {...props} />;
            case 'adobe-context':
                // Legacy step, now merged into adobe-setup
                return <AdobeSetupStep {...props} />;
            case 'org-selection':
                // Legacy step, no longer used
                return <AdobeSetupStep {...props} />;
            case 'project-selection':
                // Legacy step, merged into adobe-setup
                return <AdobeSetupStep {...props} />;
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
                                            onPress={() => {
                                                console.log('Continue button clicked!');
                                                goNext();
                                            }}
                                            isDisabled={!canProceed}
                                        >
                                            {currentStepIndex === WIZARD_STEPS.length - 2 ? 'Create Project' : 'Continue'}
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