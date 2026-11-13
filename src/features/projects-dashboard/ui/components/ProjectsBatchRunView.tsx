/**
 * ProjectsBatchRunView — the batch window while its projects are reset or deleted (owner,
 * 2026-11-04): one row per project, drawn as the Updates run draws its rows (`WorkRow`, its icons
 * from `UpdatesRunView`), in the order the extension runs them. The running row says the step it
 * is on; a row that failed says why under its name; what a reset finished around, or what a failed
 * one did to the store, is said in orange under it; a question the run is paused on is asked under
 * the running row, or above the list before any row runs.
 *
 * @module features/projects-dashboard/ui/components/ProjectsBatchRunView
 */

import React from 'react';
import type { BatchRowStatuses, BatchRowTimings, BatchRunRow } from '../hooks/useProjectsBatch';
import { ICON_OF, RunQuestion } from './runWindowParts';
import { RunFoot } from '@/core/ui/components/feedback/RunFoot';
import { WorkRow } from '@/core/ui/components/feedback/WorkRow';
import { spanValue, useRunClock } from '@/core/ui/hooks/useRunClock';
import type { UpdateRowState } from '@/types/pendingUpdates';
import type { OperationProgressPayload, OperationPrompt } from '@/types/webviewPayloads';

interface RunViewProps {
    rows: BatchRunRow[];
    /** Paths in the order the extension first told them. */
    order: string[];
    statuses: BatchRowStatuses;
    timings: BatchRowTimings;
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
    timing?: BatchRowTimings[string];
    asking?: OperationPrompt;
    onTyped: RunViewProps['onTyped'];
}

/**
 * The line under a project's name: every row has one, so none changes height as the run goes
 * (owner, 2026-11-04). A failure's reason takes its place, in its own colour.
 */
function lineOf(state: UpdateRowState, message: string | undefined): string | undefined {
    if (state === 'waiting') return 'Waiting';
    if (state === 'running') return message ?? 'Starting';
    if (state === 'done') return 'Finished';
    return undefined;
}

function RunRow({ row, statuses, timing, asking, onTyped }: RowProps) {
    const status = statuses[row.path];
    const state = status?.state ?? 'waiting';
    // The single progress window's clock, per row (owner, 2026-11-04).
    const clock = useRunClock(state === 'running' ? timing?.startedAt : undefined);
    const question = state === 'running' ? asking : undefined;
    const detail = question ? undefined : lineOf(state, status?.message);
    // An ended row says what it has to: under Finished, or in place of it when it failed or was
    // left alone.
    const note = state === 'waiting' || state === 'running' ? undefined : status?.message;
    // What a reset finished around, or what a failed one did to the store: each line an orange
    // note, as a run row with a problem that did not fail is drawn (`StepRows`). A done row with
    // any turns amber; a failed one stays red.
    const warnings = state === 'done' || state === 'failed' ? (status?.warnings ?? []) : [];
    const amber = question || (state === 'done' && warnings.length > 0);
    return (
        <WorkRow
            status={amber ? 'warning' : ICON_OF[state]}
            label={row.name}
            detail={detail}
            note={note}
            why={state === 'failed'}
            state={state}
            time={state === 'running' ? clock : spanValue(timing?.startedAt, timing?.endedAt)}
        >
            {warnings.map((line, index) => (
                <p key={`${index}:${line}`} className="dialog-problem text-notice">{line}</p>
            ))}
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

/** The heading of a project whose file records no org, when the run is headed by org at all. */
const UNKNOWN_ORG = 'Organization Unknown';

/**
 * The rows in run order, an org's heading before each org's first row, when the run spans two or
 * more KNOWN orgs. A project that records no org is not a second org (owner, 2026-11-04: one org
 * beside one unrecorded drew a heading over half the list); under headings it is headed as unknown.
 */
function withOrgHeadings(rows: BatchRunRow[]): Array<{ heading: string } | { row: BatchRunRow }> {
    const known = new Set(rows.flatMap((row) => (row.org ? [row.org] : [])));
    if (known.size < 2) return rows.map((row) => ({ row }));
    return rows.flatMap((row, index) => {
        const starts = index === 0 || rows[index - 1].org !== row.org;
        if (!starts) return [{ row }];
        return [{ heading: row.org ?? UNKNOWN_ORG }, { row }];
    });
}

/** Every project of the run and where it is. */
export function ProjectsBatchRunView({ rows, order, statuses, timings, progress, onTyped }: RunViewProps): React.ReactElement {
    const ended = progress?.state === 'failed' || progress?.state === 'succeeded';
    const question = ended ? undefined : progress?.prompt;
    const shown = inRunOrder(rows, order);
    // Under the running row only when one is running; with several side by side it is about no
    // one row we can tell, so it is asked once, above the list (owner, 2026-11-04).
    const runningCount = shown.filter((row) => statuses[row.path]?.state === 'running').length;
    const underRow = runningCount === 1;
    const failure = failureLine(progress, rows, statuses);
    return (
        <div className="projects-batch-run">
            {failure && <p className="work-row-why">{failure}</p>}
            {question && !underRow && <RunQuestion prompt={question} onTyped={onTyped} />}
            {withOrgHeadings(shown).map((item) =>
                'heading' in item ? (
                    <p key={`org:${item.heading}`} className="projects-batch-org">{item.heading}</p>
                ) : (
                    <RunRow
                        key={item.row.path}
                        row={item.row}
                        statuses={statuses}
                        timing={timings[item.row.path]}
                        asking={underRow ? question : undefined}
                        onTyped={onTyped}
                    />
                ),
            )}
            {/* How long the run took, as the single window ends a long one (over a minute). */}
            {ended ? <RunFoot tookMs={progress?.tookMs} className="projects-batch-took" /> : null}
        </div>
    );
}
