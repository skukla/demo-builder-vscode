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
import { runCreation, stopCreation } from '@/features/project-creation/handlers/creationRun';
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
        hangingCreation();
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
        hangingCreation();
        const run = runCreation(freshContext(), config);
        const failure = run.catch((error: unknown) => error);

        expect(stopCreation(folder)).toBe(true);

        expect(await failure).toMatchObject({ code: ErrorCode.CANCELLED });
    });

    it("is stopped by the wizard's cancel, which aborts the context's controller", async () => {
        hangingCreation();
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
