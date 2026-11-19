/**
 * Why a creation step failed: what the run pauses on until the SC fixes it or skips the
 * step (`creationPause.ts`, F307). The steps a project can live without resolve one of
 * these rather than throwing.
 *
 * @module features/project-creation/services/stepFailure
 */

import { classifyTransience } from '@/core/errors';

/** Why a step failed, and whether trying again could help. */
export interface StepFailure {
    /** In plain words, for the SC. */
    reason: string;
    /** A timeout or a dropped connection: Retry is offered first. */
    retryable?: boolean;
}

/**
 * A step's failure from its reason.
 *
 * @param reason - why it failed; undefined when it passed
 * @returns the failure, or undefined
 */
export function stepFailureOf(reason: string | undefined): StepFailure | undefined {
    return reason === undefined ? undefined : { reason, retryable: classifyTransience(reason).retryable };
}
