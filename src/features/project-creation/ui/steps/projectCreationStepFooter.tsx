/**
 * The footer of the final wizard step: Cancel while creation runs or waits on a
 * GitHub App install, View Projects when it finished, Back when it failed or was
 * cancelled. The wizard's shared footer is hidden on this step
 * (`shouldShowWizardFooter`), so whatever this returns IS the footer — and a state
 * it does not cover is a state with no footer at all.
 *
 * Moved out of ProjectCreationStep.tsx on 2026-10-08 (EDS-8).
 *
 * @module features/project-creation/ui/steps/projectCreationStepFooter
 */

import { Button } from '@adobe/react-spectrum';
import React from 'react';
import { getCancelButtonText } from '../helpers/buttonTextHelpers';
import { PageFooter } from '@/core/ui/components/layout/PageFooter';

/**
 * Footer area - renders the appropriate buttons for each phase.
 */
export function StepFooterArea(props: {
    isActive: boolean;
    /**
     * `phase === 'creating'` with no progress event yet — the window between
     * mounting this step and the first message from the extension.
     *
     * Its own footer covered every state EXCEPT this one, and the shared wizard
     * footer is already gone by then (`shouldShowWizardFooter` hides on
     * `create-project`, because this step draws its own). So the footer vanished
     * for a beat on the way in from Publish Storefront — reported 2026-08-20.
     *
     * Cannot collide with the error branch below: that needs `progress.error`,
     * so progress exists and this is false.
     */
    isStarting: boolean;
    isGitHubAppInstall: boolean;
    isCompleted: boolean;
    isOpeningProject: boolean;
    showGenericError: boolean;
    isCancelling: boolean;
    hasError: boolean;
    onBack: () => void;
    onCancel: () => void;
    onOpenProject: () => void;
}) {
    const {
        isActive,
        isStarting,
        isGitHubAppInstall,
        isCompleted,
        isOpeningProject,
        showGenericError,
        isCancelling,
        hasError,
        onBack,
        onCancel,
        onOpenProject,
    } = props;

    if (isActive || isStarting || isGitHubAppInstall) {
        return (
            <PageFooter
                leftContent={
                    <Button
                        variant="secondary"
                        onPress={onCancel}
                        isQuiet
                        isDisabled={isCancelling}
                    >
                        {getCancelButtonText(false, isCancelling)}
                    </Button>
                }
                constrainWidth={true}
            />
        );
    }

    if (isCompleted && !hasError) {
        return (
            <PageFooter
                rightContent={
                    !isOpeningProject && (
                        <Button variant="cta" onPress={onOpenProject}>
                            View Projects
                        </Button>
                    )
                }
                constrainWidth={true}
            />
        );
    }

    if (showGenericError) {
        return (
            <PageFooter
                leftContent={
                    <Button variant="secondary" onPress={onBack} isQuiet>
                        Back
                    </Button>
                }
                constrainWidth={true}
            />
        );
    }

    return null;
}
