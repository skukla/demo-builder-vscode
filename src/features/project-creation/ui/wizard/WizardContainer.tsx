import {
    View,
    Flex,
    Heading,
    Button,
    Text,
} from '@adobe/react-spectrum';
import React, { useEffect, useRef, useState } from 'react';
import {
    useWizardState,
    useWizardNavigation,
    useMessageListeners,
    useWizardEffects,
} from './hooks';
import {
    getNextButtonText,
    getNavigationDirection,
    shouldShowWizardFooter,
    ImportedSettings,
    EditProjectConfig,
} from './wizardHelpers';
import { loadDemoTemplates } from '../helpers/templateLoader';
import type { DemoTemplate } from '@/types/templates';
import { ErrorBoundary } from '@/core/ui/components/ErrorBoundary';
import { LoadingOverlay, LoadingDisplay } from '@/core/ui/components/feedback';
import { PageHeader, PageFooter, CenteredFeedbackContainer, SingleColumnLayout } from '@/core/ui/components/layout';
import { useFocusTrap } from '@/core/ui/hooks';
import { cn } from '@/core/ui/utils/classNames';
import { webviewLogger } from '@/core/ui/utils/webviewLogger';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { AdobeAuthStep } from '@/features/authentication/ui/steps/AdobeAuthStep';
import { AdobeProjectStep } from '@/features/authentication/ui/steps/AdobeProjectStep';
import { AdobeWorkspaceStep } from '@/features/authentication/ui/steps/AdobeWorkspaceStep';
import { ComponentConfigStep } from '@/features/components/ui/steps/ComponentConfigStep';
import { ComponentSelectionStep } from '@/features/components/ui/steps/ComponentSelectionStep';
import { PrerequisitesStep } from '@/features/prerequisites/ui/steps/PrerequisitesStep';
import { ProjectCreationStep } from '@/features/project-creation/ui/steps/ProjectCreationStep';
import { ReviewStep } from '@/features/project-creation/ui/steps/ReviewStep';
import { WelcomeStep } from '@/features/project-creation/ui/steps/WelcomeStep';
import { ComponentSelection } from '@/types/webview';

// Extracted hooks

const log = webviewLogger('WizardContainer');

// Re-export for consumers that import from WizardContainer
export type { ImportedSettings, EditProjectConfig };

interface WizardContainerProps {
    componentDefaults?: ComponentSelection;
    wizardSteps?: { id: string; name: string; enabled: boolean }[];
    existingProjectNames?: string[];
    importedSettings?: ImportedSettings | null;
    /** Edit project configuration for edit mode */
    editProject?: EditProjectConfig;
    /** Initial view mode for template gallery (from settings) */
    projectsViewMode?: 'cards' | 'rows';
}

export function WizardContainer({
    componentDefaults,
    wizardSteps,
    existingProjectNames,
    importedSettings,
    editProject,
    projectsViewMode,
}: WizardContainerProps) {
    // State management hook
    const {
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
    } = useWizardState({
        componentDefaults,
        wizardSteps,
        existingProjectNames,
        importedSettings,
        editProject,
    });

    // Demo templates - loaded once on mount
    const [templates, setTemplates] = useState<DemoTemplate[]>([]);
    useEffect(() => {
        loadDemoTemplates().then(setTemplates);
    }, []);

    // Navigation hook
    const {
        goNext,
        goBack,
        handleCancel,
        handleShowLogs,
        getCurrentStepIndex,
    } = useWizardNavigation({
        state,
        setState,
        WIZARD_STEPS,
        completedSteps,
        setCompletedSteps,
        highestCompletedStepIndex,
        setHighestCompletedStepIndex,
        setAnimationDirection,
        setIsTransitioning,
        setIsConfirmingSelection,
        setIsPreparingReview,
        importedSettings,
        templates,
    });

    // Focus trap for keyboard navigation (replaces manual implementation)
    const wizardContainerRef = useFocusTrap<HTMLDivElement>({
        enabled: true,
        autoFocus: false,  // Wizard steps manage their own focus
        containFocus: true,  // Prevent escape (WCAG 2.1 AA)
    });

    // Ref for step content area (to focus first element when step changes)
    const stepContentRef = useRef<HTMLDivElement>(null);

    // Message listeners - handles feedback, creationProgress, and sidebar navigation
    useMessageListeners({
        setState,
        getCurrentStepIndex,
        navigateToStep: (step, targetIndex, currentIndex) => {
            // Navigation for sidebar requests - simplified version without state clearing
            // Full backward navigation with state clearing is handled by useWizardNavigation
            setAnimationDirection(getNavigationDirection(targetIndex, currentIndex));
            setIsTransitioning(true);
            setTimeout(() => {
                setState(prev => ({ ...prev, currentStep: step }));
                setIsTransitioning(false);
            }, TIMEOUTS.STEP_TRANSITION);
        },
        WIZARD_STEPS,
    });

    // Side effects (auto-focus, sidebar notifications, data loading)
    useWizardEffects({
        state,
        setState,
        WIZARD_STEPS,
        completedSteps,
        stepContentRef,
        setComponentsData,
    });

    const renderStep = () => {
        // Import mode: Show loading view during transition to review
        // Uses same UI pattern as project/workspace loading states
        if (isPreparingReview) {
            return (
                <SingleColumnLayout>
                    <Heading level={2} marginBottom="size-300">
                        Preparing Review
                    </Heading>
                    <CenteredFeedbackContainer>
                        <LoadingDisplay
                            size="L"
                            message="Preparing your project review..."
                            subMessage="Loading your imported settings"
                        />
                    </CenteredFeedbackContainer>
                </SingleColumnLayout>
            );
        }

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
                return <WelcomeStep {...props} existingProjectNames={existingProjectNames} templates={templates} initialViewMode={projectsViewMode} />;
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
                        title={state.editMode ? "Edit Project" : "Create Demo Project"}
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

                    {/* Footer - hidden on project-creation, mesh-deployment (own buttons), and during preparing review transition */}
                    {shouldShowWizardFooter(isLastStep, state.currentStep, isPreparingReview) && (
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
                                        {getNextButtonText(isConfirmingSelection, currentStepIndex, WIZARD_STEPS.length, state.editMode)}
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
