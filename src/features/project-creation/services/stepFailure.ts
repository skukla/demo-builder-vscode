/**
 * Why a creation step failed: what the run pauses on until the SC fixes it or skips the
 * step (`creationPause.ts`, F307). A step resolves one of these, or throws and has its
 * error turned into one (`stepFailureOfError`).
 *
 * @module features/project-creation/services/stepFailure
 */

import { classifyTransience, extractErrorMessage } from '@/core/errors';
import { notYetPlain, plainOf, type PlainText } from '@/core/utils/plainText';

/** Why a step failed, and whether trying again could help. */
export interface StepFailure {
    /** In plain words, for the SC. */
    reason: string;
    /** A timeout or a dropped connection: Retry is offered first. */
    retryable?: boolean;
    /** What the step threw, kept so a run that cannot pause still ends with it. */
    error?: unknown;
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

/**
 * What a creation's thrown error says to the SC (PL-102): a PlainError's own sentence,
 * else the thrown text through the counted debt (creation's steps throw this
 * extension's sentences; slice 4 types them). The paused screen and the failed screen
 * say it the same way.
 *
 * @param error - what was thrown
 * @returns the sentence
 */
export function creationErrorText(error: unknown): PlainText {
    return plainOf(error) ?? notYetPlain(extractErrorMessage(error));
}

/**
 * A thrown error as a step's failure, the error kept.
 *
 * @param error - what the step threw
 * @returns the failure
 */
export function stepFailureOfError(error: unknown): StepFailure {
    return {
        reason: creationErrorText(error),
        retryable: classifyTransience(error).retryable,
        error,
    };
}
