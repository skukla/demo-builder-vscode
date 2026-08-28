/**
 * Success / failure command results (ADR-016 § Fixtures).
 *
 * Five definitions existed across three files — two `createSuccessResult`
 * functions, one `const` arrow form, and two `createFailureResult`. They agreed
 * on the shape and differed only in cosmetics: the default stdout, the
 * `duration` value (1000 / 100 / 0), and whether one of them JSON-stringified
 * its argument for you.
 *
 * `duration` was checked before choosing: no test in the corpus asserts on it,
 * so the differing values were never load-bearing.
 *
 * Typed to the REAL `CommandResult` rather than a test-local `MockCommandResult`
 * (which was itself a hand-written copy of the same four fields), so these stop
 * compiling if the real result shape changes.
 */

import type { CommandResult } from '@/core/shell/types';

/** A successful result. Pass JSON.stringify(x) when a caller expects JSON stdout. */
export function createSuccessResult(stdout: string = ''): CommandResult {
    return { stdout, stderr: '', code: 0, duration: 0 };
}

/** A failed result. */
export function createFailureResult(stderr: string = 'Command failed'): CommandResult {
    return { stdout: '', stderr, code: 1, duration: 0 };
}
