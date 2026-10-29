/**
 * The progress update a reporter sends when it knows how far the current step is.
 *
 * exactProgress and timedProgress built this same object by hand at five sites
 * (jscpd pairs 37 to 39 in PL-69, 2026-10-09): the step's share of the overall bar,
 * plus a determinate command bar at `percent`.
 *
 * @module core/utils/progressUnifier/progressPayload
 */

import type { ExecutionContext, UnifiedProgress } from './types';

type Confidence = NonNullable<UnifiedProgress['command']>['confidence'];

/**
 * Build a determinate progress update for the step in `context`.
 *
 * @param context - the running step (index, total, display name)
 * @param percent - how far through THIS step, 0 to 100
 * @param detail - the line shown under the command bar
 * @param confidence - where the percent came from; defaults to `'exact'`
 * @returns the update to hand to the progress handler
 */
export function determinateProgress(
    context: Pick<ExecutionContext, 'stepIndex' | 'totalSteps' | 'stepName'>,
    percent: number,
    detail: string,
    confidence: Confidence = 'exact',
): UnifiedProgress {
    return {
        overall: {
            percent: Math.round(((context.stepIndex + (percent / 100)) / context.totalSteps) * 100),
            currentStep: context.stepIndex + 1,
            totalSteps: context.totalSteps,
            stepName: context.stepName,
        },
        command: {
            type: 'determinate',
            percent,
            detail,
            confidence,
        },
    };
}
