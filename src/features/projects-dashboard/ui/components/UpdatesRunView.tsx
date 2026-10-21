/**
 * UpdatesRunView — the Updates modal while its updates are applied (2026-10-21).
 *
 * The rows the SC ticked, under the same headings, each with where it has got to, drawn
 * as the Prerequisites step draws its checks (`StepStatusIcon`): waiting, running,
 * done, did not apply. The running row says what it is doing now; a row that ended
 * with something to read says it under its name, so nothing waits for a second modal.
 * Each heading carries one icon for its project.
 *
 * A question the run is paused on is asked under the row it is about, with the rest of
 * the list still in view, as the Prerequisites step shows a check that needs the SC
 * (owner, 2026-10-21). It took the list's place, under the progress modal's "Waiting
 * for you" and a warning icon, until then: the SC lost which update was asking, and a
 * routine question read as an error. A question asked before any row runs (a demo that
 * is running) sits above the list. After a project's updates, bringing its local copy up
 * to GitHub is one more step in its panel, told like a row and keeping its outcome, so
 * the window never looks finished while it is still going (owner, 2026-10-21: it was a
 * stage line, first under the list and then in the panel, that vanished once passed).
 *
 * @module features/projects-dashboard/ui/components/UpdatesRunView
 */

import React from 'react';
import type { RowStatuses } from '../hooks/useUpdatesModal';
import { groupsOf, type RowGroup } from './updateGroups';
import { OperationPromptForm } from '@/core/ui/components/feedback/OperationPromptForm';
import { StepStatusIcon, type StepStatus } from '@/core/ui/components/feedback/StepStatusIcon';
import { localCopyRowId, type PendingUpdateRow, type UpdateRowState, type UpdateRowStatus } from '@/types/pendingUpdates';
import type { OperationProgressPayload, OperationPrompt } from '@/types/webviewPayloads';

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

/** What the running row is told: the step it is on, or the question it is asking. */
interface Live {
    step?: string;
    question?: OperationPrompt;
    onTyped: (values: Record<string, string>) => void;
}

/** A question in the list: its sentence, and any fields it needs typed. Its answers are the buttons. */
function RunQuestion({ prompt, onTyped }: { prompt: OperationPrompt; onTyped: Live['onTyped'] }) {
    return (
        <div className="updates-run-question" role="group" aria-label="Question">
            <p className="updates-run-question-text">{prompt.message}</p>
            {prompt.fields?.length ? <OperationPromptForm fields={prompt.fields} onChange={onTyped} /> : null}
        </div>
    );
}

/** One step in a panel: its icon, its name and line, why it ended as it did, and a question it asks. */
interface StepProps {
    label: string;
    detail: string;
    status: UpdateRowStatus | undefined;
    asking?: OperationPrompt;
    onTyped?: Live['onTyped'];
}

function Step({ label, detail, status, asking, onTyped }: StepProps) {
    const state = status?.state ?? 'waiting';
    return (
        <div className="updates-run-row" data-state={state}>
            <span className="updates-run-icon">
                <StepStatusIcon status={asking ? 'warning' : ICON_OF[state]} />
            </span>
            <div className="updates-run-text">
                <span className="checkbox-row-label">{label}</span>
                <span className="checkbox-row-detail">{detail}</span>
                {status?.message && state !== 'running' && (
                    // Red only for a failure: a row left alone carries its yellow icon, and
                    // says why in the note's grey (it was red until 2026-10-21).
                    <div className={state === 'failed' ? 'updates-run-why' : 'updates-run-note'}>{status.message}</div>
                )}
                {asking && onTyped && <RunQuestion prompt={asking} onTyped={onTyped} />}
            </div>
        </div>
    );
}

function RunRow({ row, statuses, live }: { row: PendingUpdateRow; statuses: RowStatuses; live: Live }) {
    const status = statuses[row.id];
    const state = status?.state ?? 'waiting';
    const asking = state === 'running' ? live.question : undefined;
    const detail = lineOf(row, state, asking ? undefined : live.step);
    return <Step label={row.label} detail={detail} status={status} asking={asking} onTyped={live.onTyped} />;
}

const LOCAL_COPY_LINE: Partial<Record<UpdateRowState, string>> = {
    running: 'Bringing it up to GitHub',
    done: 'Up to date with GitHub',
};

/**
 * The project's local copy, brought up to what its updates wrote on GitHub: a step of
 * its own after them, which keeps its outcome. Only a project whose updates wrote to
 * GitHub, and that has a local copy, has one.
 */
function LocalCopyStep({ status }: { status: UpdateRowStatus }) {
    return <Step label="Your local copy" detail={LOCAL_COPY_LINE[status.state] ?? ''} status={status} />;
}

function RunGroup({ group, statuses, live }: { group: RowGroup; statuses: RowStatuses; live: Live }) {
    const localCopy = statuses[localCopyRowId(group.key)];
    const states = [...group.rows.map((r) => statuses[r.id]?.state ?? 'waiting'), ...(localCopy ? [localCopy.state] : [])];
    return (
        <div className="updates-group">
            <div className="updates-group-header updates-run-header">
                <span className="updates-run-icon"><StepStatusIcon status={groupStatusOf(states)} /></span>
                <span className="project-row-name">{group.title}</span>
            </div>
            <div className="updates-group-rows">
                {group.rows.map((row) => (
                    <RunRow key={row.id} row={row} statuses={statuses} live={live} />
                ))}
                {localCopy && <LocalCopyStep status={localCopy} />}
            </div>
        </div>
    );
}

/** Every ticked row and where it is; a question under the row asking it, or above the list. */
export function UpdatesRunView({ rows, statuses, progress, onTyped }: RunViewProps): React.ReactElement {
    const running = progress?.state !== 'failed' && progress?.state !== 'succeeded';
    const question = running ? progress?.prompt : undefined;
    const rowRunning = rows.some((r) => statuses[r.id]?.state === 'running');
    const live: Live = { step: progress?.step, question, onTyped };
    // Inside the list, so a failure's reason does not make the window taller.
    return (
        <div className="updates-group-list">
            {progress?.state === 'failed' && <p className="updates-run-why">{progress.error}</p>}
            {question && !rowRunning && <RunQuestion prompt={question} onTyped={onTyped} />}
            {groupsOf(rows).map((group) => (
                <RunGroup key={group.key} group={group} statuses={statuses} live={live} />
            ))}
        </div>
    );
}
