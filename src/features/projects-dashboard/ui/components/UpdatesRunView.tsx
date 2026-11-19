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
 * A run that ends with rows the SC unticked still waiting says how many above the list
 * (owner, 2026-10-22). Once it ends, the outcome sits over the rows under its large mark, the
 * shared `ResultBody`, in the same window (owner, 2026-11-17, walk F222).
 *
 * @module features/projects-dashboard/ui/components/UpdatesRunView
 */

import React, { useEffect } from 'react';
import type { RowFixControls, RowStatuses } from '../hooks/useUpdatesModal';
import { ICON_OF, RunQuestion } from './runWindowParts';
import { groupsOf, type RowGroup } from './updateGroups';
import { AI_HAS_IT, fixOf, UpdateRowFix } from './UpdateRowFix';
import { StepProgressBar } from '@/core/ui/components/feedback/StepProgressBar';
import { StepStatusIcon, type StepStatus } from '@/core/ui/components/feedback/StepStatusIcon';
import { WorkRow } from '@/core/ui/components/feedback/WorkRow';
import { useAutoScroll } from '@/core/ui/hooks/useAutoScroll';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { stageLine } from '@/core/utils/stageLine';
import { localCopyRowId, type PendingUpdateRow, type UpdateRowState, type UpdateRowStatus } from '@/types/pendingUpdates';
import type { UnifiedProgress } from '@/types/webview';
import type { OperationProgressPayload, OperationPrompt } from '@/types/webviewPayloads';

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
    /** Once the run has ended: how many rows the SC left unticked are still waiting. */
    remaining: number;
    /** Once the run has ended: fixing what did not apply, a row at a time, in place. */
    rowFix: RowFixControls;
}

/** "1 update pending", "2 updates pending": under the outcome, when the SC left some for later. */
export function waitingLine(count: number): string {
    return count === 1 ? '1 update pending' : `${count} updates pending`;
}

/**
 * What one row says under its name: while it runs, the step the run is on, as the Prerequisites
 * step says what it is doing ("Updating add-ons"); else its detail. The step's item ("Demo Builder
 * Blocks in Tailspin") is not repeated, since the row's name already says it (owner, 2026-11-19).
 */
function lineOf(row: PendingUpdateRow, state: UpdateRowState, stage: string | undefined): string {
    return state === 'running' && stage ? stage : row.detail;
}

/** What the running row is told: the step it is on, or the question it is asking. */
interface Live {
    /** The step the run is on ("Updating your local copy"). */
    stage?: string;
    /** Which part of it is in flight, when it says: "Installing dependencies: Justrite ERP". */
    part?: string;
    /** The run has ended: a local copy step it never reached is not drawn. */
    ended?: boolean;
    /** Once it has ended: the button on each update that did not apply. */
    rowFix?: RowFixControls;
    question?: OperationPrompt;
    onTyped: (values: Record<string, string>) => void;
}

/** One step in a panel: its icon, its name and line, why it ended as it did, and a question it asks. */
interface StepProps {
    label: string;
    detail: string;
    status: UpdateRowStatus | undefined;
    asking?: OperationPrompt;
    onTyped?: Live['onTyped'];
    /** While it runs, where it is among its project's steps: the bar says it in place of the line. */
    progress?: UnifiedProgress;
    /** Once the run has ended, at the row's right: Retry, Fix with AI or Check Again. */
    action?: React.ReactNode;
    /** In place of why it failed: the SC's AI has it, or why the AI did not open. */
    noteInstead?: string;
}

/**
 * Where a running step is among its project's steps, as Prerequisites says it ("Step 2/3:
 * Updating your local copy"), for a project with more than one step (owner, 2026-11-19).
 */
export function stepProgressOf(index: number, total: number, stepName: string, part?: string): UnifiedProgress | undefined {
    if (total < 2 || index < 0) return undefined;
    const overall = { percent: Math.round((index / total) * 100), currentStep: index + 1, totalSteps: total, stepName };
    return part ? { overall, command: { type: 'indeterminate', detail: part, confidence: 'synthetic' } } : { overall };
}

function Step({ label, detail, status, asking, onTyped, progress, action, noteInstead }: StepProps) {
    const state = status?.state ?? 'waiting';
    // Red only for a failure: a row left alone carries its yellow icon, and says why in the
    // warning's orange (`WorkRow`; red until 2026-10-21, grey until decisions Phase 1b, J1-3d).
    const note = noteInstead ?? (status?.message && state !== 'running' ? status.message : undefined);
    return (
        <WorkRow
            status={asking ? 'warning' : ICON_OF[state]}
            label={label}
            detail={progress ? '' : detail}
            note={note}
            why={state === 'failed' && noteInstead === undefined}
            state={state}
            action={action}
        >
            {progress && <StepProgressBar progress={progress} detailBelow />}
            {asking && onTyped && <RunQuestion prompt={asking} onTyped={onTyped} />}
        </WorkRow>
    );
}

/** Where a step sits in its card: its place and how many steps the card has. */
interface Place {
    index: number;
    total: number;
}

function RunRow({ row, statuses, live, place }: { row: PendingUpdateRow; statuses: RowStatuses; live: Live; place: Place }) {
    const status = statuses[row.id];
    const state = status?.state ?? 'waiting';
    const asking = state === 'running' ? live.question : undefined;
    const stepLine = lineOf(row, state, asking ? undefined : live.stage);
    const running = state === 'running' && !asking;
    const progress = running ? stepProgressOf(place.index, place.total, stepLine, live.part) : undefined;
    // With no count to show, the part in flight says more than the step's name.
    const detail = running && live.part ? live.part : stepLine;
    const fixable = live.ended && state === 'failed' && live.rowFix ? live.rowFix : undefined;
    return (
        <Step
            label={row.label}
            detail={detail}
            status={status}
            asking={asking}
            onTyped={live.onTyped}
            progress={progress}
            action={fixable && <UpdateRowFix id={row.id} controls={fixable} />}
            noteInstead={fixable && noteWhileFixing(fixOf(fixable, row.id))}
        />
    );
}

/** What a failed row says in place of why, while it is being fixed: the AI's, or its refusal. */
function noteWhileFixing(fix: { withAi: boolean; problem?: string }): string | undefined {
    if (fix.problem) return fix.problem;
    return fix.withAi ? AI_HAS_IT : undefined;
}

const LOCAL_COPY_LINE: Partial<Record<UpdateRowState, string>> = {
    running: OPERATION_STAGES.updatingLocalCopy.label,
    done: 'Up to date with GitHub',
};

/**
 * The project's local copy, brought up to what its updates wrote on GitHub: a step of
 * its own after them, which keeps its outcome. Only a project whose updates wrote to
 * GitHub, and that has a local copy, has one.
 */
function LocalCopyStep({ status, place }: { status: UpdateRowStatus; place: Place }) {
    const detail = LOCAL_COPY_LINE[status.state] ?? '';
    const progress = status.state === 'running' ? stepProgressOf(place.index, place.total, detail) : undefined;
    return <Step label="Your Local Copy" detail={detail} status={status} progress={progress} />;
}

/** Every row id in a project's card, its local copy last. */
function rowIdsOf(group: RowGroup): string[] {
    return [...group.rows.map((r) => r.id), localCopyRowId(group.key)];
}

/** The row running now and the card it is in, so the list can keep that card in view. */
export function runningRowOf(groups: RowGroup[], statuses: RowStatuses): { id: string; card: number } | undefined {
    for (const [card, group] of groups.entries()) {
        const id = rowIdsOf(group).find((rowId) => statuses[rowId]?.state === 'running');
        if (id) return { id, card };
    }
    return undefined;
}

interface RunGroupProps {
    group: RowGroup;
    statuses: RowStatuses;
    live: Live;
    cardRef?: (el: HTMLDivElement | null) => void;
}

/** One project as a card, as the Prerequisites step draws its checks; its spinner marks the running one. */
function RunGroup({ group, statuses, live, cardRef }: RunGroupProps) {
    // Told ahead as waiting; one the run ended without reaching (nothing wrote) is not drawn.
    const told = statuses[localCopyRowId(group.key)];
    const localCopy = live.ended && told?.state === 'waiting' ? undefined : told;
    const total = group.rows.length + (localCopy ? 1 : 0);
    const states = [...group.rows.map((r) => statuses[r.id]?.state ?? 'waiting'), ...(localCopy ? [localCopy.state] : [])];
    return (
        <div ref={cardRef} className="updates-group step-tile">
            <div className="updates-group-header updates-run-header">
                <span className="work-row-icon"><StepStatusIcon status={groupStatusOf(states)} /></span>
                <span className="project-row-name">{group.title}</span>
            </div>
            <div className="updates-group-rows">
                {group.rows.map((row, index) => (
                    <RunRow key={row.id} row={row} statuses={statuses} live={live} place={{ index, total }} />
                ))}
                {localCopy && <LocalCopyStep status={localCopy} place={{ index: group.rows.length, total }} />}
            </div>
        </div>
    );
}

/** Why the run failed, above the list, unless a row already says the same under its name. */
function failureLine(progress: OperationProgressPayload | null, rows: PendingUpdateRow[], statuses: RowStatuses): string | undefined {
    if (progress?.state !== 'failed') return undefined;
    const saidOnARow = rows.some((row) => statuses[row.id]?.message === progress.error);
    return saidOnARow ? undefined : progress.error;
}

/**
 * Every ticked row and where it is; a question under the row asking it, or above the list. The run
 * ends in place, as Prerequisites does (owner, 2026-11-19): the title says how it went, the cards
 * stay, and an update that did not apply carries its button. What no row says (why the run itself
 * failed, how many unticked updates still wait) is a line above the list.
 */
export function UpdatesRunView({ rows, statuses, progress, onTyped, remaining, rowFix }: RunViewProps): React.ReactElement {
    const ended = progress?.state === 'failed' || progress?.state === 'succeeded';
    const failure = failureLine(progress, rows, statuses);
    const waiting = progress?.state === 'succeeded' && remaining > 0 ? waitingLine(remaining) : undefined;
    const lines = ended ? [failure, waiting].filter((line): line is string => Boolean(line)) : [];
    return (
        <>
            {lines.map((line) => (
                <p key={line} className="dialog-line">
                    {line}
                </p>
            ))}
            <RunningList rows={rows} statuses={statuses} progress={progress} onTyped={onTyped} rowFix={rowFix} />
        </>
    );
}

/**
 * Which part of the step is in flight, in the house words for it (`stageLine`): only when the run
 * says which part, as an integration's redeploy does for each system it deploys.
 */
function partOf(progress: OperationProgressPayload | null): string | undefined {
    return progress?.position && progress.step ? stageLine(progress.step, progress.position) : undefined;
}

/**
 * The list while it runs. It follows the work, as the Prerequisites step does: each time
 * a row starts, the list scrolls just enough to show that row's card, and in between it
 * stays where the SC put it (owner, 2026-11-18, walk F290: with several projects, the one
 * updating was below the edge and nothing on screen moved).
 */
function RunningList({ rows, statuses, progress, onTyped, rowFix }: Omit<RunViewProps, 'remaining'>) {
    const { containerRef, createItemRef, scrollToItem } = useAutoScroll();
    const groups = groupsOf(rows);
    const now = runningRowOf(groups, statuses);
    const nowId = now?.id;
    const nowCard = now?.card;
    useEffect(() => {
        if (nowCard !== undefined) scrollToItem(nowCard);
    }, [nowId, nowCard, scrollToItem]);

    const running = progress?.state !== 'failed' && progress?.state !== 'succeeded';
    const question = running ? progress?.prompt : undefined;
    const live: Live = { stage: progress?.stage, part: partOf(progress), question, onTyped, ended: !running, rowFix };
    return (
        <div ref={containerRef} className="updates-group-list updates-run-list step-tiles scroll-fade scroll-fade--capped">
            {question && !now && <RunQuestion prompt={question} onTyped={onTyped} />}
            {groups.map((group, index) => (
                <RunGroup key={group.key} group={group} statuses={statuses} live={live} cardRef={createItemRef(index)} />
            ))}
        </div>
    );
}
