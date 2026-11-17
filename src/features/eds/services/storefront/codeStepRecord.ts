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

import { TEMPLATE_PROBES } from './codeServed';
import type { Project } from '@/types/base';

/** The step's id on `Project.finishSetup`. */
export const REPUBLISH_CODE_STEP = 'republish-code';

/**
 * Replace the project's Finish Setup record with what this run left: Republish the Code with
 * the files the site did not serve, or no record at all when it served them all. A run whose
 * code could not be published at all, with no file named (the served-code check could not run),
 * still leaves the step, checking the template's own files that every page loads.
 *
 * @param project - mutated; the caller saves it
 * @param codeNotServed - the repository paths the live site did not serve as committed
 * @param codeNotPublished - the run could not publish the code at all
 */
export function replaceFinishSetup(
    project: Project,
    codeNotServed: readonly string[] | undefined,
    codeNotPublished = false,
): void {
    const named = codeNotServed && codeNotServed.length > 0 ? codeNotServed : undefined;
    const files = named ?? (codeNotPublished ? TEMPLATE_PROBES : undefined);
    if (files) {
        project.finishSetup = { [REPUBLISH_CODE_STEP]: { files: [...files] } };
    } else {
        delete project.finishSetup;
    }
}
