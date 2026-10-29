/**
 * Prerequisite Handlers - a failed or timed-out check
 *
 * One way to log a prerequisite check that threw and tell the UI it failed,
 * shared by the check and continue handlers.
 */

import type { PrerequisiteDefinition } from '../services/PrerequisitesManager';
import { classifyTransience } from '@/core/errors';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { HandlerContext } from '@/types/handlers';
import { toError } from '@/types/typeGuards';
import type { PrerequisiteStatusPayload } from '@/types/webviewPayloads';

/**
 * Handle prerequisite check errors with consistent logging and UI updates
 *
 * Extracts the common error handling pattern from checkHandler and continueHandler.
 * Handles both timeout errors and general check failures with appropriate logging
 * to all channels (logger, stepLogger, debugLogger) and sends status to UI.
 *
 * @param context - Handler context with logging and messaging capabilities
 * @param prereq - The prerequisite that failed to check
 * @param index - Index of the prerequisite in the list (for UI updates)
 * @param error - The error that occurred during checking
 * @param isRecheck - Whether this is a recheck (affects log messages)
 */
export async function handlePrerequisiteCheckError(
    context: HandlerContext,
    prereq: PrerequisiteDefinition,
    index: number,
    error: unknown,
    isRecheck = false,
): Promise<void> {
    const errorMessage = toError(error).message;
    const isTimeoutErr = classifyTransience(error).kind === 'timeout';
    const checkType = isRecheck ? 're-check' : 'check';

    // Log to all appropriate channels
    if (isTimeoutErr) {
        context.logger.warn(
            `[Prerequisites] ${prereq.name} ${checkType} timed out after ${TIMEOUTS.PREREQUISITE_CHECK / 1000}s`,
        );
        context.stepLogger?.log(
            'prerequisites',
            `⏱️ ${prereq.name} ${checkType} timed out (${TIMEOUTS.PREREQUISITE_CHECK / 1000}s)`,
            'warn',
        );
        context.debugLogger.debug(
            `[Prerequisites] ${isRecheck ? 'Re-check' : 'Check'} timeout details:`,
            {
                prereq: prereq.id,
                timeout: TIMEOUTS.PREREQUISITE_CHECK,
                error: errorMessage,
            },
        );
    } else {
        context.logger.error(
            `[Prerequisites] Failed to ${checkType} ${prereq.name}:`,
            error as Error,
        );
        context.stepLogger?.log(
            'prerequisites',
            `✗ ${prereq.name} ${checkType} failed: ${errorMessage}`,
            'error',
        );
        context.debugLogger.debug(
            `[Prerequisites] ${isRecheck ? 'Re-check' : 'Check'} failure details:`,
            {
                prereq: prereq.id,
                error,
            },
        );
    }

    // Send error status to UI
    const failed: PrerequisiteStatusPayload = {
        index,
        name: prereq.name,
        status: 'error',
        description: prereq.description,
        required: !prereq.optional,
        installed: false,
        message: isTimeoutErr
            ? `Check timed out after ${TIMEOUTS.PREREQUISITE_CHECK / 1000} seconds. Click Recheck to try again.`
            : `Failed to check: ${errorMessage}`,
        canInstall: false,
    };
    await context.sendMessage('prerequisite-status', failed);
}
