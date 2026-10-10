/**
 * "Prepare this store" (AB-77): one engine over a catalog entry's setup steps. It lists each
 * step's state, PREVIEWS what the applicable ones would change (reads only), APPLIES them in
 * the guide's order and records what each changed on the component, and UNDOES them from
 * that record, step by step, newest first.
 *
 * Two rules the engine keeps whatever the fix:
 * - A step whose check says done is SKIPPED before anything is written (a datapack may have
 *   done it), so the extension never relies on a datapack and never redoes its work.
 * - A refused item stops nothing else: what Commerce took stands and is recorded, what it
 *   refused is named by step and item.
 *
 * Pure over the deps it is handed; the handler owns the sign-in, the progress and the save.
 *
 * @module features/app-builder/services/storePreparation/storePreparationEngine
 */

import { isStepDone } from '../setupChecklist';
import type { SetupCheckResult } from '../setupChecks';
import { errorText, type FixDeps } from './fixContract';
import { fixFor } from './fixRegistry';
import type { SetupCheck, SetupStep } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState } from '@/types/base';
import type { PreparationStepReport, PreparationStepState, StorePreparationRecord } from '@/types/storePreparation';

export interface PreparationDeps extends FixDeps {
    /** Run a step's check, so a step a datapack already did is skipped, not redone. */
    runCheck: (check: SetupCheck) => Promise<SetupCheckResult>;
    /** Where the apply or undo is, for the progress modal. */
    onProgress?: (step: SetupStep, what: string) => void;
}

type Saved = Pick<AppBuilderComponentState, 'setupSteps' | 'storePreparation'>;

/** The saved check's words when it could not tell; nothing otherwise. */
function couldNotCheck(step: SetupStep, saved: Saved): string | undefined {
    const record = saved.setupSteps?.[step.id];
    return record?.lastCheck === 'unknown' ? record.note : undefined;
}

/**
 * Where a step stands before any apply. A step whose check could not tell is NEVER done:
 * with a fix it stays applicable (the fix reads for itself), without one it is unknown.
 */
export function stepState(step: SetupStep, saved: Saved): PreparationStepState {
    if (saved.storePreparation?.steps[step.id]) return 'applied';
    const record = saved.setupSteps?.[step.id];
    if (isStepDone(record)) return 'done';
    if (step.fix) return 'applicable';
    return record?.lastCheck === 'unknown' ? 'unknown' : 'manual';
}

const report = (
    step: SetupStep,
    state: PreparationStepState,
    changes: string[] = [],
    rejected: string[] = [],
    manual?: string,
    note?: string,
): PreparationStepReport => ({
    id: step.id,
    label: step.label ?? step.title,
    title: step.title,
    state,
    changes,
    rejected,
    ...(manual ? { manual } : {}),
    ...(note ? { note } : {}),
});

/** The steps an apply covers: the ones asked for, else every one. */
function chosen(steps: SetupStep[], stepIds?: readonly string[]): SetupStep[] {
    return stepIds ? steps.filter((step) => stepIds.includes(step.id)) : steps;
}

/**
 * Every step with its state; the applicable ones with what they would change. Reads only.
 */
export async function previewPreparation(steps: SetupStep[], saved: Saved, deps: PreparationDeps, stepIds?: readonly string[]): Promise<PreparationStepReport[]> {
    const reports: PreparationStepReport[] = [];
    for (const step of chosen(steps, stepIds)) {
        const state = stepState(step, saved);
        const note = couldNotCheck(step, saved);
        if (state !== 'applicable' || !step.fix) {
            reports.push(report(step, state, [], [], undefined, note));
            continue;
        }
        try {
            const preview = await fixFor(step.fix).preview(deps);
            reports.push(report(step, state, preview.changes, [], preview.manual, note));
        } catch (error) {
            // The check could not tell and the fix cannot read either: "could not check".
            reports.push(report(step, 'unknown', [], [`Could not read what would change: ${errorText(error)}`], undefined, note));
        }
    }
    return reports;
}

export interface PreparationOutcome {
    reports: PreparationStepReport[];
    /** The record after the run; undefined when nothing is recorded any more. */
    record: StorePreparationRecord | undefined;
}

/**
 * Apply the applicable steps in order. Each is checked first and skipped when done; what a
 * fix wrote is recorded under its step id before the next step runs, so a step that throws
 * loses nothing already recorded.
 */
export async function applyPreparation(steps: SetupStep[], saved: Saved, deps: PreparationDeps, stepIds?: readonly string[]): Promise<PreparationOutcome> {
    const reports: PreparationStepReport[] = [];
    let record = saved.storePreparation;
    for (const step of chosen(steps, stepIds)) {
        const state = stepState(step, saved);
        if (state !== 'applicable' || !step.fix) {
            reports.push(report(step, state));
            continue;
        }
        if (step.check) {
            deps.onProgress?.(step, 'Checking whether it is already done');
            const checked = await deps.runCheck(step.check);
            if (checked.done === true) {
                reports.push(report(step, 'skipped', [checked.note]));
                continue;
            }
        }
        deps.onProgress?.(step, 'Applying');
        try {
            const applied = await fixFor(step.fix).apply(deps);
            if (applied.record) record = { at: new Date().toISOString(), steps: { ...record?.steps, [step.id]: applied.record } };
            reports.push(report(step, applied.rejected.length > 0 ? 'rejected' : 'applied', applied.changes, applied.rejected, applied.manual));
        } catch (error) {
            reports.push(report(step, 'rejected', [], [errorText(error)]));
        }
    }
    return { reports, record };
}

/**
 * Undo the recorded steps, newest first (the guide's order reversed), or one of them. A
 * step's entry leaves the record once its undo ran with nothing refused; the record itself
 * goes with the last entry.
 */
export async function undoPreparation(steps: SetupStep[], record: StorePreparationRecord, deps: PreparationDeps, stepId?: string): Promise<PreparationOutcome> {
    const reports: PreparationStepReport[] = [];
    let left = { ...record.steps };
    const order = [...steps].reverse().filter((step) => left[step.id] && (stepId === undefined || step.id === stepId));
    for (const step of order) {
        const entry = left[step.id];
        if (!step.fix) {
            reports.push(report(step, 'rejected', [], ['The catalog no longer declares a fix for this step, so its record cannot be undone.']));
            continue;
        }
        deps.onProgress?.(step, 'Putting it back');
        try {
            const undone = await fixFor(step.fix).undo(deps, entry);
            if (undone.rejected.length === 0) {
                const { [step.id]: _done, ...rest } = left;
                left = rest;
            }
            reports.push(report(step, undone.rejected.length > 0 ? 'rejected' : 'undone', undone.changes, undone.rejected));
        } catch (error) {
            reports.push(report(step, 'rejected', [], [errorText(error)]));
        }
    }
    return { reports, record: Object.keys(left).length > 0 ? { at: record.at, steps: left } : undefined };
}
