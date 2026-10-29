/**
 * The setup guide's step records as a check or a the demo setup's Apply run leaves them: what a
 * check concluded, the state it gives the step, and the records after a run. Moved out of the
 * checklist's and the preparation's handlers (2026-10-22) so the ERP integration's add, which
 * prepares the store inside the runner, saves the record exactly as the manual Prepare does
 * without importing a handler module.
 *
 * @module features/dashboard/services/setupStepRecords
 */

import type { SetupCheckResult } from '@/features/app-builder/services/setupChecks';
import type { FreshChecks } from '@/features/app-builder/services/storePreparation/storePreparationEngine';
import type { SetupCheck, SetupStep } from '@/types/appBuilderComponents';
import type { SetupCheckOutcome, SetupStepRecord } from '@/types/base';
import type { PreparationStepReport } from '@/types/storePreparation';

type RunCheck = (check: SetupCheck) => Promise<SetupCheckResult>;

/** What a check concluded: set up, not set up, or it could not tell. */
export function outcomeOf(done: boolean | undefined): SetupCheckOutcome {
    if (done === undefined) return 'unknown';
    return done ? 'passed' : 'failed';
}

/** A passing check marks the step done, a failing one opens it, one that could not tell leaves it. */
export function stateAfterCheck(previous: SetupStepRecord['state'], done: boolean | undefined): SetupStepRecord['state'] {
    if (done === undefined) return previous;
    return done ? 'done' : undefined;
}

/**
 * The step records after the given steps are checked: a passing check marks its step done,
 * a failing one opens it, one that cannot tell leaves the state.
 */
export async function checkedRecords(
    steps: readonly SetupStep[],
    saved: Record<string, SetupStepRecord> | undefined,
    runCheck: RunCheck,
): Promise<Record<string, SetupStepRecord>> {
    const records: Record<string, SetupStepRecord> = { ...saved };
    const checkedAt = new Date().toISOString();
    for (const step of steps) {
        if (!step.check) continue;
        const result = await runCheck(step.check);
        const { state: previous, ...kept } = records[step.id] ?? {};
        const state = stateAfterCheck(previous, result.done);
        records[step.id] = {
            ...kept,
            ...(state ? { state } : {}),
            note: result.note,
            lastCheck: outcomeOf(result.done),
            checkedAt,
        };
    }
    return records;
}

/**
 * The checklist records after a preparation run, so the guide and the card agree with what
 * the run said: every step's FRESH check as the engine found it (no second read), then a new
 * check of the steps the run wrote to or undid, whose answer the write has changed.
 *
 * @param steps - the integration's setup steps
 * @param saved - the records saved before the run
 * @param checks - what each step's check found during the run
 * @param reports - what the run did, step by step
 * @param runCheck - a check against the store as it stands now
 */
export async function recordsAfterRun(
    steps: readonly SetupStep[],
    saved: Record<string, SetupStepRecord> | undefined,
    checks: FreshChecks,
    reports: readonly PreparationStepReport[],
    runCheck: RunCheck,
): Promise<Record<string, SetupStepRecord>> {
    const found = steps.filter((step) => checks[step.id]);
    const byCheck = new Map(found.map((step) => [step.check, checks[step.id]]));
    const fresh = await checkedRecords(found, saved, async (check) => byCheck.get(check) ?? { note: '' });
    const touched = new Set(reports.filter((report) => ['applied', 'undone', 'rejected'].includes(report.state)).map((report) => report.id));
    return checkedRecords(steps.filter((step) => touched.has(step.id)), fresh, runCheck);
}
