/**
 * A setup step's header in the guide: its title, then a house banner for where it stands with
 * a word or two and at most one short sentence (AB-82, owner 2026-10-26). It replaced a status box with a heading and
 * the check's sentence, then a run's report in the same box: "too busy", "vague and random",
 * "reads horridly". The SC needs where the step stands now, not the story of the last run.
 *
 * | Where it stands                         | Banner title   | Its one sentence                 |
 * |-----------------------------------------|----------------|----------------------------------|
 * | Done                                    | Done (green)   | how: applied, already, or marked |
 * | Not set up, Demo Builder can apply it   | Not set up     | "Apply will …", read from the store |
 * | Not set up, the SC's to do              | Not set up     | what the check found missing     |
 * | Applying or undoing now                 | Applying / Undoing | nothing (the list's mark spins) |
 * | The run failed                          | Couldn't apply / undo | why                       |
 * | The check could not tell                | Couldn't check | why                              |
 * | Skipped                                 | Skipped        | nothing                          |
 *
 * When a run ends the banner flips (Applying to Done; Undoing to Not set up with its "Apply
 * will" sentence); nothing reports the run. Amber when the step needs the SC, green when it
 * is done, blue otherwise.
 *
 * Done says HOW it got done (release test row 4.14, 2026-10-28): two finished steps showed the
 * same bare banner, and moving from one to the other read as the banner never clearing. And
 * every banner is two lines tall, a blank second line where a state has nothing to say, so
 * Applying, Done and Not set up hold the same height and nothing under them jumps (row 4.19).
 *
 * @module features/dashboard/ui/components/integrations/StepHeader
 */

import { Badge, Heading } from '@adobe/react-spectrum';
import React from 'react';
import { StepPlan } from './StepPlan';
import type { GuideRun } from './useGuideRun';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';
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

/**
 * A run's problem as this step's banner says it: without the step's own name in front, which
 * the run adds to tell steps apart and the title above already says (row 4.14, 2026-10-28).
 */
function problemOf(item: SetupChecklistItem, problem: string): string {
    const lead = `${item.label ?? item.title}: `;
    return problem.startsWith(lead) ? problem.slice(lead.length) : problem;
}

/** How a done step got done: Demo Builder applied it, its check found it, or the SC said so. */
function doneLine(item: SetupChecklistItem): string {
    if (item.fixApplied) return DONE_COPY.applied;
    return item.lastCheck === 'passed' ? DONE_COPY.found : DONE_COPY.marked;
}

/** A run going, or one that failed, on this step: what the banner says instead of the step's state. */
function runStatus(item: SetupChecklistItem, run: GuideRun | undefined): StepStatusView | undefined {
    if (!run?.stepIds.includes(item.id)) return undefined;
    const undo = run.mode === 'undo';
    if (run.running) return { label: undo ? STATUS_COPY.undoing : STATUS_COPY.applying, tone: 'info' };
    if (run.problem && !run.results[item.id]) {
        return { label: undo ? STATUS_COPY.undoFailed : STATUS_COPY.applyFailed, tone: 'warning', line: problemOf(item, run.problem) };
    }
    return undefined;
}

/**
 * Where the step stands. A run that just ended decides it before the saved steps catch up, so
 * the banner flips the moment the run says so rather than a beat later.
 */
export function statusOf(item: SetupChecklistItem, run?: GuideRun): StepStatusView {
    const going = runStatus(item, run);
    if (going) return going;
    const endedHere = run?.stepIds.includes(item.id) && run.results[item.id] ? run.mode : undefined;
    if (endedHere === 'apply') return { label: STATUS_COPY.done, tone: 'success', line: run?.problem ? problemOf(item, run.problem) : DONE_COPY.applied };
    if (item.state === 'dismissed') return { label: STATUS_COPY.skipped, tone: 'info' };
    if (item.state === 'done' && endedHere !== 'undo') return { label: STATUS_COPY.done, tone: 'success', line: doneLine(item) };
    if (item.lastCheck === 'unknown' && endedHere !== 'undo') return { label: STATUS_COPY.unknown, tone: 'warning', line: findingOf(item) };
    if (item.fix && item.applicable) return { label: STATUS_COPY.notSetUp, tone: 'warning', plan: true };
    return { label: STATUS_COPY.notSetUp, tone: 'warning', ...(item.lastCheck === 'failed' ? { line: findingOf(item) } : {}) };
}

/** The second line a state with nothing to say keeps, so every banner is the same height. */
const BLANK_LINE = <span aria-hidden="true">{'\u00a0'}</span>;

interface StepHeaderProps {
    item: SetupChecklistItem;
    /** The integration, for the plan's read of the store. */
    integrationId: string;
    /** The guide's run, on the shown step only; it also lets the plan read the store. */
    run?: GuideRun;
}

/**
 * The step's title, then where it stands in the house banner (`InlineNotice`): a word or two
 * as its title, and one short sentence at most (owner, 2026-10-26: "draw attention using
 * existing banner methods but keep text simple and concise").
 */
export function StepHeader({ item, integrationId, run }: StepHeaderProps): React.ReactElement {
    const status = statusOf(item, run);
    // Only the shown step reads the store for its plan: the others are drawn, invisible, for height.
    const plan = status.plan && run ? <StepPlan id={integrationId} stepId={item.id} /> : undefined;
    return (
        <div className="setup-guide-step-head">
            <div className="setup-guide-step-title">
                <Heading level={3}>{item.title}</Heading>
                {/* Only some demos need this step, so it is not counted as left to do (`isLeftToDo`). */}
                {item.optional && <Badge variant="neutral">Optional</Badge>}
            </div>
            <InlineNotice tone={status.tone} title={status.label} testId="setup-guide-step-status">
                {plan ?? status.line ?? BLANK_LINE}
            </InlineNotice>
        </div>
    );
}
