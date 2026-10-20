/**
 * workingProjectStateManager — a surface's own project answers `getCurrentProject`, and a
 * save never makes another project current (AI-15).
 *
 * The real manager is a mock and the assertions are on the ARGUMENTS it receives: the
 * whole job of this view is which method, with which flags, on which project.
 */

import { createWorkingProjectStateManager } from '@/core/state/workingProjectStateManager';
import { createMockProject } from '../../helpers/projectFake';
import { createMockStateManager } from '../../helpers/stateManagerFake';

const WORKING = '/projects/justrite';
const OTHER = '/projects/scratch';

function makeReal(currentPath: string) {
    return createMockStateManager({
        loadProjectFromPath: jest.fn().mockResolvedValue(createMockProject({ name: 'justrite', path: WORKING })),
        getCurrentProject: jest.fn().mockResolvedValue(createMockProject({ name: 'current', path: currentPath })),
        hasProject: jest.fn().mockReturnValue(true),
    });
}

describe('createWorkingProjectStateManager', () => {
    it('answers getCurrentProject with the working project, read fresh and without moving the pointer', async () => {
        const real = makeReal(OTHER);
        const view = createWorkingProjectStateManager(real, () => WORKING);

        await view.getCurrentProject();
        const project = await view.getCurrentProject();

        expect(project?.path).toBe(WORKING);
        expect(real.loadProjectFromPath).toHaveBeenCalledTimes(2);
        expect(real.loadProjectFromPath).toHaveBeenCalledWith(WORKING, undefined, { persistAfterLoad: false });
    });

    it('follows the current project while it has no working project', async () => {
        const real = makeReal(OTHER);
        const view = createWorkingProjectStateManager(real, () => undefined);

        expect((await view.getCurrentProject())?.path).toBe(OTHER);
        expect(real.loadProjectFromPath).not.toHaveBeenCalled();
    });

    it('reads the working path on every call, so the view moves with its surface', async () => {
        const real = makeReal(OTHER);
        const surface: { path?: string } = {};
        const view = createWorkingProjectStateManager(real, () => surface.path);

        await view.getCurrentProject();
        surface.path = WORKING;
        await view.getCurrentProject();

        expect(real.getCurrentProject).toHaveBeenCalledTimes(1);
        expect(real.loadProjectFromPath).toHaveBeenCalledWith(WORKING, undefined, { persistAfterLoad: false });
    });

    it('saves without moving the pointer while its project is not the current one', async () => {
        const real = makeReal(OTHER);
        const view = createWorkingProjectStateManager(real, () => WORKING);
        const project = createMockProject({ name: 'justrite', path: WORKING });

        await view.saveProject(project);

        expect(real.saveProjectConfigOnly).toHaveBeenCalledWith(project);
        expect(real.saveProject).not.toHaveBeenCalled();
    });

    // The common case must not change: an open dashboard refreshes on the change event
    // the real save fires, and the config-only save fires none.
    it('saves exactly as before while its project is the current one, change event and all', async () => {
        const real = makeReal(WORKING);
        const view = createWorkingProjectStateManager(real, () => WORKING);
        const project = createMockProject({ name: 'justrite', path: WORKING });

        await view.saveProject(project);

        expect(real.saveProject).toHaveBeenCalledWith(project);
        expect(real.saveProjectConfigOnly).not.toHaveBeenCalled();
    });

    // A rename saves the project at its NEW folder, which is not the current pointer yet.
    // Deciding by the saved project's path would have left the pointer on a folder that
    // no longer exists.
    it('lets a rename of the current project move the pointer to the new folder', async () => {
        const real = makeReal(WORKING);
        const view = createWorkingProjectStateManager(real, () => WORKING);
        const renamed = createMockProject({ name: 'justrite-2', path: '/projects/justrite-2' });

        await view.saveProject(renamed);

        expect(real.saveProject).toHaveBeenCalledWith(renamed);
    });

    // The projects list selects a project BY saving it, and has no working project.
    it('saves exactly as before when it has no working project', async () => {
        const real = makeReal(OTHER);
        const view = createWorkingProjectStateManager(real, () => undefined);
        const project = createMockProject({ name: 'justrite', path: WORKING });

        await view.saveProject(project);

        expect(real.saveProject).toHaveBeenCalledWith(project);
    });

    // The view this replaced inherited by prototype: a delegated method that assigned a
    // field (`clearAll` replaces `this.state`) changed the copy, not the real manager.
    it('runs every other method on the real manager itself', async () => {
        const seen: unknown[] = [];
        const real = makeReal(OTHER);
        (real as unknown as { clearAll: () => Promise<void> }).clearAll = async function (this: unknown) {
            seen.push(this);
        };
        const view = createWorkingProjectStateManager(real, () => WORKING);

        await view.clearAll();

        expect(seen).toEqual([real]);
    });
});
