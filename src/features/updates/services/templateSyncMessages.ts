/**
 * What a template sync says, and the files it never overwrites. Split from
 * `templateSyncService.ts` by job (2026-10-16, EDS-51).
 *
 * @module features/updates/services/templateSyncMessages
 */

import { PLACEHOLDER_STUB_PATHS } from '@/features/eds/services/placeholderStubs';
import { TemplateSyncStepError } from '@/features/updates/services/templateSyncStepError';
import type { TemplateSyncResult, TemplateSyncTarget } from '@/features/updates/services/templateSyncTypes';

/**
 * The error text a conflicted merge carries, so every surface says the same thing. It
 * says "the update", not "the template update": the Adobe boilerplate's merge carries it
 * too (it read "template" under an Adobe boilerplate row until 2026-10-21).
 */
export function describeTemplateConflicts(conflicts: string[]): string {
    const noun = conflicts.length === 1 ? 'file' : 'files';
    return `Merge conflicts in ${conflicts.length} ${noun} (${conflicts.join(', ')}); `
        + 'the update was not applied.';
}

export const NO_RECORDED_VERSION = 'This storefront has no recorded template version to update from; '
    + 'reset it to its template once so updates have a starting point.';

/** A full or abbreviated commit SHA — the only shape a recorded version may take. */
export const COMMIT_SHA = /^[0-9a-f]{7,40}$/i;

export function notInTemplateHistory(base: string, target: TemplateSyncTarget): string {
    return `The storefront's recorded template version (${base.substring(0, 7)}) is not in `
        + `${target.templateOwner}/${target.templateRepo}'s history; reset it to its template `
        + 'once so updates have a new starting point.';
}

export function failure(strategy: 'merge' | 'reset', error: string): TemplateSyncResult {
    return { success: false, strategy, syncedCommit: '', error };
}

/**
 * What the SC reads when a step throws. A failed step says which step; anything
 * else gets an honest generic. git's output is logged, never returned.
 */
export function describeStepFailure(error: unknown): string {
    const sentence = error instanceof TemplateSyncStepError
        ? error.message
        : 'The template update could not finish.';
    return `${sentence} See Debug Logs for details.`;
}

/**
 * The label-sheet files. Label text lives in DA.live, and a file in the repository
 * hides the sheet at its path, so reset and creation remove the template's own and a
 * template update leaves the folder as the storefront has it (EDS-53: the B2B
 * template's placeholders/checkout.json hid CitiSignal's checkout sheet). One exception:
 * where the storefront's file is our own stub over labels the template ships, the update
 * puts the template's labels back (`labelStubRepair.ts`).
 */
export const LABEL_SHEET_FILES: readonly string[] = PLACEHOLDER_STUB_PATHS.map((sheet) => `${sheet}.json`);

/**
 * Files that should never be overwritten during template sync
 * These contain project-specific configuration
 */
export const DEFAULT_PRESERVE_FILES = [
    'fstab.yaml',       // Helix content source configuration
    'config.json',      // Commerce endpoint configuration
    ...LABEL_SHEET_FILES,
];

/** The commit message of a template update (the template's, or a colleague's, changes). */
export const TEMPLATE_COMMIT = 'chore: sync with template';

/** The commit message of the Adobe boilerplate update on a colleague's storefront (EDS-56). */
export const BOILERPLATE_COMMIT = 'chore: update the Adobe boilerplate to the tested version';
