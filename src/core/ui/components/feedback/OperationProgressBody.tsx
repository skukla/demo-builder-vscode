/**
 * OperationProgressBody — the one row of the progress modal that changes: a question
 * the run is paused on, its failure, its success, or where the work has got to and
 * how long the run has been going. `progressFrame` gives the dialog around it its title: a
 * question is the title (`docs/development/sop/dialog-design.md`); an end names the thing in the
 * title and the body draws what happened, the large mark and the outcome under it, in the shared
 * `ResultBody` (owner, 2026-11-17, walk F222).
 *
 * Split out of {@link OperationProgressModal} (2026-10-16), which keeps the dialog,
 * its buttons and the state that drives them.
 *
 * @module core/ui/components/feedback/OperationProgressBody
 */

import React, { useRef } from 'react';
import { OperationQuestion } from '@/core/ui/components/feedback/OperationQuestion';
import { ResultBody } from '@/core/ui/components/feedback/ResultBody';
import { StageRows, type WaitLines } from '@/core/ui/components/feedback/StageWait';
import { StepRows } from '@/core/ui/components/feedback/StepRows';
import { WorkRow } from '@/core/ui/components/feedback/WorkRow';
import { WorkRowColumns } from '@/core/ui/components/feedback/WorkRowColumns';
import { LeadText } from '@/core/ui/components/ui/LeadText';
import type { ModalStatus } from '@/core/ui/components/ui/Modal';
import { useRunClock } from '@/core/ui/hooks/useRunClock';
import { cn } from '@/core/ui/utils/classNames';
import { resultOutcome } from '@/core/ui/utils/resultWords';
import { endStatus, endsClean, type RunEnding } from '@/core/ui/utils/runEnding';
import type { PlainText } from '@/core/utils/plainText';
import { PREPARING, rowsLines } from '@/core/utils/runStage';
import { stageLine } from '@/core/utils/stageLine';
import type { OperationChange, OperationPrompt, OperationProgressPayload, OperationRow } from '@/types/webviewPayloads';

export interface OperationProgressBodyProps {
    prompt?: OperationPrompt;
    failed: boolean;
    succeeded: boolean;
    /** The success view's sentence: the run's warning or note, then what is left to do. */
    successMessage?: string;
    progress?: OperationProgressPayload | null;
    /** Every keystroke in a question's fields, for the buttons to hand back. */
    onTyped: (values: Record<string, string>) => void;
    /** What the run acts on: while it runs, a line under the title, clear of the level spinner. */
    subject?: string;
    /** How it ended, once it has: the mark's colour and the outcome under it (`progressFrame`). */
    ending?: RunOutcome;
}

/** How a run ended, as its body draws it: the mark and the words under it. */
export interface RunOutcome {
    status?: ModalStatus;
    outcome: string;
}

const NO_OUTCOME: RunOutcome = { outcome: '' };

/** The one row that changes: a question, a failure, or where the work has got to. */
/**
 * The centred lines while a run goes: line 1 its stage (its job), line 2 the part under way, from
 * its rows when it sends them (owner, 2026-11-16), else its step; line 3 how long it usually takes.
 */
function runningLines(progress: OperationProgressPayload | null | undefined): WaitLines {
    const stage = progress?.stage ? stageLine(progress.stage, progress.position) : undefined;
    if (progress?.rows?.length) return rowsLines(progress.rows, stage);
    const label = stage ?? PREPARING;
    return { label, detail: progress?.step, expectation: progress?.expectation };
}

/**
 * A push with nothing under way: "Starting" mid-run, or rows none of which is working (a save passes
 * the reads it has no types for, its stage still set; walk F194). The last lines stay.
 */
function betweenSteps(progress: OperationProgressPayload | null | undefined, now: WaitLines): boolean {
    if (now.label === PREPARING) return true;
    const rows = progress?.rows;
    return rows !== undefined && rows.length > 0 && !rows.some((row) => row.status === 'checking');
}

export function OperationProgressBody({
    prompt,
    failed,
    succeeded,
    successMessage,
    progress,
    onTyped,
    subject,
    ending = NO_OUTCOME,
}: OperationProgressBodyProps): React.ReactElement | null {
    // The whole run, from the start the extension stamped on every push. The only
    // thing that moves while a step waits on Adobe.
    const total = useRunClock(progress?.state === 'running' ? progress.startedAt : undefined);
    // The last lines shown: a push between two steps, with none under way, keeps them rather than
    // going back to "Starting" mid-run (owner walk, 2026-11-16).
    const lastLines = useRef<WaitLines | null>(null);
    if (prompt?.fields?.length || prompt?.steps?.length) {
        // The question and what it needs typed, together: the modal owns the form
        // rather than handing off to a VS Code input box (owner, 2026-09-20).
        return <OperationQuestion prompt={prompt} onTyped={onTyped} />;
    }
    if (prompt) {
        // The question is the dialog's title (`progressFrame`); its sentence, when it has a
        // heading of its own, is the body.
        return prompt.title ? <LeadText>{prompt.message}</LeadText> : null;
    }
    if (failed) {
        return <EndView ending={ending} message={progress?.error} reason={progress?.error} rows={progress?.rows} tookMs={progress?.tookMs} failed />;
    }
    if (succeeded) return <SuccessEnd ending={ending} message={successMessage} progress={progress} />;
    // A run that sends its parts as rows says the one under way, centred, step to step: one
    // project's run is the wizard's view, never a checklist (owner, 2026-11-16). Its rows come back
    // only for how it ended (walk F91 asked for more than one line over a save's minutes of reading:
    // the part under way and its count are that line).
    const now = runningLines(progress);
    const lines = betweenSteps(progress, now) && lastLines.current ? lastLines.current : now;
    lastLines.current = lines;
    // Size L, as every other progress display here: M left-aligns and shrinks
    // the text.
    // The room for all three lines is kept and what is there sits level in it, so the spinner does
    // not ride high over a blank line, and the box does not move when a line arrives. Row 3 only
    // when it has words: `expectationLine` answers a blank for a screen that holds the row.
    // The same three rows a dialog's wait shows (`StageRows`), large here.
    return (
        <div className={cn('modal-wait', 'modal-wait-progress', subject && 'modal-wait-progress-subject')}>
            {subject && <div className="modal-progress-subject">{subject}</div>}
            {/* Rows 2 and 3 hold their room from the first frame, so nothing shifts when a count or the
                first second arrives (owner, 2026-11-16: "It shouldn't shift", over the 2026-11-01 rule
                of no blank rows under "Starting"). */}
            <StageRows hold clock={total} lines={lines} />
        </div>
    );
}

/**
 * A run's rows: steps with rows under them as the import's window draws them (`StepRows`; a save's
 * Export from Commerce and its data types, Phase 7b), else flat, two columns.
 */
function RunRows({ rows }: { rows: readonly OperationRow[] }): React.ReactElement {
    if (rows.some((row) => row.types && row.types.length > 0)) return <StepRows steps={rows} columns={2} />;
    return <WorkRowColumns rows={rows} columns={2} />;
}

/**
 * Whether a run that succeeded keeps its rows on screen: it sent rows, and by the shared rule
 * (`endsClean`) it did not end clean, a warning or a row with a problem, a nested row's included.
 * A row's note reaches here as a problem that did not fail (`runRows.ts`). The modal holds such an
 * ending open to be read.
 */
export function keepsRows(progress?: OperationProgressPayload | null): boolean {
    // A step's nested rows count as its own: a problem on a data type under a step keeps them too.
    return (progress?.rows ?? []).length > 0 && !endsClean({ succeeded: true, ...progressEnding(progress) });
}

/**
 * A progress payload as the shared ending rules read it: its warning, and its rows, each with its
 * nested rows. Every row's problem is one (Commerce refused, a part that failed); the run's note,
 * details and changes are things to know, which the rows do not carry.
 */
export function progressEnding(progress?: OperationProgressPayload | null): Pick<RunEnding, 'warning' | 'rows'> {
    return { warning: progress?.warning, rows: progress?.rows ?? [] };
}

/**
 * A success. A clean run's rows say nothing its outcome does not, so they are left out; one with a
 * warning or a row's problem keeps them (dialog design rules; review, 2026-11-10, the save window;
 * plan step-03 S1, the problem row the warning-only rule hid). "Took …" stays either way: the
 * window keeps the run's size (owner, 2026-11-17, walk F222).
 */
function SuccessEnd({ ending, message, progress }: { ending: RunOutcome; message?: string; progress?: OperationProgressPayload | null }): React.ReactElement {
    const rows = keepsRows(progress) ? progress?.rows : undefined;
    return <EndView ending={ending} message={message} outcome={progress} rows={rows} tookMs={progress?.tookMs} />;
}

/** Whether a row, or a row nested under one, says what went wrong. */
function rowsSayAProblem(rows: readonly OperationRow[]): boolean {
    const said = (row: OperationRow): boolean => row.problem !== undefined;
    return rows.some((row) => said(row) || (row.types ?? []).some(said));
}

/**
 * A failed run's rows as it ended, its reason on the row that stopped when no row says it: red, in
 * place of that row's line, so it takes the room the line held rather than a line under the rows.
 */
function withReason(rows: OperationRow[], reason: PlainText | undefined): OperationRow[] {
    if (!reason || rowsSayAProblem(rows)) return rows;
    const at = rows.findIndex((row) => row.status === 'error');
    if (at < 0) return rows;
    return rows.map((row, i) => (i === at ? { ...row, problem: { text: reason, failed: true } } : row));
}

/**
 * How a run ended, under the title that names the thing (owner, 2026-11-17, walk F222): the large
 * mark and the outcome (`ResultBody`), then the sentence, the lines it left to know, its rows when
 * they have something to read, what it changed as rows, and how long a long run took.
 *
 * A failed run's reason sits on the row that stopped when it has rows, in the room the row's line
 * held, and no closing sentence repeats it (decisions Phase 1b, J1-3d growth, owner 2026-11-11). A
 * sentence no row can carry still says itself.
 */
function EndView({ ending, message, reason, outcome, rows, tookMs, failed = false }: {
    ending: RunOutcome;
    message?: string;
    /** A failed run's reason, in plain words: the row that stopped can carry it. */
    reason?: PlainText;
    /** The run's rows as it ended, when they have something to read. */
    rows?: OperationRow[];
    /** A success's lines and changes; none on a failure, whose reason is the message. */
    outcome?: Pick<OperationProgressPayload, 'details' | 'changes'> | null;
    /** How long the run took; said only for a long run. */
    tookMs?: number;
    /** The run failed: `message` is its reason, which the row that stopped can carry. */
    failed?: boolean;
}): React.ReactElement {
    const { details, changes } = outcome ?? {};
    const hasRows = Boolean(rows && rows.length > 0);
    const shown = rows && failed ? withReason(rows, reason) : rows;
    const lead = shown && hasRows && rowsSayAProblem(shown) ? undefined : message;
    return (
        <div data-testid="operation-end">
            <ResultBody
                {...(ending.status ? { status: ending.status } : {})}
                outcome={ending.outcome}
                lines={[lead, ...(details ?? [])]}
                {...(tookMs === undefined ? {} : { tookMs })}
            >
                {shown && hasRows ? <RunRows rows={shown} /> : null}
                {changes && changes.length > 0 ? <ChangeRows changes={changes} /> : null}
            </ResultBody>
        </div>
    );
}

/**
 * A question with a heading takes the title, amber; one with fields and no heading sits under the
 * run's title; one with only buttons is its own sentence as the heading.
 */
export function questionFrame(prompt: OperationPrompt, runTitle: string): ProgressFrame {
    // A routine step is no problem, so no warning by its title (owner walk, 2026-11-16).
    const status: Pick<ProgressFrame, 'status'> = prompt.tone === 'info' ? {} : { status: 'warning' };
    if (prompt.title) return { title: prompt.title, ...status };
    if (prompt.fields && prompt.fields.length > 0) return { title: runTitle };
    return { title: prompt.message, ...status };
}

/**
 * The dialog around the body: its title, and the status. A question's status is the title's icon;
 * an end's is the body's mark, with its outcome under it (`outcome` set).
 */
export interface ProgressFrame {
    title: string;
    status?: ModalStatus;
    /** Once it ended: what happened, for the body under the mark. */
    outcome?: string;
}

/**
 * The progress window's title for where the run stands: the run's own title while it works; the
 * thing once it ends, with the outcome for the body (green, amber when it succeeded with a warning
 * or a row's problem by the one amber rule, `endStatus`, red when it failed; owner, 2026-11-17,
 * walk F222); and a question with buttons as its own heading with an amber icon. A question with
 * fields sits under the run's title, as its form does.
 */
export function progressFrame(a: {
    title: string;
    /** What the run is about: the end's title ("Storefront", "My Luma"). */
    thing: string;
    successTitle: string;
    failureTitle: string;
    prompt?: OperationPrompt;
    failed: boolean;
    succeeded: boolean;
    /** How it ended, for the colour (`endStatus`): its warning and its rows (`progressEnding`). */
    ending: Pick<RunEnding, 'warning' | 'rows'>;
}): ProgressFrame {
    if (a.prompt) return questionFrame(a.prompt, a.title);
    if (a.failed) return { title: a.thing, status: 'error', outcome: resultOutcome(a.failureTitle, a.thing) };
    if (a.succeeded) {
        const status = endStatus({ succeeded: true, ...a.ending });
        return { title: a.thing, status, outcome: resultOutcome(a.successTitle, a.thing) };
    }
    return { title: a.title };
}

/**
 * What a run changed, a row per part: its name, then each change under it, left-aligned
 * as the Updates modal's run lists its work. Centred lines read as a paragraph nobody
 * could scan (owner, release test row 4.19, 2026-10-26). Styled by `work-row.css`, which
 * only the bundles whose runs send `changes` import (integrations).
 */
function ChangeRows({ changes }: { changes: OperationChange[] }): React.ReactElement {
    return (
        <ul className="work-row-list work-row-result" data-testid="operation-changes">
            {changes.map((change) => (
                <li key={change.label}>
                    <WorkRow status="success" label={change.label}>
                        {change.lines.map((line) => (
                            <div key={line} className="work-row-note">
                                {line}
                            </div>
                        ))}
                    </WorkRow>
                </li>
            ))}
        </ul>
    );
}
