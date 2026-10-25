/**
 * What a setup step's Apply would change, in its confirm (live release test, 2026-10-22: the
 * confirm said only that Demo Builder checks first). Read from the "Prepare this store"
 * preview for that one step as the confirm opens, the same read the preview modal makes.
 *
 * @module features/dashboard/ui/components/integrations/PrepareStepPreview
 */

import { Flex, ProgressCircle, Text } from '@adobe/react-spectrum';
import React from 'react';
import { usePreparationPreview } from './usePreparationPreview';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';
import type { PreparationStepReport } from '@/types/storePreparation';

/** The words this file shows, in one place. */
export const STEP_PREVIEW_COPY = {
    loading: 'Reading what the store needs',
    changes: 'This will:',
    nothing: 'Already done in the store: nothing to change.',
    noAnswer: "Couldn't read the store",
};

/** While the preview is read, or why it could not be: the preview modal's lines too. */
export function PreviewWait({ error }: { error?: string }): React.ReactElement {
    if (error) {
        return (
            <InlineNotice title={STEP_PREVIEW_COPY.noAnswer} testId="prepare-store-notice">
                {error}
            </InlineNotice>
        );
    }
    return (
        <Flex alignItems="center" gap="size-100" data-testid="prepare-store-loading">
            <ProgressCircle size="S" isIndeterminate aria-label={STEP_PREVIEW_COPY.loading} />
            <Text>{STEP_PREVIEW_COPY.loading}</Text>
        </Flex>
    );
}

/**
 * One step's preview: what the apply would change, or that the store already has it; then
 * what it could not read and what it leaves by hand.
 */
function StepChanges({ step }: { step: PreparationStepReport | undefined }): React.ReactElement {
    const done = step === undefined || step.state === 'done' || step.state === 'applied';
    const changes = step?.changes ?? [];
    return (
        <>
            {done && <Text>{STEP_PREVIEW_COPY.nothing}</Text>}
            {changes.length > 0 && (
                <>
                    <Text>{STEP_PREVIEW_COPY.changes}</Text>
                    <ul data-testid="prepare-step-changes">
                        {changes.map((line) => (
                            <li key={line}>{line}</li>
                        ))}
                    </ul>
                </>
            )}
            {step?.rejected.map((line) => <Text key={line}>{line}</Text>)}
            {step?.manual && <Text>{step.manual}</Text>}
        </>
    );
}

/**
 * @param props - the integration and the step whose apply is being confirmed
 * @returns the step's preview, or the wait for it
 */
export function PrepareStepPreview({ id, stepId }: { id: string; stepId: string }): React.ReactElement {
    const { steps, error } = usePreparationPreview(id, stepId);
    if (!steps || error) return <PreviewWait error={error} />;
    return <StepChanges step={steps.find((step) => step.id === stepId)} />;
}
