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

import { Flex, Text } from '@adobe/react-spectrum';
import React from 'react';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { OperationPromptForm } from '@/core/ui/components/feedback/OperationPromptForm';
import { WorkRow } from '@/core/ui/components/feedback/WorkRow';
import { LeadText } from '@/core/ui/components/ui/LeadText';
import type { ModalStatus } from '@/core/ui/components/ui/Modal';
import { tookValue, useRunClock } from '@/core/ui/hooks/useRunClock';
import { expectationLine, stageLine } from '@/core/utils/stageLine';
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
}

/** The one row that changes: a question, a failure, or where the work has got to. */
export function OperationProgressBody({
    prompt,
    failed,
    succeeded,
    successMessage,
    progress,
    onTyped,
}: OperationProgressBodyProps): React.ReactElement | null {
    // The whole run, from the start the extension stamped on every push. The only
    // thing that moves while a step waits on Adobe.
    const total = useRunClock(progress?.state === 'running' ? progress.startedAt : undefined);
    if (prompt?.fields?.length) {
        // The question and what it needs typed, together: the modal owns the form
        // rather than handing off to a VS Code input box (owner, 2026-09-20).
        return (
            <Flex direction="column" gap="size-200" width="100%">
                <Text>{prompt.message}</Text>
                <OperationPromptForm fields={prompt.fields} onChange={onTyped} />
            </Flex>
        );
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
            <EndView
                message={successMessage}
                lines={progress?.details}
                changes={progress?.changes}
                took={tookWorthSaying(progress)}
            />
        );
    }
    // Size L, as every other progress display here: M left-aligns and shrinks
    // the text (ImportDatapackModal).
    return (
        <LoadingDisplay
            size="L"
            steady
            message={progress?.stage ? stageLine(progress.stage, progress.position) : 'Starting'}
            subMessage={progress?.step}
            helperText={expectationLine(progress?.expectation, total)}
        />
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
function EndView({ message, lines, changes, took }: {
    message?: string;
    lines?: string[];
    changes?: OperationChange[];
    took?: string;
}): React.ReactElement | null {
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

/** A question with buttons is its own heading; one with fields sits under the run's title. */
function questionFrame(prompt: OperationPrompt, runTitle: string): ProgressFrame {
    if (prompt.fields && prompt.fields.length > 0) return { title: runTitle };
    return { title: prompt.title || prompt.message, status: 'warning' };
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
