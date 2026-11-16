/**
 * ProjectsBatchRunView — the batch window while its projects are reset or deleted (owner,
 * 2026-11-04): one row per project, drawn as the Updates run draws its rows (`WorkRow`, its icons
 * from `UpdatesRunView`), in the order the extension runs them. The running row says the step it
 * is on; once a row ends, what it has to say takes that line's room (rule 15): where its changes
 * were saved, or its problem as one line, red when it failed and orange when it finished around
 * something, its whole text on hover; a question the run is paused on is asked under the running
 * row, or above the list before any row runs.
 *
 * One project under way with nothing asked is the progress window's three rows instead, centred
 * (`OneRunning`, owner 2026-11-15); its ending is its row, as the run of several ends.
 *
 * @module features/projects-dashboard/ui/components/ProjectsBatchRunView
 */

import React from 'react';
import type { BatchRowStatuses, BatchRowTimings, BatchRunRow } from '../hooks/useProjectsBatch';
import { ICON_OF, RunQuestion } from './runWindowParts';
import { RunFoot, type RunFootProps } from '@/core/ui/components/feedback/RunFoot';
import { StageRows } from '@/core/ui/components/feedback/StageWait';
import { WorkRow } from '@/core/ui/components/feedback/WorkRow';
import { spanValue, useRunClock } from '@/core/ui/hooks/useRunClock';
import { PREPARING } from '@/core/utils/runStage';
import type { UpdateRowState } from '@/types/pendingUpdates';
import type { OperationProgressPayload, OperationPrompt } from '@/types/webviewPayloads';

/** The run has no clock of its own (each row keeps one): the foot only holds the Took line's room. */
const NOT_TIMED: NonNullable<RunFootProps['running']> = {};

/** The foot's props: the Took line once ended, its held room while the run goes. */
function footOf(ended: boolean, progress: OperationProgressPayload | null): Pick<RunFootProps, 'tookMs' | 'running'> {
    if (ended) return { tookMs: progress?.tookMs };
    return { running: NOT_TIMED };
}

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
    /** The run has ended, so a problem shows whole. */
    ended: boolean;
}

/**
 * The line under a project's name: every row has one, so none changes height as the run goes
 * (owner, 2026-11-04). Where a finished project's changes were saved takes Finished's place.
 */
function lineOf(state: UpdateRowState, message: string | undefined): string | undefined {
    if (state === 'waiting') return 'Waiting';
    if (state === 'running') return message ?? PREPARING;
    if (state === 'done') return message ?? 'Finished';
    return undefined;
}

/**
 * What an ended row has to say that is a problem, as ONE line in the room its working line held
 * (rules 13 to 15, step-07 follow-up; the house `WorkRow.problem`): a failed project's reason, red,
 * with what became of its datapack after it; a finished project's warnings (the code not published,
 * a datapack that stayed), orange, with where its changes were saved. The whole text is on hover.
 */
function problemOf(state: UpdateRowState, status: BatchRowStatuses[string]): { text: string; failed: boolean } | undefined {
    const warnings = status?.warnings ?? [];
    if (state === 'failed') return { text: [status?.message ?? 'Failed', ...warnings].join(' '), failed: true };
    // Where its changes were saved is its own line (`savedLineOf`): run into the warning, it was cut
    // off behind it (live run 6, 2026-11-15).
    if (state === 'done' && warnings.length > 0) return { text: warnings.join(' '), failed: false };
    return undefined;
}

/** A finished row with a warning: where its changes were saved, under it, in plain text. */
function savedLineOf(state: UpdateRowState, status: BatchRowStatuses[string]): string | undefined {
    return state === 'done' && (status?.warnings?.length ?? 0) > 0 ? status?.message : undefined;
}

function RunRow({ row, statuses, timing, asking, onTyped, ended }: RowProps) {
    const status = statuses[row.path];
    const state = status?.state ?? 'waiting';
    // The single progress window's clock, per row (owner, 2026-11-04).
    const clock = useRunClock(state === 'running' ? timing?.startedAt : undefined);
    const question = state === 'running' ? asking : undefined;
    const problem = problemOf(state, status);
    const saved = savedLineOf(state, status);
    const detail = question || problem ? undefined : lineOf(state, status?.message);
    // A row left alone says why under its name, in place of a working line it never had.
    const note = state === 'skipped' ? status?.message : undefined;
    // A done row with a warning turns amber; a failed one stays red.
    const amber = question || (state === 'done' && problem !== undefined);
    return (
        <WorkRow
            status={amber ? 'warning' : ICON_OF[state]}
            label={row.name}
            detail={detail}
            note={note}
            {...(problem ? { problem } : {})}
            whole={ended}
            state={state}
            time={state === 'running' ? clock : spanValue(timing?.startedAt, timing?.endedAt)}
        >
            {question && <RunQuestion prompt={question} onTyped={onTyped} />}
            {saved && <div className="work-row-note">{saved}</div>}
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

/**
 * One project's run as the progress window shows a single operation (owner, 2026-11-15): the three
 * rows, centred and large, what it is doing, what on, and how long that usually takes with its
 * clock. A list of one row read as a run of several with one in it.
 */
function OneRunning({ status, timing }: { status: BatchRowStatuses[string] | undefined; timing?: BatchRowTimings[string] }) {
    const clock = useRunClock(timing?.startedAt);
    const running = status?.state === 'running';
    return (
        <div className="modal-wait modal-wait-progress">
            <StageRows
                size="L"
                clock={clock}
                lines={{
                    label: (running && status?.message) || PREPARING,
                    ...(running && status?.step ? { detail: status.step } : {}),
                    ...(running && status?.expectation ? { expectation: status.expectation } : {}),
                }}
            />
        </div>
    );
}

/** Whether the run is one project still under way with nothing asked: the centred view. */
function oneUnderWay(rows: BatchRunRow[], statuses: BatchRowStatuses, ended: boolean, question: OperationPrompt | undefined): boolean {
    if (rows.length !== 1 || ended || question) return false;
    const state = statuses[rows[0].path]?.state ?? 'waiting';
    return state === 'waiting' || state === 'running';
}

/** Every project of the run and where it is. */
export function ProjectsBatchRunView({ rows, order, statuses, timings, progress, onTyped }: RunViewProps): React.ReactElement {
    const ended = progress?.state === 'failed' || progress?.state === 'succeeded';
    const question = ended ? undefined : progress?.prompt;
    if (oneUnderWay(rows, statuses, ended, question)) {
        return <OneRunning status={statuses[rows[0].path]} timing={timings[rows[0].path]} />;
    }
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
                        ended={ended}
                    />
                ),
            )}
            {/* How long the run took, as the single window ends a long one (over a minute). Its line is
                held while the run goes (the foot's held line), so it never grows the held window. */}
            <RunFoot {...footOf(ended, progress)} className="projects-batch-took" />
        </div>
    );
}
