/**
 * The footer of the final wizard step: Cancel while creation runs or waits on a
 * GitHub App install, View Projects when it finished (with Finish Setup beside it
 * when the run left steps, PL-101), Back when it failed or was cancelled. The
 * wizard's shared footer is hidden on this step (`shouldShowWizardFooter`), so whatever this returns IS the footer — and a state
 * it does not cover is a state with no footer at all.
 *
 * Moved out of ProjectCreationStep.tsx on 2026-10-08 (EDS-8).
 *
 * @module features/project-creation/ui/steps/projectCreationStepFooter
 */

import { Button, Flex } from '@adobe/react-spectrum';
import React from 'react';
import { getCancelButtonText } from '../helpers/buttonTextHelpers';
import { answerPause } from './projectCreationStepContent';
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
    /** Edit goes back to the project it came from; Create goes to the projects list. */
    isEdit?: boolean;
    /** The steps the run left still to do (PL-101): any, and Finish Setup sits beside the exit. */
    stepsRemaining?: number;
    /** Opens the project's dashboard with its Finish Setup guide. */
    onFinishSetup?: () => void;
    /** A step failed and waits, and the project can do without it: Skip This Step (F307). */
    canSkipStep?: boolean;
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
        isEdit = false,
        stepsRemaining = 0,
        onFinishSetup,
        canSkipStep = false,
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
                rightContent={
                    canSkipStep && !isCancelling && (
                        <Button variant="secondary" onPress={() => answerPause('Skip This Step')}>
                            Skip This Step
                        </Button>
                    )
                }
                constrainWidth={true}
            />
        );
    }

    if (isCompleted && !hasError) {
        // Finish Setup BESIDE the way out, never in its place (owner, 2026-11-17): the SC may
        // finish the steps later, from the dashboard's "N steps remaining".
        const finishSetup = stepsRemaining > 0 && onFinishSetup;
        return (
            <PageFooter
                rightContent={
                    !isOpeningProject && (
                        <Flex gap="size-100">
                            {finishSetup && (
                                <Button variant="secondary" onPress={onFinishSetup}>
                                    Finish Setup
                                </Button>
                            )}
                            <Button variant="cta" onPress={onOpenProject}>
                                {isEdit ? 'Back to Project' : 'View Projects'}
                            </Button>
                        </Flex>
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
