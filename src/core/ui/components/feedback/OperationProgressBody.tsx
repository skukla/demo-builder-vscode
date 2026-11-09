/**
 * OperationProgressBody — the one row of the progress modal that changes: a question
 * the run is paused on, its failure, its success, or where the work has got to and
 * how long the run has been going. `progressFrame` gives the dialog around it its title
 * and status: by the dialog design rules (`docs/development/sop/dialog-design.md`, owner
 * 2026-10-31) an outcome or a question is the TITLE, so the body holds only what is left.
 *
 * Split out of {@link OperationProgressModal} (2026-10-16), which keeps the dialog,
 * its buttons and the state that drives them.
 *
 * @module core/ui/components/feedback/OperationProgressBody
 */

import React from 'react';
import { OperationQuestion } from '@/core/ui/components/feedback/OperationQuestion';
import { StageRows } from '@/core/ui/components/feedback/StageWait';
import { WorkRow } from '@/core/ui/components/feedback/WorkRow';
import { LeadText } from '@/core/ui/components/ui/LeadText';
import type { ModalStatus } from '@/core/ui/components/ui/Modal';
import { tookValue, useRunClock } from '@/core/ui/hooks/useRunClock';
import { cn } from '@/core/ui/utils/classNames';
import { stageLine } from '@/core/utils/stageLine';
import type { OperationChange, OperationPrompt, OperationProgressPayload } from '@/types/webviewPayloads';

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
}

/** The one row that changes: a question, a failure, or where the work has got to. */
export function OperationProgressBody({
    prompt,
    failed,
    succeeded,
    successMessage,
    progress,
    onTyped,
    subject,
}: OperationProgressBodyProps): React.ReactElement | null {
    // The whole run, from the start the extension stamped on every push. The only
    // thing that moves while a step waits on Adobe.
    const total = useRunClock(progress?.state === 'running' ? progress.startedAt : undefined);
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
        return <EndView message={progress?.error} took={tookWorthSaying(progress)} />;
    }
    if (succeeded) {
        return (
            <EndView message={successMessage} outcome={progress} took={tookWorthSaying(progress)} />
        );
    }
    // Size L, as every other progress display here: M left-aligns and shrinks
    // the text (ImportDatapackModal).
    // The room for all three lines is kept and what is there sits level in it, so the spinner does
    // not ride high over a blank line, and the box does not move when a line arrives. Row 3 only
    // when it has words: `expectationLine` answers a blank for a screen that holds the row.
    // The same three rows a dialog's wait shows (`StageRows`), large here.
    return (
        <div className={cn('modal-wait', 'modal-wait-progress', subject && 'modal-wait-progress-subject')}>
            {subject && <div className="modal-progress-subject">{subject}</div>}
            <StageRows
                size="L"
                clock={total}
                lines={{
                    label: progress?.stage ? stageLine(progress.stage, progress.position) : 'Starting',
                    detail: progress?.step,
                    expectation: progress?.expectation,
                }}
            />
        </div>
    );
}

/** How long the run took, when the extension timed it and it is long enough to say. */
function tookWorthSaying(progress?: OperationProgressPayload | null): string | undefined {
    return progress?.tookMs === undefined ? undefined : tookValue(progress.tookMs);
}

/**
 * How a run ended, below the title that says it: the sentence, the lines it left to know, what
 * it changed as rows, and how long a long run took. Nothing at all for a plain success, whose
 * title says everything. It was a status box repeating the title over the same lines, which read
 * as machine-made (dialog design rules, owner 2026-10-31).
 */
function EndView({ message, outcome, took }: {
    message?: string;
    /** A success's lines and changes; none on a failure, whose reason is the message. */
    outcome?: Pick<OperationProgressPayload, 'details' | 'changes'> | null;
    took?: string;
}): React.ReactElement | null {
    const { details: lines, changes } = outcome ?? {};
    const hasChanges = Boolean(changes && changes.length > 0);
    if (!message && !lines?.length && !hasChanges && took === undefined) return null;
    return (
        <div className="dialog-stack" data-testid="operation-end">
            {message ? <LeadText>{message}</LeadText> : null}
            {lines?.map((line) => (
                <p key={line} className="dialog-line">
                    {line}
                </p>
            ))}
            {changes && hasChanges ? <ChangeRows changes={changes} /> : null}
            {took !== undefined ? <p className="dialog-note">Took {took}</p> : null}
        </div>
    );
}

/**
 * A question with a heading takes the title, amber; one with fields and no heading sits under the
 * run's title; one with only buttons is its own sentence as the heading.
 */
export function questionFrame(prompt: OperationPrompt, runTitle: string): ProgressFrame {
    if (prompt.title) return { title: prompt.title, status: 'warning' };
    if (prompt.fields && prompt.fields.length > 0) return { title: runTitle };
    return { title: prompt.message, status: 'warning' };
}

/** The dialog around the body: its title and the title's status. */
export interface ProgressFrame {
    title: string;
    status?: ModalStatus;
}

/**
 * The progress window's title for where the run stands: the run's own title while it works, the
 * outcome when it ends (green, amber when it succeeded with a warning, red when it failed), and a
 * question with buttons as its own heading with an amber icon. A question with fields sits under
 * the run's title, as its form does.
 */
export function progressFrame(a: {
    title: string;
    successTitle: string;
    failureTitle: string;
    prompt?: OperationPrompt;
    failed: boolean;
    succeeded: boolean;
    warned: boolean;
}): ProgressFrame {
    if (a.prompt) return questionFrame(a.prompt, a.title);
    if (a.failed) return { title: a.failureTitle, status: 'error' };
    if (a.succeeded) return { title: a.successTitle, status: a.warned ? 'warning' : 'success' };
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
