/**
 * the demo setup's Apply (AB-77): one engine over a catalog entry's setup steps. It says where
 * each step stands, PREVIEWS what the applicable ones would change (reads only), APPLIES
 * them in the guide's order and records what each changed on the component, and UNDOES them
 * from that record, step by step, newest first.
 *
 * The preview and the apply are statements about the store NOW. Every selected step that has
 * a check is checked FRESH, and the fresh answer decides; the saved checklist is never
 * consulted (Justrite 2026-10-10: two settings switched off after their checks had passed
 * previewed as Done and were skipped). The no-network answer the card's "n of m done" line
 * and the guide's opening view need is `setupChecklist.ts`'s, not this file's.
 *
 * - done → Done; on apply nothing is written (a datapack or the SC did it).
 * - not done, with a fix → Will apply.
 * - could not tell → with a fix, the fix reads for itself; without one, "could not check".
 * - no check → never Done here: Will apply with a fix, by hand without.
 * - A refused item stops nothing else: what Commerce took stands and is recorded, what it
 *   refused is named by step and item.
 *
 * Pure over the deps it is handed; the handler owns the sign-in, the progress and the save.
 *
 * @module features/app-builder/services/storePreparation/storePreparationEngine
 */

import type { SetupCheckResult } from '../setupChecks';
import { errorText, type FixDeps } from './fixContract';
import { fixFor } from './fixRegistry';
import { mergedStepRecord } from './recordMerge';
import type { SetupCheck, SetupStep } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState } from '@/types/base';
import type { PreparationStepReport, PreparationStepState, StorePreparationRecord } from '@/types/storePreparation';

export interface PreparationDeps extends FixDeps {
    /** Run a step's check against the store as it stands; called once per selected step that has one. */
    runCheck: (check: SetupCheck) => Promise<SetupCheckResult>;
    /** Where the apply or undo is, for the progress modal. */
    onProgress?: (step: SetupStep, what: string) => void;
}

/**
 * The component as the engine is handed it. It reads `storePreparation` (what Demo Builder
 * recorded) and NOTHING of `setupSteps`: the saved checks are in the type only because the
 * caller holds them, and the tests pass them to prove they are ignored.
 */
type Saved = Pick<AppBuilderComponentState, 'setupSteps' | 'storePreparation'>;

/** What each step's fresh check found, by step id, for the handler to save on the checklist. */
export type FreshChecks = Record<string, SetupCheckResult>;

/** The step's check, run now; a check that throws could not tell. Undefined for a step with none. */
async function freshCheck(step: SetupStep, deps: PreparationDeps): Promise<SetupCheckResult | undefined> {
    if (!step.check) return undefined;
    try {
        return await deps.runCheck(step.check);
    } catch (error) {
        return { note: `Could not check: ${errorText(error)}` };
    }
}

/** Where a step stands NOW, from its fresh check (see the module's rules). */
function standing(step: SetupStep, checked: SetupCheckResult | undefined, saved: Saved): PreparationStepState {
    if (checked?.done === true) return saved.storePreparation?.steps[step.id] ? 'applied' : 'done';
    if (step.fix) return 'applicable';
    return checked && checked.done === undefined ? 'unknown' : 'manual';
}

interface ReportParts {
    changes?: string[];
    rejected?: string[];
    manual?: string;
    note?: string;
    summary?: string;
    kept?: string;
}

const report = (step: SetupStep, state: PreparationStepState, parts: ReportParts = {}): PreparationStepReport => ({
    id: step.id,
    label: step.label ?? step.title,
    title: step.title,
    state,
    changes: parts.changes ?? [],
    ...(parts.summary ? { summary: parts.summary } : {}),
    rejected: parts.rejected ?? [],
    ...(parts.manual ? { manual: parts.manual } : {}),
    ...(parts.note ? { note: parts.note } : {}),
    ...(parts.kept ? { kept: parts.kept } : {}),
});

/** The steps a run covers: the ones asked for, else every one. */
function chosen(steps: SetupStep[], stepIds?: readonly string[]): SetupStep[] {
    return stepIds ? steps.filter((step) => stepIds.includes(step.id)) : steps;
}

export interface PreparationPreview {
    reports: PreparationStepReport[];
    checks: FreshChecks;
}

/**
 * Every selected step with where it stands now; the applicable ones with what they would
 * change. Reads the store (each step's check, concurrently, then each fix's own read) and
 * writes nothing.
 */
export async function previewPreparation(steps: SetupStep[], saved: Saved, deps: PreparationDeps, stepIds?: readonly string[]): Promise<PreparationPreview> {
    const selected = chosen(steps, stepIds);
    const results = await Promise.all(selected.map((step) => freshCheck(step, deps)));
    const reports: PreparationStepReport[] = [];
    const checks: FreshChecks = {};
    for (const [i, step] of selected.entries()) {
        const checked = results[i];
        if (checked) checks[step.id] = checked;
        const state = standing(step, checked, saved);
        const note = checked?.note;
        if (state !== 'applicable' || !step.fix) {
            reports.push(report(step, state, { note }));
            continue;
        }
        try {
            const preview = await fixFor(step.fix).preview(deps);
            reports.push(report(step, state, { changes: preview.changes, summary: preview.summary, manual: preview.manual, note }));
        } catch (error) {
            // The fix cannot read either: "could not check", with why.
            reports.push(report(step, 'unknown', { rejected: [`Could not read what would change: ${errorText(error)}`], note }));
        }
    }
    return { reports, checks };
}

export interface PreparationOutcome {
    reports: PreparationStepReport[];
    /** The record after the run; undefined when nothing is recorded any more. */
    record: StorePreparationRecord | undefined;
    /** What each step's check found just before the engine decided; empty for an undo. */
    checks: FreshChecks;
}

/**
 * Apply the selected steps in order. Each is checked just before it is decided; a step the
 * store shows done is not written. What a fix wrote is recorded under its step id before the
 * next step runs (added to an earlier record of the same step), so a step that throws loses
 * nothing already recorded.
 */
export async function applyPreparation(steps: SetupStep[], saved: Saved, deps: PreparationDeps, stepIds?: readonly string[]): Promise<PreparationOutcome> {
    const reports: PreparationStepReport[] = [];
    const checks: FreshChecks = {};
    let record = saved.storePreparation;
    for (const step of chosen(steps, stepIds)) {
        if (step.check) deps.onProgress?.(step, 'Checking whether it is already done');
        const checked = await freshCheck(step, deps);
        if (checked) checks[step.id] = checked;
        const state = standing(step, checked, saved);
        if (state !== 'applicable' || !step.fix) {
            // Done with a fix it did not need: said as "already done", so the result lists it as skipped.
            reports.push(report(step, state === 'done' && step.fix ? 'skipped' : state, { note: checked?.note }));
            continue;
        }
        deps.onProgress?.(step, 'Applying');
        try {
            const applied = await fixFor(step.fix).apply(deps);
            if (applied.record) {
                const entry = mergedStepRecord(record?.steps[step.id], applied.record);
                record = { at: new Date().toISOString(), steps: { ...record?.steps, [step.id]: entry } };
            }
            const outcome = applied.rejected.length > 0 ? 'rejected' : 'applied';
            reports.push(report(step, outcome, { changes: applied.changes, rejected: applied.rejected, manual: applied.manual }));
        } catch (error) {
            reports.push(report(step, 'rejected', { rejected: [errorText(error)] }));
        }
    }
    return { reports, record, checks };
}

/**
 * Undo the recorded steps, newest first (the guide's order reversed), or one of them. A
 * step's entry leaves the record once its undo ran with nothing refused; the record itself
 * goes with the last entry. What a fix kept because it changed since (step 06) is not a
 * refusal: the report carries the fix's one line as `kept`, and the entry goes, except for a
 * kept catalog or stock (`remaining`), which stays so a later undo can take it once empty.
 */
export async function undoPreparation(steps: SetupStep[], record: StorePreparationRecord, deps: PreparationDeps, stepId?: string): Promise<PreparationOutcome> {
    const reports: PreparationStepReport[] = [];
    let left = { ...record.steps };
    const order = [...steps].reverse().filter((step) => left[step.id] && (stepId === undefined || step.id === stepId));
    for (const step of order) {
        const entry = left[step.id];
        if (!step.fix) {
            reports.push(report(step, 'rejected', { rejected: ['The catalog no longer declares a fix for this step, so its record cannot be undone.'] }));
            continue;
        }
        deps.onProgress?.(step, 'Putting it back');
        try {
            const undone = await fixFor(step.fix).undo(deps, entry);
            if (undone.rejected.length === 0) {
                const { [step.id]: _done, ...rest } = left;
                // A kept catalog or stock stays recorded, so a later undo takes it once it is empty.
                left = undone.remaining ? { ...rest, [step.id]: undone.remaining } : rest;
            }
            reports.push(report(step, undone.rejected.length > 0 ? 'rejected' : 'undone', { changes: undone.changes, rejected: undone.rejected, kept: undone.kept }));
        } catch (error) {
            reports.push(report(step, 'rejected', { rejected: [errorText(error)] }));
        }
    }
    return { reports, record: Object.keys(left).length > 0 ? { at: record.at, steps: left } : undefined, checks: {} };
}
