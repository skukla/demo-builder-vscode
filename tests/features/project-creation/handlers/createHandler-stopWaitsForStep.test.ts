/**
 * The wizard's Cancel: cleanup waits for the step that was running (F274).
 *
 * Until 2026-11-18 Cancel ended only the wait. `handleCreateProject` cleaned up at once
 * while the running step carried on, so whatever that step made after the cleanup (a
 * folder, a mesh, a repository) was never removed. The creation run is REAL here; the
 * creation itself and the cleanup are the boundaries faked, so the order between them
 * is what is asserted.
 */

import { createProjectCreationContext } from './createHandler.testUtils';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { cleanupFailedCreation } from '@/features/project-creation/handlers/creationFailureCleanup';
import { projectNameProblem } from '@/features/project-creation/handlers/creationNameCheck';
import { creationCancelledError } from '@/features/project-creation/handlers/creationStop';
import { handleCreateProject } from '@/features/project-creation/handlers/createHandler';
import { executeProjectCreation } from '@/features/project-creation/handlers/executor';
import { handleCancelProjectCreation } from '@/features/project-creation/handlers/wizardLifecycleHandlers';
import type { HandlerContext } from '@/types/handlers';
import type { ProjectCreationConfig } from '@/types/webviewRequests';

jest.mock('@/features/project-creation/handlers/executor', () => ({
    executeProjectCreation: jest.fn(),
}));
jest.mock('@/features/project-creation/handlers/creationFailureCleanup', () => ({
    cleanupFailedCreation: jest.fn(async () => undefined),
}));
jest.mock('@/features/project-creation/handlers/creationNameCheck', () => ({
    projectNameProblem: jest.fn(async () => undefined),
}));

const payload = { projectName: 'cancel-demo' };

/** The run's record of what happened, in order. */
const events: string[] = [];

/** A creation whose running step ends only when the test says so. */
function steppedCreation(): () => void {
    let finishStep: () => void = () => undefined;
    const stepDone = new Promise<void>((resolve) => {
        finishStep = resolve;
    });
    (executeProjectCreation as jest.Mock).mockImplementation(
        async (_context: HandlerContext, _config: ProjectCreationConfig, signal?: AbortSignal) => {
            await stepDone;
            events.push('step ended');
            if (signal?.aborted) throw creationCancelledError();
        }
    );
    return finishStep;
}

function wizardContext(): HandlerContext {
    return createProjectCreationContext({
        // The one-time trust tip was shown before, so the run starts straight away.
        context: createMockExtensionContext({
            globalState: {
                get: jest.fn().mockReturnValue(true),
                update: jest.fn().mockResolvedValue(undefined),
                keys: jest.fn().mockReturnValue([]),
                setKeysForSync: jest.fn(),
            },
        }),
    });
}

async function started(): Promise<void> {
    for (let i = 0; i < 100 && (executeProjectCreation as jest.Mock).mock.calls.length === 0; i++) {
        await Promise.resolve();
    }
}

/** Let the stop reach the run: the abort, then the wait it ends. */
async function settle(): Promise<void> {
    for (let i = 0; i < 20; i++) await Promise.resolve();
}

describe("create-project: the wizard's Cancel waits for the running step", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        events.length = 0;
        (projectNameProblem as jest.Mock).mockResolvedValue(undefined);
        (cleanupFailedCreation as jest.Mock).mockImplementation(async () => {
            events.push('cleanup');
        });
    });

    it('cleans up only after the step that was running has ended', async () => {
        const finishStep = steppedCreation();
        const context = wizardContext();
        const handled = handleCreateProject(context, payload);
        await started();

        await handleCancelProjectCreation(context);
        await settle();
        expect(cleanupFailedCreation).not.toHaveBeenCalled();

        finishStep();
        await handled;

        expect(events).toEqual(['step ended', 'cleanup']);
        expect(context.sendMessage).toHaveBeenCalledWith(
            'creationProgress',
            expect.objectContaining({ currentOperation: 'Cancelled' })
        );
    });

    it('says it is stopping while the step finishes', async () => {
        const finishStep = steppedCreation();
        const context = wizardContext();
        const handled = handleCreateProject(context, payload);
        await started();

        await handleCancelProjectCreation(context);
        await settle();

        expect(context.sendMessage).toHaveBeenCalledWith(
            'creationProgress',
            expect.objectContaining({ currentOperation: 'Stopping after this step' })
        );
        finishStep();
        await handled;
    });
});
