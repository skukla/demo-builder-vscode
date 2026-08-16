/**
 * StateManager.readCurrentProjectFromDisk — the disk-authoritative pointer read.
 *
 * `getCurrentProject()` re-reads the project MANIFEST every call but takes the
 * project PATH from in-memory state, loaded once at `initialize()`. There is no
 * watcher on the state file and `reload()` has no callers, so a second extension
 * host answers with whatever project it held at ITS startup — fresh data about
 * the wrong project, which is precisely why it reads as correct. The MCP surface
 * hits this because every window binds the same socket name and the last to bind
 * serves.
 *
 * This read exists for that path. The load-bearing property is that it does NOT
 * touch in-memory state: mutating it would push one window's selection into
 * another window's UI without an event to repaint it.
 */

import * as fs from 'fs/promises';
import { setupMocks, createMockProject, type TestMocks } from './stateManager.testUtils';

jest.mock('vscode');
jest.mock('fs/promises');
jest.mock('os');

describe('StateManager.readCurrentProjectFromDisk', () => {
    let testMocks: TestMocks;

    beforeEach(() => {
        testMocks = setupMocks();
    });

    /** Initialize the manager holding `heldPath` as its in-memory pointer. */
    async function initHolding(heldPath: string) {
        const held = createMockProject();
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

    it('reads the pointer written by another window, not the one held in memory', async () => {
        const { stateManager } = testMocks;
        await initHolding('/projects/held-at-startup');

        // Another window has since selected a different project.
        (fs.readFile as jest.Mock).mockResolvedValue(
            JSON.stringify({ version: 1, currentProjectPath: '/projects/selected-elsewhere' })
        );
        const fresh = createMockProject();
        fresh.path = '/projects/selected-elsewhere';
        const loadProject = jest
            .spyOn(
                (stateManager as unknown as { projectFileLoader: { loadProject: () => unknown } })
                    .projectFileLoader,
                'loadProject'
            )
            .mockResolvedValue(fresh as never);

        const result = await stateManager.readCurrentProjectFromDisk();

        expect(result).toBe(fresh);
        expect(loadProject).toHaveBeenCalledWith(
            '/projects/selected-elsewhere',
            expect.any(Function)
        );
    });

    it('leaves in-memory state untouched', async () => {
        const { stateManager } = testMocks;
        await initHolding('/projects/held-at-startup');

        (fs.readFile as jest.Mock).mockResolvedValue(
            JSON.stringify({ version: 1, currentProjectPath: '/projects/selected-elsewhere' })
        );
        const fresh = createMockProject();
        fresh.path = '/projects/selected-elsewhere';
        jest.spyOn(
            (stateManager as unknown as { projectFileLoader: { loadProject: () => unknown } })
                .projectFileLoader,
            'loadProject'
        ).mockResolvedValue(fresh as never);

        await stateManager.readCurrentProjectFromDisk();

        // The window's own view of "current project" must not have moved — this
        // is what keeps the fix scoped to the agent surface. loadProjectFromPath
        // is deliberately not used for exactly this reason: even with
        // persistAfterLoad:false it assigns state.currentProject.
        const inMemory = (
            stateManager as unknown as { state: { currentProject?: { path: string } } }
        ).state.currentProject;
        expect(inMemory?.path).toBe('/projects/held-at-startup');
    });

    it('reads the legacy currentProject.path shape too', async () => {
        const { stateManager } = testMocks;
        await initHolding('/projects/held-at-startup');

        (fs.readFile as jest.Mock).mockResolvedValue(
            JSON.stringify({ version: 1, currentProject: { path: '/projects/legacy' } })
        );
        const fresh = createMockProject();
        const loadProject = jest
            .spyOn(
                (stateManager as unknown as { projectFileLoader: { loadProject: () => unknown } })
                    .projectFileLoader,
                'loadProject'
            )
            .mockResolvedValue(fresh as never);

        await stateManager.readCurrentProjectFromDisk();

        expect(loadProject).toHaveBeenCalledWith('/projects/legacy', expect.any(Function));
    });

    describe('returns undefined rather than throwing', () => {
        it('when the state file has no pointer', async () => {
            const { stateManager } = testMocks;
            await initHolding('/projects/held-at-startup');

            (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify({ version: 1 }));

            await expect(stateManager.readCurrentProjectFromDisk()).resolves.toBeUndefined();
        });

        it('when the state file is unreadable', async () => {
            const { stateManager } = testMocks;
            await initHolding('/projects/held-at-startup');

            (fs.readFile as jest.Mock).mockRejectedValue(new Error('ENOENT'));

            await expect(stateManager.readCurrentProjectFromDisk()).resolves.toBeUndefined();
        });

        it('when the pointed-at project no longer loads', async () => {
            const { stateManager } = testMocks;
            await initHolding('/projects/held-at-startup');

            (fs.readFile as jest.Mock).mockResolvedValue(
                JSON.stringify({ version: 1, currentProjectPath: '/projects/deleted' })
            );
            jest.spyOn(
                (stateManager as unknown as { projectFileLoader: { loadProject: () => unknown } })
                    .projectFileLoader,
                'loadProject'
            ).mockResolvedValue(null as never);

            await expect(stateManager.readCurrentProjectFromDisk()).resolves.toBeUndefined();
        });
    });
});
