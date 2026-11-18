/**
 * create_project runs through the wizard's creation run, so it can be stopped
 * and it has the same time limit (PL-104 fix 14).
 *
 * Until 2026-11-18 the agent called creation directly: no 30-minute limit and no
 * abort, so a creation that hung never ended and nothing could stop it. Mocks are
 * owned by `createProjectTool.testUtils.ts`; creation's phases are faked there, so
 * a creation that never finishes is one the fake never resolves. `stopCreation` comes
 * from there too: imported first from its own module, it loads the REAL executor.
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

/** Resolve once creation has been started, so a stop has something to stop. */
async function creationStarted(): Promise<void> {
    // The name check reads the projects folder from disk, so poll on the clock, not on ticks.
    for (let i = 0; i < 400 && (executeProjectCreation as jest.Mock).mock.calls.length === 0; i++) {
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}

describe('create_project — a running creation can be stopped', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        defaultStorefrontSetup();
        (executeProjectCreation as jest.Mock).mockReturnValueOnce(
            new Promise<void>(() => undefined)
        );
    });

    it.each([
        ['headless', HEADLESS],
        ['Edge Delivery', EDS],
    ])(
        'stops a %s creation by its project, answers not created, and cleans up',
        async (_kind, args) => {
            const answer = toolServer().call(args);
            await creationStarted();

            // The folder of the config creation was handed (assembled by the faked builder).
            const [, handed] = (executeProjectCreation as jest.Mock).mock.calls[0];
            expect(stopCreation(creationPath(handed))).toBe(true);
            const res = await answer;

            expect(res).toMatchObject({ created: false });
            expect(res.error).toContain('cancelled');
            expect(cleanupFailedCreation).toHaveBeenCalled();
        }
    );
});
