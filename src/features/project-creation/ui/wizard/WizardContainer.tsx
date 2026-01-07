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
    getWizardTitle,
    isStepSatisfied,
    ImportedSettings,
    EditProjectConfig,
    WizardStepConfigWithRequirements,
} from './wizardHelpers';
import { loadStacks } from '../helpers/brandStackLoader';
import { loadDemoPackages } from '../helpers/demoPackageLoader';
import { filterComponentConfigsForStackChange } from '../helpers/stackHelpers';
import type { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
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
import { GitHubSetupStep } from '@/features/eds/ui/steps/GitHubSetupStep';
import { GitHubRepoSelectionStep } from '@/features/eds/ui/steps/GitHubRepoSelectionStep';
import { DaLiveSetupStep } from '@/features/eds/ui/steps/DaLiveSetupStep';
import { DataSourceConfigStep } from '@/features/eds/ui/steps/DataSourceConfigStep';
import { ConnectServicesStep } from '@/features/eds/ui/steps/ConnectServicesStep';
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
    wizardSteps?: WizardStepConfigWithRequirements[];
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
    // Packages and stacks - loaded once on mount
    // NOTE: Must be declared BEFORE useWizardState so stacks can be passed for step filtering
    const [packages, setPackages] = useState<DemoPackage[]>([]);
    const [stacks, setStacks] = useState<Stack[]>([]);
    useEffect(() => {
        loadDemoPackages().then(setPackages);
        loadStacks().then(setStacks);
    }, []);

    // State management hook
    // Receives stacks for dynamic step filtering based on selectedStack
    const {
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
    } = useWizardState({
        componentDefaults,
        wizardSteps,
        existingProjectNames,
        importedSettings,
        editProject,
        stacks,
    });

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
        confirmedSteps,
        setConfirmedSteps,
        highestCompletedStepIndex,
        setHighestCompletedStepIndex,
        setAnimationDirection,
        setIsTransitioning,
        setIsConfirmingSelection,
        setIsPreparingReview,
        importedSettings,
        packages,
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
        confirmedSteps,
        stepContentRef,
        setComponentsData,
    });

    /**
     * Called when user changes architecture (stack) on WelcomeStep
     * Intelligently filters dependent state based on component overlap between stacks
     *
     * Components REMOVED by the new stack → Clear their configs
     * Components RETAINED in the new stack → Keep their configs
     * Components NEW in the new stack → Will be initialized with defaults later
     *
     * Note: Import mode fast-forward is controlled by comparing state.selectedStack
     * with importedSettings.selectedStack - no flag needed.
     */
    const handleArchitectureChange = (oldStackId: string, newStackId: string) => {
        log.info(`Architecture changed: ${oldStackId} → ${newStackId}`);

        // Find the old and new stack definitions
        const oldStack = stacks?.find(s => s.id === oldStackId);
        const newStack = stacks?.find(s => s.id === newStackId);

        if (!newStack) {
            log.warn(`New stack not found: ${newStackId}`);
            return;
        }

        // Filter component configs - retain configs for components that exist in both stacks
        const filteredConfigs = filterComponentConfigsForStackChange(
            oldStack,
            newStack,
            state.componentConfigs || {},
        );

        log.info(`Retained configs for components: ${Object.keys(filteredConfigs).join(', ') || 'none'}`);

        // Build the new state after stack change
        const newState = {
            ...state,
            componentConfigs: filteredConfigs,
            selectedStack: newStackId,
            // Clear EDS state (architecture-dependent)
            githubAuth: undefined,
            githubUser: undefined,
            selectedRepository: undefined,
            repositoryName: undefined,
            repositoryVisibility: undefined,
            edsContentSource: undefined,
        };

        // In review mode, recompute which steps are still satisfied with the new state
        // This preserves green checkmarks for steps that still have valid data
        // IMPORTANT: Stack changes mean brand changes which mean different mesh code
        // Force user to re-confirm project/workspace selection even if state is preserved
        const isReviewMode = state.wizardMode && state.wizardMode !== 'create';
        if (isReviewMode) {
            // Steps that require re-confirmation on stack change
            // (stack/brand affects mesh code, so deployment target must be verified)
            const stackDependentSteps = ['adobe-project', 'adobe-workspace'];
            
            const satisfiedSteps = WIZARD_STEPS
                .filter(step => step.id !== 'project-creation' && step.id !== 'review')
                .filter(step => isStepSatisfied(step.id, newState))
                .filter(step => !stackDependentSteps.includes(step.id)) // Force re-confirmation
                .map(step => step.id);
            log.info(`Recomputed satisfied steps after stack change: ${satisfiedSteps.join(', ') || 'none'}`);
            log.info(`Requiring re-confirmation for: ${stackDependentSteps.join(', ')}`);
            setCompletedSteps(satisfiedSteps);
        } else {
            // In create mode, reset to just 'welcome'
            setCompletedSteps(['welcome']);
        }

        // Update state with filtered configs
        // Clear EDS-specific state (GitHub, repository, etc.) since it's architecture-dependent
        // Preserve: projectName, selectedBrand, Adobe auth/org (still valid)
        setState(prev => ({
            ...prev,
            componentConfigs: filteredConfigs,
            // Clear EDS state
            githubAuth: undefined,
            githubUser: undefined,
            selectedRepository: undefined,
            repositoryName: undefined,
            repositoryVisibility: undefined,
            edsContentSource: undefined,
        }));
    };

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
                return <WelcomeStep {...props} existingProjectNames={existingProjectNames} initialViewMode={projectsViewMode} packages={packages} stacks={stacks} onArchitectureChange={handleArchitectureChange} />;
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
            case 'eds-connect-services':
                return <ConnectServicesStep {...props} />;
            case 'eds-github':
                return <GitHubSetupStep {...props} />;
            case 'eds-repository-config':
                return <GitHubRepoSelectionStep {...props} />;
            case 'eds-dalive':
                return <DaLiveSetupStep {...props} />;
            case 'eds-data-source':
                return <DataSourceConfigStep {...props} />;
            case 'settings':
                return <ComponentConfigStep {...props} />;
            case 'review':
                return <ReviewStep state={state} updateState={updateState} setCanProceed={setCanProceed} componentsData={componentsData?.data} packages={packages} stacks={stacks} />;
            case 'project-creation':
                return <ProjectCreationStep state={state} onBack={goBack} importedSettings={importedSettings} packages={packages} />;
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
    const currentStepDescription = WIZARD_STEPS[currentStepIndex]?.description;

    return (
        <View
            backgroundColor="gray-50"
            width="100%"
            height="100vh"
            UNSAFE_className={cn('flex', 'overflow-hidden')}
        >
            <div ref={wizardContainerRef} className="flex h-full w-full">
                {/* Content Area - Timeline moved to sidebar */}
                <div className="wizard-main-content">
                    {/* Header */}
                    <PageHeader
                        title={getWizardTitle(state.wizardMode)}
                        subtitle={currentStepName}
                        description={currentStepDescription}
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

                    {/* Footer - hidden on project-creation, mesh-deployment (own buttons) */}
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
                                        {getNextButtonText(isConfirmingSelection, currentStepIndex, WIZARD_STEPS.length, state.wizardMode)}
                                    </Button>
                                </Flex>
                            }
                            constrainWidth={true}
                        />
                    )}

                    {/* Empty footer during preparing review transition for visual consistency */}
                    {isPreparingReview && (
                        <PageFooter constrainWidth={true} />
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
