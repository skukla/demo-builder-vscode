/**
 * An apply's result as the Updates modal lists it (PL-80): how many applied, what did not
 * and why, and what applied with something to know.
 *
 * Every sentence is one the apply cores already wrote for the agent (`CategoryResult`);
 * this only sorts them into the two lists a person reads.
 *
 * @module features/updates/services/updatesApplyReport
 */

import type { ApplyUpdatesResult, CategoryResult } from './updateApplyResult';
import type { ApplyUpdatesReport } from '@/types/pendingUpdates';

/**
 * Sort one apply's outcome into the modal's report.
 *
 * @param result - what `applyUpdatesHeadless` answered
 * @param skipped - updates left out before the apply ran, one sentence each (a running
 *   demo the SC chose not to stop, an extension update that failed)
 * @returns the report
 */
export function reportOf(result: ApplyUpdatesResult, skipped: string[] = []): ApplyUpdatesReport {
    const categories: CategoryResult[] = [
        result.forkSync,
        result.template,
        result.boilerplate,
        result.finish,
        result.component,
        result.adobeMcp,
        result.addon,
        result.blockLibraryInstall,
        result.integration,
    ];
    const problems = [
        ...skipped,
        ...categories.flatMap((c) => c.errors),
        // A library kept under the `ask` setting, by the SC's answer: nothing changed.
        ...(result.addon.deferred ?? []).map((name) => `${name}: not updated; your blocks were kept.`),
        // A pair in another Adobe org: the line already says to open that project.
        ...(result.integration.deferred ?? []),
    ];
    const notes = categories.flatMap((c) => [...(c.applied ?? []), ...(c.installed ?? []), ...(c.leftOut ?? [])]);
    return { applied: result.totalApplied, problems, notes };
}
