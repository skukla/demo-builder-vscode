/**
 * Loading a project from a path — with and without writing anything back.
 *
 * `loadProjectFromPath` does two jobs, and which one it does is decided by a single
 * flag that defaults to ON: it can adopt the project as the current one and write that
 * to disk, or it can read it and leave the disk alone.
 *
 * The read-only mode is what every SCAN depends on. Tools that inspect other projects
 * pass the flag so they do not rewrite a manifest merely by looking at it — a write
 * hiding inside a read. That contract was asserted from the CALLERS' side (they pass
 * the flag) and never here, where it is honoured, so the branch that acts on it was
 * unconstrained.
 *
 * The loader itself is mocked; the subject is what StateManager does with what it
 * returns.
 */

import * as fs from 'fs/promises';
import { setupMocks, createStateManagerProject, type TestMocks } from './stateManager.testUtils';
import { ProjectFileLoader } from '@/core/state/projectFileLoader';
import { createMockProject } from '../../helpers/projectFake';

jest.mock('fs/promises');
jest.mock('os');
jest.mock('@/core/state/projectFileLoader');

describe('StateManager.loadProjectFromPath', () => {
    const loaded = { ...createStateManagerProject(), path: '/projects/scanned' };

    /**
     * Build a StateManager whose file loader answers with `result`.
     *
     * The loader is constructed INSIDE the StateManager's constructor, so its stub has
     * to be in place before the manager is built — setting it afterwards leaves the
     * manager holding the bare automock, whose `loadProject` resolves undefined.
     */
    function managerLoading(result: unknown): TestMocks {
        (ProjectFileLoader as jest.Mock).mockImplementation(() => ({
            loadProject: jest.fn().mockResolvedValue(result),
        }));
        return setupMocks();
    }

    /** Writes that happened after the marker call count. */
    function writesSince(before: number): number {
        return (fs.writeFile as jest.Mock).mock.calls.length - before;
    }

    it('adopts and persists the project by default', async () => {
        const { stateManager } = managerLoading(loaded);
        await stateManager.initialize();
        const before = (fs.writeFile as jest.Mock).mock.calls.length;

        const project = await stateManager.loadProjectFromPath('/projects/scanned');

        expect(project).toMatchObject({ path: '/projects/scanned' });
        // Adopting means state.json and the recent-projects list both move.
        expect(writesSince(before)).toBeGreaterThan(0);
    });

    it('writes NOTHING when asked to read only', async () => {
        const { stateManager } = managerLoading(loaded);
        await stateManager.initialize();
        const before = (fs.writeFile as jest.Mock).mock.calls.length;

        const project = await stateManager.loadProjectFromPath(
            '/projects/scanned',
            () => [],
            { persistAfterLoad: false }
        );

        // The whole point: a scan that rewrote every manifest it opened would be a
        // write hiding in a read, and nothing about the returned project would differ.
        expect(project).toMatchObject({ path: '/projects/scanned' });
        expect(writesSince(before)).toBe(0);
    });

    /**
     * Some things about a project are only true while the extension is running — the
     * mesh status summary among them. They are not in the manifest, so re-reading the
     * manifest would drop them, and the dashboard would show a project whose mesh status
     * had silently gone blank.
     *
     * It is carried over ONLY for the project already selected. Carrying it onto a
     * different project would put one project's mesh status on another's row.
     */
    describe('runtime-only state across a reload', () => {
        // A string union on Project, not an object — read from the type rather than
        // guessed; the guess did not compile.
        const SUMMARY = 'deployed' as const;

        /**
         * Start up holding `heldPath` as the current project, carrying a mesh summary.
         *
         * The summary is put there by SAVING a project that has one, which is how it
         * gets there in production — a mesh deployment updates the current project.
         * Seeding it through the state FILE does not work and that is the point of the
         * feature: `initialize` re-reads the manifest, which carries no summary, so
         * anything runtime-only is already gone by the time startup finishes.
         */
        async function holding(heldPath: string, result: unknown) {
            (ProjectFileLoader as jest.Mock).mockImplementation(() => ({
                loadProject: jest.fn().mockResolvedValue(result),
            }));
            const mocks = setupMocks();
            await mocks.stateManager.initialize();
            // The canonical builder returns a real `Project`, so no cast is needed —
            // and `as Project` is itself on a shrink-only ledger here, because a cast is
            // how a fake bypasses the builder in the first place.
            await mocks.stateManager.saveProject(
                createMockProject({ path: heldPath, meshStatusSummary: SUMMARY })
            );
            return mocks;
        }

        it('keeps the mesh status when the SAME project is re-read', async () => {
            const reread = { ...createStateManagerProject(), path: '/projects/held' };
            const { stateManager } = await holding('/projects/held', reread);

            const project = await stateManager.loadProjectFromPath('/projects/held', () => [], {
                persistAfterLoad: false,
            });

            // The manifest carries no mesh summary; this one came from memory.
            expect(project?.meshStatusSummary).toEqual(SUMMARY);
        });

        it('does NOT put it on a different project', async () => {
            const other = { ...createStateManagerProject(), path: '/projects/other' };
            const { stateManager } = await holding('/projects/held', other);

            const project = await stateManager.loadProjectFromPath('/projects/other', () => [], {
                persistAfterLoad: false,
            });

            expect(project?.meshStatusSummary).toBeUndefined();
        });
    });

    it('writes nothing, and says so plainly, when the manifest cannot be read', async () => {
        const { stateManager } = managerLoading(null);
        await stateManager.initialize();
        const before = (fs.writeFile as jest.Mock).mock.calls.length;

        const project = await stateManager.loadProjectFromPath('/projects/gone');

        expect(project).toBeNull();
        expect(writesSince(before)).toBe(0);
    });
});
