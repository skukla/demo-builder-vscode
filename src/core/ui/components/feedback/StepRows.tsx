/**
 * A run's steps as rows: one `WorkRow` per step, its problem under it, and the rows nested under a
 * step that has them (`OperationRow.types`), small, in columns (`WorkRowColumns` dense). Moved out of
 * `ImportRunView` (step-04 R3) so a progress row can carry nested rows the same way.
 *
 * Styled by `work-row.css` (`.step-rows`: the steps' spacing, bold titles and muted lines;
 * `.step-rows-nested`: the rows under a step), which every bundle drawing the import's window or the
 * progress modal imports (a datapack save's Export from Commerce and its data types, Phase 7b).
 *
 * @module core/ui/components/feedback/StepRows
 */

import React from 'react';
import { WorkRow } from '@/core/ui/components/feedback/WorkRow';
import { WorkRowColumns } from '@/core/ui/components/feedback/WorkRowColumns';
import type { OperationRow } from '@/types/webviewPayloads';

/** One step: its row, its problem under it, and its nested rows. */
function Step({ step, columns }: { step: OperationRow; columns: 1 | 2 }): React.ReactElement {
    return (
        <WorkRow
            status={step.status}
            label={step.label}
            {...(step.line ? { detail: step.line } : {})}
            state={step.status === 'success' ? 'done' : step.status}
        >
            {step.problem ? (
                <p
                    className={
                        step.problem.failed
                            ? 'dialog-problem text-negative'
                            : 'dialog-problem text-notice'
                    }
                >
                    {step.problem.text}
                </p>
            ) : null}
            {step.types && step.types.length > 0 ? (
                <div className="step-rows-nested">
                    <WorkRowColumns rows={step.types} columns={columns} dense />
                </div>
            ) : null}
        </WorkRow>
    );
}

export interface StepRowsProps {
    steps: readonly OperationRow[];
    /** The nested rows' columns. */
    columns: 1 | 2;
}

export function StepRows({ steps, columns }: StepRowsProps): React.ReactElement {
    return (
        <div className="step-rows">
            {steps.map((step) => (
                <Step key={step.kind} step={step} columns={columns} />
            ))}
        </div>
    );
}
