/**
 * What a spawned step's exit code means: settled, or failed with the command named.
 *
 * Every progress reporter in this folder spawns the step and waits for `close`; the
 * decision at the end was the same five lines in all four (jscpd, 2026-10-08).
 *
 * @module core/utils/progressUnifier/stepExit
 */

import type { ExecutionContext } from './types';
import type { InstallStep } from '@/types/prerequisites';

/**
 * Resolve when the step succeeded, or when the step is marked `continueOnError`;
 * otherwise reject with the exit code and the command that produced it.
 */
export function settleStep(
    code: number | null,
    step: Pick<InstallStep, 'continueOnError'>,
    context: Pick<ExecutionContext, 'command'>,
    resolve: () => void,
    reject: (error: Error) => void,
): void {
    if (code === 0 || step.continueOnError) {
        resolve();
    } else {
        reject(new Error(`Command failed with code ${code}: ${context.command}`));
    }
}
