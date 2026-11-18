/**
 * create_project runs through the wizard's creation run, so it can be stopped
 * and it has the same time limit (PL-104 fix 14).
 *
 * Until 2026-11-18 the agent called creation directly: no 30-minute limit and no
 * abort, so a creation that hung never ended and nothing could stop it. Mocks are
 * owned by `createProjectTool.testUtils.ts`; creation's phases are faked there, so
 * a creation that never finishes is one the fake never resolves. `stopCreation` comes
 * from there too: imported first from its own module, it loads the REAL executor.
 *
 * Cleanup waits for the step that was running (F274): until 2026-11-18 it ran at once
 * while the step carried on, so what the step made afterwards was never removed.
 */

import {
    EDS,
    HEADLESS,
    cleanupFailedCreation,
    defaultStorefrontSetup,
    executeProjectCreation,
    stopCreation,
    toolServer,
} from './createProjectTool.testUtils';
import { creationPath } from '@/features/project-creation/handlers/executorPreflight';
import { creationCancelledError } from '@/features/project-creation/handlers/creationStop';
import type { HandlerContext } from '@/types/handlers';
import type { ProjectCreationConfig } from '@/types/webviewRequests';

/** Resolve once creation has been started, so a stop has something to stop. */
async function creationStarted(): Promise<void> {
    // The name check reads the projects folder from disk, so poll on the clock, not on ticks.
    for (let i = 0; i < 400 && (executeProjectCreation as jest.Mock).mock.calls.length === 0; i++) {
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}

/** The run's record of what happened, in order. */
const events: string[] = [];
let finishStep: () => void = () => undefined;

describe('create_project — a running creation can be stopped', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        events.length = 0;
        defaultStorefrontSetup();
        // The running step ends only when the test says so; a stopped creation then ends
        // at the boundary after it, as the real one does (F274).
        const stepDone = new Promise<void>((resolve) => {
            finishStep = resolve;
        });
        (executeProjectCreation as jest.Mock).mockImplementationOnce(
            async (_ctx: HandlerContext, _config: ProjectCreationConfig, signal?: AbortSignal) => {
                await stepDone;
                events.push('step ended');
                if (signal?.aborted) throw creationCancelledError();
            }
        );
        (cleanupFailedCreation as jest.Mock).mockImplementationOnce(async () => {
            events.push('cleanup');
        });
    });

    it.each([
        ['headless', HEADLESS],
        ['Edge Delivery', EDS],
    ])(
        'stops a %s creation by its project, cleans up after the running step, answers not created',
        async (_kind, args) => {
            const answer = toolServer().call(args);
            await creationStarted();

            // The folder of the config creation was handed (assembled by the faked builder).
            const [, handed] = (executeProjectCreation as jest.Mock).mock.calls[0];
            expect(stopCreation(creationPath(handed))).toBe(true);
            await new Promise((resolve) => setTimeout(resolve, 20));
            expect(cleanupFailedCreation).not.toHaveBeenCalled();

            finishStep();
            const res = await answer;

            expect(res).toMatchObject({ created: false });
            expect(res.error).toContain('cancelled');
            expect(events).toEqual(['step ended', 'cleanup']);
        }
    );
});
