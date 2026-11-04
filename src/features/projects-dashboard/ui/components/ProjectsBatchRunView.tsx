/**
 * ProjectsBatchRunView — the batch window while its projects are reset or deleted (owner,
 * 2026-11-04): one row per project, drawn as the Updates run draws its rows (`WorkRow`, its icons
 * from `UpdatesRunView`), in the order the extension runs them. The running row says the step it
 * is on; a row that failed says why under its name; a question the run is paused on is asked under
 * the running row, or above the list before any row runs.
 *
 * @module features/projects-dashboard/ui/components/ProjectsBatchRunView
 */

import React from 'react';
import type { BatchRowStatuses, BatchRunRow } from '../hooks/useProjectsBatch';
import { ICON_OF, RunQuestion } from './UpdatesRunView';
import { WorkRow } from '@/core/ui/components/feedback/WorkRow';
import type { OperationProgressPayload, OperationPrompt } from '@/types/webviewPayloads';

interface RunViewProps {
    rows: BatchRunRow[];
    /** Paths in the order the extension first told them. */
    order: string[];
    statuses: BatchRowStatuses;
    progress: OperationProgressPayload | null;
    onTyped: (values: Record<string, string>) => void;
}

/** The rows in the run's order; any not told yet keep the order they were asked in, after them. */
export function inRunOrder(rows: BatchRunRow[], order: string[]): BatchRunRow[] {
    const byPath = new Map(rows.map((row) => [row.path, row]));
    const told = order.flatMap((path) => byPath.get(path) ?? []);
    return [...told, ...rows.filter((row) => !order.includes(row.path))];
}

interface RowProps {
    row: BatchRunRow;
    statuses: BatchRowStatuses;
    asking?: OperationPrompt;
    onTyped: RunViewProps['onTyped'];
}

function RunRow({ row, statuses, asking, onTyped }: RowProps) {
    const status = statuses[row.path];
    const state = status?.state ?? 'waiting';
    const question = state === 'running' ? asking : undefined;
    // The running row says its step beside its name; an ended one says why under it.
    const detail = state === 'running' && !question ? status?.message : undefined;
    const note = state !== 'running' ? status?.message : undefined;
    return (
        <WorkRow
            status={question ? 'warning' : ICON_OF[state]}
            label={row.name}
            detail={detail}
            note={note}
            why={state === 'failed'}
            state={state}
        >
            {question && <RunQuestion prompt={question} onTyped={onTyped} />}
        </WorkRow>
    );
}

/** Why the run failed, above the list, unless a row already says the same under its name. */
function failureLine(progress: OperationProgressPayload | null, rows: BatchRunRow[], statuses: BatchRowStatuses): string | undefined {
    if (progress?.state !== 'failed') return undefined;
    const saidOnARow = rows.some((row) => statuses[row.path]?.message === progress.error);
    return saidOnARow ? undefined : progress.error;
}

/** Every project of the run and where it is. */
export function ProjectsBatchRunView({ rows, order, statuses, progress, onTyped }: RunViewProps): React.ReactElement {
    const ended = progress?.state === 'failed' || progress?.state === 'succeeded';
    const question = ended ? undefined : progress?.prompt;
    const shown = inRunOrder(rows, order);
    const rowRunning = shown.some((row) => statuses[row.path]?.state === 'running');
    const failure = failureLine(progress, rows, statuses);
    return (
        <div className="projects-batch-run">
            {failure && <p className="work-row-why">{failure}</p>}
            {question && !rowRunning && <RunQuestion prompt={question} onTyped={onTyped} />}
            {shown.map((row) => (
                <RunRow key={row.path} row={row} statuses={statuses} asking={question} onTyped={onTyped} />
            ))}
        </div>
    );
}
