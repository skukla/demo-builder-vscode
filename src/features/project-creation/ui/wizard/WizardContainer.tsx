import {
    View,
    Flex,
    Heading,
    Button,
    Text,
} from '@adobe/react-spectrum';
import { PageHeader, PageFooter } from '@/core/ui/components/layout';
import { LoadingOverlay } from '@/core/ui/components/feedback';
import React, { useMemo, useRef } from 'react';
import {
    getNextButtonText,
    hasMeshComponentSelected,
    ImportedSettings,
} from './wizardHelpers';
import { WizardStepRenderer } from './WizardStepRenderer';
import { useMeshDeployment } from '@/features/mesh/ui/steps/useMeshDeployment';
import { ComponentSelection } from '@/types/webview';
import { cn } from '@/core/ui/utils/classNames';
import { webviewLogger } from '@/core/ui/utils/webviewLogger';
import { useFocusTrap } from '@/core/ui/hooks';
import { ErrorBoundary } from '@/core/ui/components/ErrorBoundary';

// Extracted hooks
import {
    useWizardState,
    useWizardNavigation,
    useMessageListeners,
    useWizardEffects,
} from './hooks';

const log = webviewLogger('WizardContainer');

// Re-export ImportedSettings for consumers that import from WizardContainer
export type { ImportedSettings };

/**
 * Edit project configuration passed from handleEditProject handler
 */
export interface EditProjectConfig {
    projectPath: string;
    projectName: string;
    settings: {
        version: number;
        selections?: {
            frontend?: string;
            backend?: string;
            dependencies?: string[];
            integrations?: string[];
            appBuilder?: string[];
        };
        configs?: Record<string, Record<string, string | boolean | number | undefined>>;
        adobe?: {
            orgId?: string;
            orgName?: string;
            projectId?: string;
            projectName?: string;
            projectTitle?: string;
            workspaceId?: string;
            workspaceName?: string;
            workspaceTitle?: string;
        };
    };
}

interface WizardContainerProps {
    componentDefaults?: ComponentSelection;
    wizardSteps?: { id: string; name: string; enabled: boolean }[];
    existingProjectNames?: string[];
    importedSettings?: ImportedSettings | null;
    /** Edit project configuration for edit mode */
    editProject?: EditProjectConfig;
}

export function WizardContainer({
    componentDefaults,
    wizardSteps,
    existingProjectNames,
    importedSettings,
    editProject,
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

    // Navigation hook
    const {
        goNext,
        goBack,
        handleCancel,
        handleShowLogs,
        handleMeshDeploymentCancel,
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
    });

    // Mesh deployment hook - called unconditionally per Rules of Hooks
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

    // Message listeners
    useMessageListeners({
        setState,
        getCurrentStepIndex,
        navigateToStep: (step, targetIndex, currentIndex) => {
            // Re-implement navigateToStep locally for message listener
            // This avoids circular dependency issues
            import('./wizardHelpers').then(({ getNavigationDirection }) => {
                setAnimationDirection(getNavigationDirection(targetIndex, currentIndex));
                setIsTransitioning(true);
                setTimeout(() => {
                    setState(prev => ({ ...prev, currentStep: step }));
                    setIsTransitioning(false);
                }, 150);
            });
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
                                        {getNextButtonText(isConfirmingSelection, currentStepIndex, WIZARD_STEPS.length, state.editMode)}
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
