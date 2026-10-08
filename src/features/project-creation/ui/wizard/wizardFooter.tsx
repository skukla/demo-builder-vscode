/**
 * The wizard's shared footer: Cancel on the left; Back (once there is somewhere
 * to go back to) and Continue on the right, with Continue's label decided by
 * `getNextButtonText`. Hidden on the steps that draw their own
 * (`shouldShowWizardFooter`, decided by the container).
 *
 * Moved out of WizardContainer.tsx on 2026-10-08 (EDS-8).
 *
 * @module features/project-creation/ui/wizard/wizardFooter
 */

import { Button, Flex } from '@adobe/react-spectrum';
import React from 'react';
import { getNextButtonText } from './wizardHelpers';
import { PageFooter } from '@/core/ui/components/layout/PageFooter';
import type { WizardState } from '@/types/webview';

export function WizardFooter(props: {
    canGoBack: boolean;
    canProceed: boolean;
    isConfirmingSelection: boolean;
    currentStepIndex: number;
    stepCount: number;
    wizardMode: WizardState['wizardMode'];
    currentStep: WizardState['currentStep'];
    onCancel: () => void;
    onBack: () => void;
    onNext: () => void;
}) {
    const {
        canGoBack,
        canProceed,
        isConfirmingSelection,
        currentStepIndex,
        stepCount,
        wizardMode,
        currentStep,
        onCancel,
        onBack,
        onNext,
    } = props;

    return (
        <PageFooter
            leftContent={
                <Button
                    variant="secondary"
                    onPress={onCancel}
                    isQuiet
                    isDisabled={isConfirmingSelection}
                >
                    Cancel
                </Button>
            }
            rightContent={
                <Flex gap="size-100">
                    {canGoBack && (
                        <Button
                            variant="secondary"
                            onPress={onBack}
                            isQuiet
                            isDisabled={isConfirmingSelection}
                        >
                            Back
                        </Button>
                    )}
                    <Button
                        variant="accent"
                        onPress={onNext}
                        isDisabled={!canProceed || isConfirmingSelection}
                    >
                        {getNextButtonText(
                            isConfirmingSelection,
                            currentStepIndex,
                            stepCount,
                            wizardMode,
                            currentStep,
                        )}
                    </Button>
                </Flex>
            }
            constrainWidth={true}
        />
    );
}
