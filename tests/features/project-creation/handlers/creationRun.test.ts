/**
 * The creation run: the one place a project creation gets its time limit and its stop.
 *
 * The wizard and the agent tools both start a creation here (PL-104 fix 14). Until
 * 2026-11-18 only the wizard wrapped creation in the 30-minute limit and an abort
 * controller, so an agent creation that hung never ended and nothing could stop it.
 * These tests drive the run itself, so they hold whichever door called it. Creation's
 * own phases are the boundary faked here; the limit and the stop are real.
 */

import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { executeProjectCreation } from '@/features/project-creation/handlers/executor';
import { runCreation } from '@/features/project-creation/handlers/creationRun';
import { stopCreation } from '@/features/project-creation/handlers/creationStop';
import { creationPath } from '@/features/project-creation/handlers/executorPreflight';
import type { HandlerContext } from '@/types/handlers';
import { ErrorCode } from '@/types/errorCodes';
import type { ProjectCreationConfig } from '@/types/webviewRequests';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

jest.mock('@/features/project-creation/handlers/executor', () => ({
    executeProjectCreation: jest.fn(),
}));

const config: ProjectCreationConfig = { projectName: 'run-under-test' };
const folder = creationPath(config);

/** A creation that never finishes on its own: only the limit or a stop ends it. */
function hangingCreation(): void {
    (executeProjectCreation as jest.Mock).mockReturnValue(new Promise<void>(() => undefined));
}

function cancelled(): Error {
    return Object.assign(new Error('Project creation cancelled by user'), {
        code: ErrorCode.CANCELLED,
    });
}

/**
 * A creation whose running step ends only when the test says so; at the boundary after
 * it, a stopped creation ends, as the real one does (`executor-stopAtStepBoundary`).
 */
function steppedCreation(): { finishStep: () => void; signal: () => AbortSignal | undefined } {
    let finishStep: () => void = () => undefined;
    const stepDone = new Promise<void>((resolve) => {
        finishStep = resolve;
    });
    (executeProjectCreation as jest.Mock).mockImplementation(
        async (_context: HandlerContext, _config: ProjectCreationConfig, signal?: AbortSignal) => {
            await stepDone;
            if (signal?.aborted) throw cancelled();
        },
    );
    const signal = (): AbortSignal | undefined =>
        (executeProjectCreation as jest.Mock).mock.calls[0]?.[2];
    return { finishStep, signal };
}

/** A creation whose running step ends the moment it is stopped. */
function creationEndingAtNextStep(): void {
    (executeProjectCreation as jest.Mock).mockImplementation(
        (_context: HandlerContext, _config: ProjectCreationConfig, signal: AbortSignal) =>
            new Promise<void>((_resolve, reject) => {
                signal.addEventListener('abort', () => reject(cancelled()));
            }),
    );
}

/** Whether a promise has settled, read without waiting for it. */
function tracked(run: Promise<void>): { failure: Promise<unknown>; settled: () => boolean } {
    let done = false;
    const failure = run.then(
        () => {
            done = true;
            return undefined;
        },
        (error: unknown) => {
            done = true;
            return error;
        },
    );
    return { failure, settled: () => done };
}

function freshContext(): HandlerContext {
    return createMockHandlerContext({ sharedState: { isAuthenticating: false } });
}

describe('runCreation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('ends a creation that runs past the 30-minute limit, as a timeout', async () => {
        creationEndingAtNextStep();
        const run = runCreation(freshContext(), config);
        const failure = run.catch((error: unknown) => error);

        await jest.advanceTimersByTimeAsync(TIMEOUTS.PROJECT_CREATION_OVERALL);

        expect(await failure).toMatchObject({ code: ErrorCode.TIMEOUT });
    });

    it('lets a creation finish inside the limit', async () => {
        (executeProjectCreation as jest.Mock).mockResolvedValue(undefined);

        await expect(runCreation(freshContext(), config)).resolves.toBeUndefined();
    });

    it('is stopped by its project folder, ending as cancelled', async () => {
        creationEndingAtNextStep();
        const run = runCreation(freshContext(), config);
        const failure = run.catch((error: unknown) => error);

        expect(stopCreation(folder)).toBe(true);

        expect(await failure).toMatchObject({ code: ErrorCode.CANCELLED });
    });

    it("is stopped by the wizard's cancel, which aborts the context's controller", async () => {
        creationEndingAtNextStep();
        const context = freshContext();
        const run = runCreation(context, config);
        const failure = run.catch((error: unknown) => error);

        context.sharedState.projectCreationAbortController?.abort();

        expect(await failure).toMatchObject({ code: ErrorCode.CANCELLED });
    });

    it('has nothing to stop once the run has settled, and clears its controller', async () => {
        (executeProjectCreation as jest.Mock).mockResolvedValue(undefined);
        const context = freshContext();

        await runCreation(context, config);

        expect(stopCreation(folder)).toBe(false);
        expect(context.sharedState.projectCreationAbortController).toBeUndefined();
    });

    it('answers false for a folder with no creation running', () => {
        expect(stopCreation('/nowhere/at-all')).toBe(false);
    });
});

/**
 * A stop (or the limit) used to end only the WAIT: the door cleaned up at once while
 * the running step carried on and the steps after it still started, so a repository,
 * site or mesh could be made after the cleanup and nothing removed it (F274).
 */
describe('runCreation: stopping waits for the running step', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('hands creation the stop, so its steps can see it', async () => {
        const { finishStep, signal } = steppedCreation();
        const { failure } = tracked(runCreation(freshContext(), config));

        expect(signal()?.aborted).toBe(false);
        stopCreation(folder);
        expect(signal()?.aborted).toBe(true);

        finishStep();
        await failure;
    });

    it('answers only after the running step has ended, so cleanup sees what it made', async () => {
        const { finishStep } = steppedCreation();
        const { failure, settled } = tracked(runCreation(freshContext(), config));

        stopCreation(folder);
        await jest.advanceTimersByTimeAsync(TIMEOUTS.PROJECT_CREATION_STOP_GRACE / 2);
        expect(settled()).toBe(false);

        finishStep();
        expect(await failure).toMatchObject({ code: ErrorCode.CANCELLED });
    });

    it('the time limit stops the steps too, and waits for the running one the same way', async () => {
        const { finishStep, signal } = steppedCreation();
        const { failure, settled } = tracked(runCreation(freshContext(), config));

        await jest.advanceTimersByTimeAsync(TIMEOUTS.PROJECT_CREATION_OVERALL);
        expect(signal()?.aborted).toBe(true);
        expect(settled()).toBe(false);

        finishStep();
        expect(await failure).toMatchObject({ code: ErrorCode.TIMEOUT });
    });

    it('waits only so long for a step that never ends, and says one was still running', async () => {
        hangingCreation();
        const { failure, settled } = tracked(runCreation(freshContext(), config));

        stopCreation(folder);
        await jest.advanceTimersByTimeAsync(TIMEOUTS.PROJECT_CREATION_STOP_GRACE - 1);
        expect(settled()).toBe(false);
        await jest.advanceTimersByTimeAsync(1);

        const error = await failure;
        expect(error).toMatchObject({ code: ErrorCode.CANCELLED });
        expect((error as Error).message).toContain('still running');
    });

    it('says it is stopping while the running step finishes', async () => {
        const { finishStep } = steppedCreation();
        const context = freshContext();
        const { failure } = tracked(runCreation(context, config));

        stopCreation(folder);
        await jest.advanceTimersByTimeAsync(0);

        expect(context.sendMessage).toHaveBeenCalledWith(
            'creationProgress',
            expect.objectContaining({ currentOperation: 'Stopping after this step' }),
        );
        finishStep();
        await failure;
    });

    it('answers a creation that fails on its own at once, with its own error', async () => {
        (executeProjectCreation as jest.Mock).mockRejectedValue(new Error('clone failed'));

        await expect(runCreation(freshContext(), config)).rejects.toThrow('clone failed');
    });
});
