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
import { DataSourceConfigStep } from '@/features/eds/ui/steps/DataSourceConfigStep';
import { GitHubSetupStep } from '@/features/eds/ui/steps/GitHubSetupStep';
import { GitHubRepoSelectionStep } from '@/features/eds/ui/steps/GitHubRepoSelectionStep';
import { PrerequisitesStep } from '@/features/prerequisites/ui/steps/PrerequisitesStep';
import { ArchitectureSelectionStep } from '@/features/project-creation/ui/steps/ArchitectureSelectionStep';
import { ProjectCreationStep } from '@/features/project-creation/ui/steps/ProjectCreationStep';
import { ReviewStep, ComponentsData } from '@/features/project-creation/ui/steps/ReviewStep';
import { WelcomeStep } from '@/features/project-creation/ui/steps/WelcomeStep';
import type { Brand } from '@/types/brands';
import type { Stack } from '@/types/stacks';
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
    /** Available brands for selection */
    brands?: Brand[];
    /** Available stacks for selection */
    stacks?: Stack[];
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
    brands,
    stacks,
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
            return <WelcomeStep {...baseProps} existingProjectNames={existingProjectNames} brands={brands} stacks={stacks} />;

        case 'architecture-selection':
            return <ArchitectureSelectionStep {...baseProps} stacks={stacks || []} brands={brands || []} />;

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

        // EDS steps (conditional: shown only for edge-delivery stack)
        case 'eds-github':
            return <GitHubSetupStep {...baseProps} />;

        case 'eds-repository-config':
            return <GitHubRepoSelectionStep {...baseProps} />;

        case 'eds-data-source':
            return <DataSourceConfigStep {...baseProps} />;

        // Note: 'api-mesh' and 'mesh-deployment' steps removed from wizard
        // Mesh deployment now happens during ProjectCreationStep Phase 3

        case 'settings':
            return <ComponentConfigStep {...baseProps} />;

        case 'review':
            return <ReviewStep state={state} updateState={updateState} setCanProceed={setCanProceed} componentsData={componentsData?.data} brands={brands} stacks={stacks} />;

        case 'project-creation':
            return <ProjectCreationStep state={state} onBack={onBack} />;

        default:
            return null;
    }
}
