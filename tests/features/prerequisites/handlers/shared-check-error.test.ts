/**
 * Prerequisites Handlers — handlePrerequisiteCheckError (PL-22, MUT-01).
 *
 * What the webview is told when a check throws: the exact status payload for a
 * timeout and for any other failure, the step log receiving one entry either
 * way, and a context without a step logger not being a reason to throw.
 */

import { TimeoutError } from '@/core/errors';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { handlePrerequisiteCheckError } from '@/features/prerequisites/handlers/shared';
import type { PrerequisiteDefinition } from '@/features/prerequisites/services/PrerequisitesManager';
import type { StepLogger } from '@/core/logging/stepLogger';
import { createPrereqHandlerContext } from './testHelpers';

const prereq = {
    id: 'git',
    name: 'Git',
    description: 'Version control',
    optional: true,
    check: { command: 'git --version' },
} as PrerequisiteDefinition;

const seconds = TIMEOUTS.PREREQUISITE_CHECK / 1000;

function contextWithStepLogger() {
    const stepLogger = { log: jest.fn() } as unknown as jest.Mocked<StepLogger>;
    const context = createPrereqHandlerContext({ stepLogger });
    return { context, stepLogger };
}

describe('handlePrerequisiteCheckError', () => {
    it('a timeout tells the row to recheck, with the timeout in seconds', async () => {
        const { context, stepLogger } = contextWithStepLogger();

        await handlePrerequisiteCheckError(context, prereq, 3, new TimeoutError('git --version', 1000));

        expect(context.sendMessage).toHaveBeenCalledWith('prerequisite-status', {
            index: 3,
            name: 'Git',
            status: 'error',
            description: 'Version control',
            required: false,
            installed: false,
            message: `Check timed out after ${seconds} seconds. Click Recheck to try again.`,
            canInstall: false,
        });
        expect(stepLogger.log).toHaveBeenCalledTimes(1);
        expect(context.logger.warn).toHaveBeenCalledTimes(1);
        expect(context.logger.error).not.toHaveBeenCalled();
    });

    it('any other failure carries its message and is required when the prerequisite is', async () => {
        const { context, stepLogger } = contextWithStepLogger();
        const required = { ...prereq, optional: false };

        await handlePrerequisiteCheckError(context, required, 0, new Error('spawn git ENOENT'), true);

        expect(context.sendMessage).toHaveBeenCalledWith('prerequisite-status', {
            index: 0,
            name: 'Git',
            status: 'error',
            description: 'Version control',
            required: true,
            installed: false,
            message: 'Failed to check: spawn git ENOENT',
            canInstall: false,
        });
        expect(stepLogger.log).toHaveBeenCalledTimes(1);
        expect(context.logger.error).toHaveBeenCalledTimes(1);
        expect(context.logger.warn).not.toHaveBeenCalled();
    });

    it.each([
        ['a timeout', new TimeoutError('git --version', 1000)],
        ['a failure', new Error('boom')],
    ])('without a step logger, %s is still reported to the webview', async (_name, error) => {
        const context = createPrereqHandlerContext({ stepLogger: undefined });

        await handlePrerequisiteCheckError(context, prereq, 1, error);

        expect(context.sendMessage).toHaveBeenCalledTimes(1);
    });
});
