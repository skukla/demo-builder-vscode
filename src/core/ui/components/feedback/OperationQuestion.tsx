/**
 * OperationQuestion — a question a paused run asks, drawn as the whole body of the window it is
 * asked in (owner, 2026-11-04, layout A): its sentence, the numbered steps that get the answer,
 * and the fields. The progress window asks every question with fields through
 * it; the Updates and projects batch runs ask a task through it (`questionTakesWindow`).
 *
 * Under the running row (the runs' `RunQuestion`) a sign-in read as that row's problem, when once
 * signed in the next project does not ask, and the window showed two layouts at once. A question
 * about the row itself stays there.
 *
 * `ui/NumberedInstructions` was the obvious reuse for the steps and does not fit: it draws a card
 * per step with a badge, styled by `step-scaffold.css`, which the batch and Updates windows' bundle
 * does not import. A question's steps are two short lines, so they are a plain numbered list.
 *
 * @module core/ui/components/feedback/OperationQuestion
 */

import React from 'react';
import { OperationPromptForm } from './OperationPromptForm';
import type { OperationPrompt } from '@/types/webviewPayloads';

export interface OperationQuestionProps {
    prompt: OperationPrompt;
    /** Every keystroke in the fields, for the window's buttons to hand back. */
    onTyped: (values: Record<string, string>) => void;
}

/**
 * Whether a question takes the window. One with a heading of its own is a task (a sign-in): it is
 * about no one row, so it takes the body and its heading the title. One without is about the row
 * running, and is asked under it with the list in view (owner, 2026-10-21, kept 2026-11-04).
 */
export function questionTakesWindow(prompt: OperationPrompt): boolean {
    return Boolean(prompt.title);
}

/**
 * The question in two groups, 24 apart: its sentence with the numbered steps under it, then the
 * fields. It names no task: a pause asks for what it needs and the run picks up where it stopped,
 * whatever was running (owner, 2026-11-04).
 */
export function OperationQuestion({ prompt, onTyped }: OperationQuestionProps): React.ReactElement {
    return (
        <div className="operation-question" role="group" aria-label="Question">
            <div className="operation-question-text">
                <p className="dialog-line">{prompt.message}</p>
                {prompt.steps?.length ? (
                    <ol className="dialog-steps">
                        {prompt.steps.map((step) => (
                            <li key={step}>{step}</li>
                        ))}
                    </ol>
                ) : null}
            </div>
            {prompt.fields?.length ? <OperationPromptForm fields={prompt.fields} onChange={onTyped} /> : null}
        </div>
    );
}
