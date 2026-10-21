/**
 * UpdatesRunView — the Updates modal while its updates are applied (2026-10-21).
 *
 * The rows the SC ticked, under the same headings, each with where it has got to, drawn
 * as the Prerequisites step draws its checks (`StepStatusIcon`): waiting, running,
 * done, did not apply. The running row says what it is doing now; a row that ended
 * with something to read says it under its name, so nothing waits for a second modal.
 * Each heading carries one icon for its project. A question the run is paused on takes
 * the list's place until it is answered, as it does in the progress modal, in a box of
 * the list's height: the window never changes size (owner, 2026-09-19).
 *
 * @module features/projects-dashboard/ui/components/UpdatesRunView
 */

import React from 'react';
import type { RowStatuses } from '../hooks/useUpdatesModal';
import { groupsOf, type RowGroup } from './updateGroups';
import { OperationProgressBody } from '@/core/ui/components/feedback/OperationProgressBody';
import { StepStatusIcon, type StepStatus } from '@/core/ui/components/feedback/StepStatusIcon';
import type { PendingUpdateRow, UpdateRowState } from '@/types/pendingUpdates';
import type { OperationProgressPayload } from '@/types/webviewPayloads';

const ICON_OF: Record<UpdateRowState, StepStatus> = {
    waiting: 'pending',
    running: 'checking',
    done: 'success',
    failed: 'error',
    skipped: 'warning',
};

/** One icon for a project: the worst that happened, else whether it is still going. */
export function groupStatusOf(states: UpdateRowState[]): StepStatus {
    if (states.includes('failed')) return 'error';
    if (states.includes('running')) return 'checking';
    if (states.includes('waiting')) return 'pending';
    return states.includes('skipped') ? 'warning' : 'success';
}

interface RunViewProps {
    rows: PendingUpdateRow[];
    statuses: RowStatuses;
    progress: OperationProgressPayload | null;
    onTyped: (values: Record<string, string>) => void;
}

/** What one row says beside its name: what it is doing while it runs, else its detail. */
function lineOf(row: PendingUpdateRow, state: UpdateRowState, step: string | undefined): string {
    return state === 'running' && step ? step : row.detail;
}

function RunRow({ row, statuses, step }: { row: PendingUpdateRow; statuses: RowStatuses; step?: string }) {
    const status = statuses[row.id];
    const state = status?.state ?? 'waiting';
    return (
        <div className="updates-run-row" data-state={state}>
            <span className="updates-run-icon"><StepStatusIcon status={ICON_OF[state]} /></span>
            <div className="updates-run-text">
                <span className="checkbox-row-label">{row.label}</span>
                <span className="checkbox-row-detail">{lineOf(row, state, step)}</span>
                {status?.message && state !== 'running' && (
                    <div className={state === 'done' ? 'updates-run-note' : 'updates-run-why'}>{status.message}</div>
                )}
            </div>
        </div>
    );
}

function RunGroup({ group, statuses, step }: { group: RowGroup; statuses: RowStatuses; step?: string }) {
    const status = groupStatusOf(group.rows.map((r) => statuses[r.id]?.state ?? 'waiting'));
    return (
        <div className="updates-group">
            <div className="updates-group-header updates-run-header">
                <span className="updates-run-icon"><StepStatusIcon status={status} /></span>
                <span className="project-row-name">{group.title}</span>
            </div>
            <div className="updates-group-rows">
                {group.rows.map((row) => (
                    <RunRow key={row.id} row={row} statuses={statuses} step={step} />
                ))}
            </div>
        </div>
    );
}

/** The run: a question while it waits on one, else every ticked row and where it is. */
export function UpdatesRunView({ rows, statuses, progress, onTyped }: RunViewProps): React.ReactElement {
    const running = progress?.state !== 'failed' && progress?.state !== 'succeeded';
    if (running && progress?.prompt) {
        return (
            <div className="updates-run-question">
                <OperationProgressBody
                    prompt={progress.prompt}
                    failed={false}
                    succeeded={false}
                    failureTitle=""
                    successTitle=""
                    warned={false}
                    progress={progress}
                    onTyped={onTyped}
                />
            </div>
        );
    }
    // Inside the list, so a failure's reason does not make the window taller.
    return (
        <div className="updates-group-list">
            {progress?.state === 'failed' && <p className="updates-run-why">{progress.error}</p>}
            {groupsOf(rows).map((group) => (
                <RunGroup key={group.key} group={group} statuses={statuses} step={progress?.step} />
            ))}
        </div>
    );
}
