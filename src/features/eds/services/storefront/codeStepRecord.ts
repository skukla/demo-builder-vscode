/**
 * The project's Republish the Code step (PL-101): code files a creation or reset left that the
 * live site did not serve yet, saved on the project as a Finish Setup step so the SC can find
 * it again after the end screen is gone, and the step's Check can look at the same files.
 *
 * A run that builds the storefront REPLACES the whole record (owner, 2026-11-17): a clean run
 * leaves no stale step, and a finished step is kept, shown done, only until the next run.
 *
 * @module features/eds/services/storefront/codeStepRecord
 */

import type { Project } from '@/types/base';

/** The step's id on `Project.finishSetup`. */
export const REPUBLISH_CODE_STEP = 'republish-code';

/**
 * Replace the project's Finish Setup record with what this run left: Republish the Code with
 * the files the site did not serve, or no record at all when it served them all.
 *
 * @param project - mutated; the caller saves it
 * @param codeNotServed - the repository paths the live site did not serve as committed
 */
export function replaceFinishSetup(
    project: Project,
    codeNotServed: readonly string[] | undefined,
): void {
    if (codeNotServed && codeNotServed.length > 0) {
        project.finishSetup = { [REPUBLISH_CODE_STEP]: { files: [...codeNotServed] } };
    } else {
        delete project.finishSetup;
    }
}
