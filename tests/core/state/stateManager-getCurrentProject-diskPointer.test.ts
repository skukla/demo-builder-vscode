/**
 * StateManager.getCurrentProject — the pointer comes from disk, not memory.
 *
 * `state.json` is the cross-window authority for which project is selected.
 * In-memory state is a per-window copy loaded once at `initialize()`, with no
 * watcher on the file and (until now) nothing re-reading it. A window that did
 * not make the selection therefore answered with the project it held at ITS
 * startup — and answered confidently, because the project's MANIFEST really was
 * re-read every call. Fresh data about the wrong project.
 *
 * It is not only a cross-window problem. `loadProjectFromPath` with
 * `persistAfterLoad: false` assigns `state.currentProject`, and the home-screen
 * kebab calls it on whatever project the row belongs to — so a pin or rename on
 * an unrelated project reassigned this window's in-memory pointer too.
 */

import * as fs from 'fs/promises';
import { setupMocks, createStateManagerProject, type TestMocks } from './stateManager.testUtils';

jest.mock('vscode');
jest.mock('fs/promises');
jest.mock('os');

describe('StateManager.getCurrentProject — disk pointer', () => {
    let testMocks: TestMocks;

    beforeEach(() => {
        testMocks = setupMocks();
    });

    /** Initialize holding `heldPath` as the in-memory pointer. */
    async function initHolding(heldPath: string) {
        const held = createStateManagerProject();
        held.path = heldPath;
        (fs.readFile as jest.Mock).mockResolvedValue(
            JSON.stringify({
                version: 1,
                currentProject: held,
                processes: {},
                lastUpdated: new Date().toISOString(),
            })
        );
        await testMocks.stateManager.initialize();
        return held;
    }

    /** Make the on-disk state file report `pointerPath`. */
    function diskPointsAt(pointerPath: string | undefined) {
        (fs.readFile as jest.Mock).mockResolvedValue(
            JSON.stringify(
                pointerPath ? { version: 1, currentProjectPath: pointerPath } : { version: 1 }
            )
        );
    }

    function stubLoad(project: unknown) {
        return jest
            .spyOn(testMocks.stateManager, 'loadProjectFromPath')
            .mockResolvedValue(project as never);
    }

    it('resolves the project another window selected, not the one held in memory', async () => {
        const { stateManager } = testMocks;
        await initHolding('/projects/held-at-startup');

        diskPointsAt('/projects/selected-elsewhere');
        const fresh = createStateManagerProject();
        fresh.path = '/projects/selected-elsewhere';
        const load = stubLoad(fresh);

        await expect(stateManager.getCurrentProject()).resolves.toBe(fresh);
        expect(load).toHaveBeenCalledWith(
            '/projects/selected-elsewhere',
            expect.any(Function),
            expect.objectContaining({ persistAfterLoad: false })
        );
    });

    it('reads the legacy currentProject.path shape too', async () => {
        const { stateManager } = testMocks;
        await initHolding('/projects/held-at-startup');

        (fs.readFile as jest.Mock).mockResolvedValue(
            JSON.stringify({ version: 1, currentProject: { path: '/projects/legacy' } })
        );
        const load = stubLoad(createStateManagerProject());

        await stateManager.getCurrentProject();

        expect(load).toHaveBeenCalledWith(
            '/projects/legacy',
            expect.any(Function),
            expect.anything()
        );
    });

    describe('falls back to the in-memory pointer', () => {
        // A project can be held in memory but never persisted, so an absent or
        // unreadable pointer must not erase this window's project.
        it('when the state file has no pointer', async () => {
            const { stateManager } = testMocks;
            await initHolding('/projects/held-at-startup');

            diskPointsAt(undefined);
            const load = stubLoad(createStateManagerProject());

            await stateManager.getCurrentProject();

            expect(load).toHaveBeenCalledWith(
                '/projects/held-at-startup',
                expect.any(Function),
                expect.anything()
            );
        });

        it('when the state file is unreadable', async () => {
            const { stateManager } = testMocks;
            await initHolding('/projects/held-at-startup');

            (fs.readFile as jest.Mock).mockRejectedValue(new Error('EACCES'));
            const load = stubLoad(createStateManagerProject());

            await stateManager.getCurrentProject();

            expect(load).toHaveBeenCalledWith(
                '/projects/held-at-startup',
                expect.any(Function),
                expect.anything()
            );
        });

        // saveState is atomic (temp + rename), so this should not happen — but a
        // torn read must degrade to the in-memory project, never to "no project".
        it('when a concurrent write is caught mid-flight', async () => {
            const { stateManager } = testMocks;
            const held = await initHolding('/projects/held-at-startup');

            (fs.readFile as jest.Mock).mockResolvedValue('{"version":1,"currentProj');
            stubLoad(null);

            const result = await stateManager.getCurrentProject();
            expect(result?.path).toBe(held.path);
        });
    });

    it('returns the in-memory project when the pointed-at project fails to load', async () => {
        const { stateManager } = testMocks;
        const held = await initHolding('/projects/held-at-startup');

        diskPointsAt('/projects/deleted');
        stubLoad(null);

        const result = await stateManager.getCurrentProject();
        expect(result?.path).toBe(held.path);
    });
});
