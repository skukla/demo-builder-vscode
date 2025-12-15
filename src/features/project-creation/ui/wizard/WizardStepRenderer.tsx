/**
 * WizardStepRenderer - Renders the appropriate step component based on current step
 *
 * Extracted from WizardContainer to reduce component complexity (SOP god-file compliance).
 */

import { Heading } from '@adobe/react-spectrum';
import React from 'react';
import { LoadingDisplay } from '@/core/ui/components/feedback';
import { CenteredFeedbackContainer, SingleColumnLayout } from '@/core/ui/components/layout';
import { AdobeAuthStep } from '@/features/authentication/ui/steps/AdobeAuthStep';
import { AdobeProjectStep } from '@/features/authentication/ui/steps/AdobeProjectStep';
import { AdobeWorkspaceStep } from '@/features/authentication/ui/steps/AdobeWorkspaceStep';
import { ComponentConfigStep } from '@/features/components/ui/steps/ComponentConfigStep';
import { ComponentSelectionStep } from '@/features/components/ui/steps/ComponentSelectionStep';
import { ApiMeshStep } from '@/features/mesh/ui/steps/ApiMeshStep';
import { MeshDeploymentStep } from '@/features/mesh/ui/steps/MeshDeploymentStep';
import type { MeshDeploymentState } from '@/features/mesh/ui/steps/meshDeploymentTypes';
import { PrerequisitesStep } from '@/features/prerequisites/ui/steps/PrerequisitesStep';
import { ProjectCreationStep } from '@/features/project-creation/ui/steps/ProjectCreationStep';
import { ReviewStep, ComponentsData } from '@/features/project-creation/ui/steps/ReviewStep';
import { WelcomeStep } from '@/features/project-creation/ui/steps/WelcomeStep';
import type { WizardState, WizardStep } from '@/types/webview';

/**
 * Props for the step renderer
 */
export interface WizardStepRendererProps {
    /** Current step ID */
    currentStep: WizardStep;
    /** Full wizard state */
    state: WizardState;
    /** Update state callback */
    updateState: (updates: Partial<WizardState>) => void;
    /** Proceed to next step */
    onNext: () => void;
    /** Go back to previous step */
    onBack: () => void;
    /** Set whether user can proceed */
    setCanProceed: (canProceed: boolean) => void;
    /** Components data from backend */
    componentsData: {
        success: boolean;
        type: string;
        data: ComponentsData;
    } | null;
    /** List of completed steps */
    completedSteps: WizardStep[];
    /** Existing project names (for validation) */
    existingProjectNames?: string[];
    /** Whether preparing review (import mode transition) */
    isPreparingReview: boolean;
    /** Mesh deployment state (from useMeshDeployment hook) */
    meshDeploymentState?: MeshDeploymentState;
    /** Mesh deployment retry callback */
    onMeshRetry?: () => void;
    /** Mesh deployment cancel callback */
    onMeshCancel?: () => void;
}

/**
 * Render the appropriate wizard step based on current step ID
 */
export function WizardStepRenderer({
    currentStep,
    state,
    updateState,
    onNext,
    onBack,
    setCanProceed,
    componentsData,
    completedSteps,
    existingProjectNames,
    isPreparingReview,
    meshDeploymentState,
    onMeshRetry,
    onMeshCancel,
}: WizardStepRendererProps): React.ReactElement | null {
    // Import mode: Show loading view during transition to review
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

    // Common props for all steps
    const baseProps = {
        state,
        updateState,
        onNext,
        onBack,
        setCanProceed,
        componentsData,
    };

    // Handle special cases with additional props
    switch (currentStep) {
        case 'welcome':
            return <WelcomeStep {...baseProps} existingProjectNames={existingProjectNames} />;

        case 'component-selection':
            return <ComponentSelectionStep {...baseProps} componentsData={componentsData?.data as Record<string, unknown>} />;

        case 'prerequisites':
            return <PrerequisitesStep {...baseProps} componentsData={componentsData?.data as Record<string, unknown>} currentStep={currentStep} />;

        case 'adobe-auth':
            return <AdobeAuthStep {...baseProps} />;

        case 'adobe-project':
            return <AdobeProjectStep {...baseProps} completedSteps={completedSteps} />;

        case 'adobe-workspace':
            return <AdobeWorkspaceStep {...baseProps} completedSteps={completedSteps} />;

        case 'api-mesh':
            return <ApiMeshStep {...baseProps} completedSteps={completedSteps} />;

        case 'mesh-deployment':
            // Mesh deployment step with timeout recovery
            if (!meshDeploymentState || !onMeshRetry || !onMeshCancel) {
                return null;
            }
            return (
                <MeshDeploymentStep
                    state={meshDeploymentState}
                    onRetry={onMeshRetry}
                    onCancel={onMeshCancel}
                    onContinue={onNext}
                />
            );

        case 'settings':
            return <ComponentConfigStep {...baseProps} />;

        case 'review':
            return <ReviewStep state={state} updateState={updateState} setCanProceed={setCanProceed} componentsData={componentsData?.data} />;

        case 'project-creation':
            return <ProjectCreationStep state={state} onBack={onBack} />;

        default:
            return null;
    }
}
