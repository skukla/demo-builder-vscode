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
 * The title, the banner and the saved step's status moved to `core/ui/components/ui/SetupStepHeader`
 * on 2026-10-30 (DI-5), so the Data Installer's pack step draws the same header. What stays here
 * is the guide's own: a run going or just ended, and Apply's plan read from the store.
 *
 * @module features/dashboard/ui/components/integrations/StepHeader
 */

import React from 'react';
import { StepPlan } from './StepPlan';
import type { GuideRun } from './useGuideRun';
import {
    DONE_COPY,
    STATUS_COPY,
    SetupStepHeader,
    type StepStatusView,
    notSetUpStatus,
    savedStepStatus,
} from '@/core/ui/components/ui/SetupStepHeader';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';

/**
 * A run's problem as this step's banner says it: without the step's own name in front, which
 * the run adds to tell steps apart and the title above already says (row 4.14, 2026-10-28).
 */
function problemOf(item: SetupChecklistItem, problem: string): string {
    const lead = `${item.label ?? item.title}: `;
    return problem.startsWith(lead) ? problem.slice(lead.length) : problem;
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
 * the banner flips the moment the run says so rather than a beat later: an Apply that ended
 * here is Done, an Undo that ended here is Not set up (unless the step is skipped), whatever
 * the saved step still says. Otherwise the saved step decides (`savedStepStatus`).
 */
export function statusOf(item: SetupChecklistItem, run?: GuideRun): StepStatusView {
    const going = runStatus(item, run);
    if (going) return going;
    const endedHere = run?.stepIds.includes(item.id) && run.results[item.id] ? run.mode : undefined;
    if (endedHere === 'apply') return { label: STATUS_COPY.done, tone: 'success', line: run?.problem ? problemOf(item, run.problem) : DONE_COPY.applied };
    if (endedHere === 'undo') return item.state === 'dismissed' ? { label: STATUS_COPY.skipped, tone: 'info' } : notSetUpStatus(item);
    return savedStepStatus(item);
}

interface StepHeaderProps {
    item: SetupChecklistItem;
    /** The integration, for the plan's read of the store. */
    integrationId: string;
    /** The guide's run, on the shown step only; it also lets the plan read the store. */
    run?: GuideRun;
    /** Check all steps is checking this step now. */
    checking?: boolean;
}

/** The shared step header (`SetupStepHeader`), with the run's status and Apply's plan. */
export function StepHeader({ item, integrationId, run, checking = false }: StepHeaderProps): React.ReactElement {
    const status = statusOf(item, run);
    // Only the shown step reads the store for its plan: the others are drawn, invisible, for height.
    const plan = status.plan && run ? <StepPlan id={integrationId} stepId={item.id} /> : undefined;
    return <SetupStepHeader item={item} status={status} plan={plan} busy={checking} />;
}
