/**
 * What a template sync says, and the files it never overwrites. Split from
 * `templateSyncService.ts` by job (2026-10-16, EDS-51).
 *
 * @module features/updates/services/templateSyncMessages
 */

import { TemplateSyncStepError } from '@/features/updates/services/templateSyncStepError';
import type { TemplateSyncResult, TemplateSyncTarget } from '@/features/updates/services/templateSyncTypes';

/** The error text a conflicted merge carries, so every surface says the same thing. */
export function describeTemplateConflicts(conflicts: string[]): string {
    const noun = conflicts.length === 1 ? 'file' : 'files';
    return `Merge conflicts in ${conflicts.length} ${noun} (${conflicts.join(', ')}); `
        + 'the template update was not applied.';
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
 * Files that should never be overwritten during template sync
 * These contain project-specific configuration
 */
export const DEFAULT_PRESERVE_FILES = [
    'fstab.yaml',       // Helix content source configuration
    'config.json',      // Commerce endpoint configuration
];
