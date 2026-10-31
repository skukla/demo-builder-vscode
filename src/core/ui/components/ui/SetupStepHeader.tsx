/**
 * One manual setup step's header: its title (with an Optional badge when only some demos need
 * it), then the house banner (`InlineNotice`) for where the step stands, a word or two with at
 * most one short sentence under it.
 *
 * | Where it stands                         | Banner title   | Its one sentence                 |
 * |-----------------------------------------|----------------|----------------------------------|
 * | Done                                    | Done (green)   | how: applied, already, or marked |
 * | Not set up, Demo Builder can apply it   | Not set up     | what Apply will do (`plan`)      |
 * | Not set up, the SC's to do              | Not set up     | what the check found missing     |
 * | The check could not tell                | Couldn't check | why                              |
 * | Skipped                                 | Skipped        | nothing                          |
 *
 * Every banner is two lines tall, a blank second line where a state has nothing to say, so
 * nothing under it jumps when the state changes (release test row 4.19).
 *
 * Extracted 2026-10-30 (DI-5) from the dashboard setup guide's `StepHeader`, unchanged in what
 * it draws, when the Data Installer's pack step needed the same step in its own dialog. The
 * guide keeps what only it has (a run going, Apply's plan read from the store) and hands this
 * the status it works out (`StepHeader.statusOf`). Styles: `fact-list.css`, which each host
 * bundle imports (dashboard, integrations, dataInstaller).
 *
 * @module core/ui/components/ui/SetupStepHeader
 */

import { Badge, Heading } from '@adobe/react-spectrum';
import React from 'react';
import { Spinner } from './Spinner';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';
import { cn } from '@/core/ui/utils/classNames';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';

/** The banner's titles, in one place. */
export const STATUS_COPY = {
    done: 'Done',
    notSetUp: 'Not set up',
    skipped: 'Skipped',
    applying: 'Applying',
    undoing: 'Undoing',
    applyFailed: "Couldn't apply",
    undoFailed: "Couldn't undo",
    unknown: "Couldn't check",
};

/**
 * Done's one line: how the step got done. Applied means Demo Builder made the change and
 * recorded it, so Undo this step can put it back. Already set up means the check found it in
 * the store (done by hand, by a datapack, or before), so there is nothing of Demo Builder's to undo.
 */
export const DONE_COPY = {
    applied: 'Applied by Demo Builder.',
    found: 'Already set up in the store.',
    marked: 'Marked as done.',
};

/** Where a step stands, as its banner says it: a title, a tone, and a sentence or the plan's read. */
export interface StepStatusView {
    label: string;
    /** Amber when the step needs the SC, green when it is done, blue otherwise: the house banner's tones. */
    tone: 'warning' | 'info' | 'success';
    /** One short line under the title. */
    line?: string;
    /** The line is what Apply will do, read from the store as the step is shown. */
    plan?: boolean;
}

/** The check's finding without its own "Could not check:" lead, which the banner's title says. */
const findingOf = (item: SetupChecklistItem): string | undefined => item.note?.replace(/^Could not check: /u, '');

/** How a done step got done: Demo Builder applied it, its check found it, or the SC said so. */
function doneLine(item: SetupChecklistItem): string {
    if (item.fixApplied) return DONE_COPY.applied;
    return item.lastCheck === 'passed' ? DONE_COPY.found : DONE_COPY.marked;
}

/** A step not set up: what Apply will do when Demo Builder can apply it, else what the check found missing. */
export function notSetUpStatus(item: SetupChecklistItem): StepStatusView {
    if (item.fix && item.applicable) return { label: STATUS_COPY.notSetUp, tone: 'warning', plan: true };
    return { label: STATUS_COPY.notSetUp, tone: 'warning', ...(item.lastCheck === 'failed' ? { line: findingOf(item) } : {}) };
}

/** Where a step stands from what was saved: skipped, done, its check could not tell, or not set up. */
export function savedStepStatus(item: SetupChecklistItem): StepStatusView {
    if (item.state === 'dismissed') return { label: STATUS_COPY.skipped, tone: 'info' };
    if (item.state === 'done') return { label: STATUS_COPY.done, tone: 'success', line: doneLine(item) };
    if (item.lastCheck === 'unknown') return { label: STATUS_COPY.unknown, tone: 'warning', line: findingOf(item) };
    return notSetUpStatus(item);
}

/** The second line a state with nothing to say keeps, so every banner is the same height. */
const BLANK_LINE = <span aria-hidden="true">{' '}</span>;

export interface SetupStepHeaderProps {
    item: SetupChecklistItem;
    /** Where it stands; `savedStepStatus(item)` when nothing else decides it. */
    status: StepStatusView;
    /** Drawn in place of the line, when the status is a plan (the guide's read of what Apply will do). */
    plan?: React.ReactNode;
    /**
     * A check is running on the step: the banner keeps its size, its words hidden behind a small
     * spinner, so the place the answer will land is what visibly refreshes (owner, 2026-10-31).
     */
    busy?: boolean;
}

/**
 * The step's title, then where it stands in the house banner: a word or two as its title, and
 * one short sentence at most (owner, 2026-10-26: "draw attention using existing banner methods
 * but keep text simple and concise").
 */
export function SetupStepHeader({ item, status, plan, busy = false }: SetupStepHeaderProps): React.ReactElement {
    return (
        <div className="setup-guide-step-head">
            <div className="setup-guide-step-title">
                <Heading level={3}>{item.title}</Heading>
                {/* Only some demos need this step, so it is not counted as left to do (`isLeftToDo`). */}
                {item.optional && <Badge variant="neutral">Optional</Badge>}
            </div>
            <div className={cn('setup-guide-step-status', busy && 'is-busy')} aria-busy={busy || undefined}>
                <InlineNotice tone={busy ? 'info' : status.tone} title={status.label} testId="setup-guide-step-status">
                    {plan ?? status.line ?? BLANK_LINE}
                </InlineNotice>
                {busy ? (
                    <span className="setup-guide-step-status-spinner">
                        <Spinner size="S" aria-label="Checking" />
                    </span>
                ) : null}
            </div>
        </div>
    );
}
