/**
 * One setup step as the confirm in front of adding the ERP integration lists it (AB-77,
 * owner 2026-10-22): its icon, its label with its state beside it, and what to read under it.
 * Drawn as the Updates modal draws its run (`WorkRow`).
 *
 * This file held "Prepare this store"'s window and the confirms in front of the setup guide's
 * Apply, Undo and Apply all until AB-82 (2026-10-26): the guide now applies in place
 * (`useGuideRun`), so only the row the add's confirm uses is left.
 *
 * @module features/dashboard/ui/components/integrations/PreparationStepRow
 */

import React from 'react';
import type { StepStatus } from '@/core/ui/components/feedback/StepStatusIcon';
import { WorkRow } from '@/core/ui/components/feedback/WorkRow';
import type { PreparationStepReport, PreparationStepState } from '@/types/storePreparation';

/** How each state reads in the list. */
export const STATE_WORDS: Record<PreparationStepState, string> = {
    done: 'Done',
    applicable: 'Will apply',
    manual: 'By hand',
    unknown: 'Could not check',
    applied: 'Applied',
    skipped: 'Already done',
    undone: 'Undone',
    rejected: 'Refused',
};

/** Each state's icon: done in any form green, still to do waiting, the SC's part a warning. */
const STATE_ICON: Record<PreparationStepState, StepStatus> = {
    done: 'success',
    applied: 'success',
    skipped: 'success',
    undone: 'success',
    applicable: 'pending',
    manual: 'warning',
    unknown: 'warning',
    rejected: 'error',
};

/** States that need nothing from the SC: the row is its name and state, no more. */
const SETTLED: ReadonlySet<PreparationStepState> = new Set(['done', 'applied', 'skipped', 'undone']);

/**
 * What a row says under its name, kept to what the SC acts on (owner, 2026-10-26: every
 * Done row carrying its check's sentence crowded out the two that needed anything). A step
 * still to apply says what it will do in one plain sentence (its summary, else its title),
 * not the raw lines its fix writes ("payment/payment_services/active at the website scope:
 * 0 → 1"), nor why: the check's note restated it, nor what it leaves by hand: the guide's
 * Then says it and the result repeats it (owner, 2026-10-26).
 * Anything else says what its check found and what it leaves by hand.
 */
function linesUnder(step: PreparationStepReport): string[] {
    if (SETTLED.has(step.state)) return [];
    if (step.state === 'applicable') return [step.summary ?? step.title];
    return [...step.changes, step.note, step.manual].filter((line): line is string => Boolean(line));
}

/**
 * One step of a preparation preview, drawn as the Updates modal draws its run
 * (`WorkRow`): its icon, its label with its state beside it, then what it changes, what
 * Commerce refused, what its check found, and what it leaves by hand. It was bare text, the
 * state run into the note after it (owner, 2026-10-26). The confirm in front of adding the
 * ERP integration lists its steps with it.
 */
export function PreparationStepRow({ step }: { step: PreparationStepReport }): React.ReactElement {
    const notes = linesUnder(step);
    return (
        <li data-state={step.state}>
            <WorkRow status={STATE_ICON[step.state]} label={step.label} detail={STATE_WORDS[step.state]}>
                {step.rejected.map((line) => (
                    <div key={line} className="work-row-why">{line}</div>
                ))}
                {notes.map((line) => (
                    <div key={line} className="work-row-note">{line}</div>
                ))}
            </WorkRow>
        </li>
    );
}
