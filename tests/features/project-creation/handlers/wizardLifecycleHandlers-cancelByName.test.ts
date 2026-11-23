/**
 * cancel-project-creation, given a project name: stops that project's creation,
 * whichever door started it (PL-104 fix 14).
 *
 * The wizard's Cancel aborts the controller on its own panel's context. An agent has
 * no panel and a new context on every call, so the name is how it reaches the run:
 * `cancel_project_creation` dispatches this same handler. Creation's phases are the
 * faked boundary; the run and its stop are real.
 */

import { executeProjectCreation } from '@/features/project-creation/handlers/executor';
import { runCreation } from '@/features/project-creation/handlers/creationRun';
import { creationCancelledError } from '@/features/project-creation/handlers/creationStop';
import { handleCancelProjectCreation } from '@/features/project-creation/handlers/wizardLifecycleHandlers';
import type { HandlerContext } from '@/types/handlers';
import { ErrorCode } from '@/types/errorCodes';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

jest.mock('@/features/project-creation/handlers/executor', () => ({
    executeProjectCreation: jest.fn(),
}));

function freshContext(): HandlerContext {
    return createMockHandlerContext({ sharedState: { isAuthenticating: false } });
}

describe('handleCancelProjectCreation with a project name', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("stops that project's creation from another context, which ends as cancelled", async () => {
        // Its running step ends as soon as it is stopped (the run waits for it, F274).
        (executeProjectCreation as jest.Mock).mockImplementation(
            (_context: HandlerContext, _config: unknown, signal: AbortSignal) =>
                new Promise<void>((_resolve, reject) => {
                    signal.addEventListener('abort', () => reject(creationCancelledError()));
                })
        );
        const failure = runCreation(freshContext(), { projectName: 'named-run' }).catch(
            (error: unknown) => error
        );

        const result = await handleCancelProjectCreation(freshContext(), {
            projectName: 'named-run',
        });

        expect(result.success).toBe(true);
        // It says the creation stops after its current step, not that it already has.
        expect(result.data?.message).toBe(
            'Stopping the creation of "named-run" after its current step. ' +
                'What it made is then removed.'
        );
        expect(await failure).toMatchObject({ code: ErrorCode.CANCELLED });
    });

    it('answers that nothing is running when no creation of that name is', async () => {
        const result = await handleCancelProjectCreation(freshContext(), {
            projectName: 'idle-name',
        });

        expect(result).toMatchObject({ success: false, code: ErrorCode.PROJECT_NOT_FOUND });
        expect(result.data?.message).toContain('idle-name');
    });
});
