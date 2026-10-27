/**
 * What a setup step's Apply would change, as one line under its title in the setup guide (live
 * release test, 2026-10-22: a confirm said only that Demo Builder checks first; AB-81 moved it
 * from that confirm into the guide). Read from the demo setup's preview for that step as it is
 * shown.
 * The wait for the confirm in front of adding the integration lives here too.
 *
 * @module features/dashboard/ui/components/integrations/StepPlan
 */

import React from 'react';
import { usePreparationPreview } from './usePreparationPreview';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import type { PreparationStepReport } from '@/types/storePreparation';

/** The words this file shows, in one place. */
export const STEP_PREVIEW_COPY = {
    // "Checking …", as every other wait that reads before it acts says (owner, 2026-10-26).
    loading: 'Checking the store',
    // Row 2 of the add's wait, which reads every step, as every house wait says what it is
    // doing under its label (owner, 2026-10-26).
    loadingAll: 'Reading each setup step from Commerce',
    nothing: 'Already done in the store: nothing to change.',
    willDo: 'Apply will',
    noAnswer: "Couldn't read the store",
};

/**
 * While the preview is read, or why it could not be: the add's confirm shows it too.
 *
 * @param props.error - why the store could not be read, if it could not
 */
export function PreviewWait({ error }: { error?: string }): React.ReactElement {
    if (error) {
        return (
            <InlineNotice title={STEP_PREVIEW_COPY.noAnswer} testId="prepare-store-notice">
                {error}
            </InlineNotice>
        );
    }
    // The house wait, centred, as every other modal waits (owner, 2026-10-26: a small
    // spinner beside the words read as a different extension).
    return (
        <div data-testid="prepare-store-loading">
            <LoadingDisplay
                size="L"
                message={STEP_PREVIEW_COPY.loading}
                subMessage={STEP_PREVIEW_COPY.loadingAll}
            />
        </div>
    );
}

/** "Add Test Warehouse" as it reads after "Apply will": lower-case first letter. */
const lowerFirst = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);

/** One change as a clause: a setting's "Name: No → Yes" is set, anything else is said as written. */
const clauseOf = (line: string): string => (line.includes(' → ') ? `set ${line}` : lowerFirst(line));

/**
 * What Apply will do, in one sentence: the step's own summary when it has one ("Apply will
 * add Test Warehouse to Justrite Stock, and switch Test Warehouse back on."), else its first
 * two changes and how many more.
 */
function willDo(step: PreparationStepReport): string {
    if (step.summary) return `${STEP_PREVIEW_COPY.willDo} ${lowerFirst(step.summary)}.`;
    if (step.changes.length === 0) return step.manual ?? STEP_PREVIEW_COPY.nothing;
    const first = step.changes.slice(0, 2).map(clauseOf).join(' and ');
    const more = step.changes.length > 2 ? `, and ${step.changes.length - 2} more` : '';
    return `${STEP_PREVIEW_COPY.willDo} ${first}${more}.`;
}

/**
 * What a step's Apply will do, the one line under its title in the setup guide (AB-81), read
 * from the store as the step is shown. Pressing Apply this step is the go-ahead: no confirm
 * window (owner, 2026-10-26).
 */
export function StepPlan({ id, stepId }: { id: string; stepId: string }): React.ReactElement {
    const { steps, error } = usePreparationPreview(id, [stepId]);
    const step = steps?.find((candidate) => candidate.id === stepId);
    let plan: string;
    if (error) plan = error;
    else if (!steps) plan = STEP_PREVIEW_COPY.loading;
    else if (!step || step.state === 'done' || step.state === 'applied') plan = STEP_PREVIEW_COPY.nothing;
    else plan = willDo(step);
    return <span data-testid="prepare-step-changes">{plan}</span>;
}
