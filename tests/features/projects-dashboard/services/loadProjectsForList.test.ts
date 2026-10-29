/**
 * loadProjectsForList — the one load both projects-list paths share (PL-82).
 *
 * A project's status is never written to its file (the real loader sets `stopped`
 * or `running`), so "being created" is decided here from the creations running in
 * this window. The fake loader below answers `stopped`, as the real one does.
 */

import { whileRunning } from '@/core/state/projectWorkRunning';
import { loadProjectsForList } from '@/features/projects-dashboard/services/loadProjectsForList';
import type { Project } from '@/types/base';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

function stateWith(paths: Array<string | null>) {
    const stateManager = createMockStateManager();
    stateManager.getAllProjects.mockResolvedValue(
        paths.map((p, i) => ({ name: `p${i}`, path: p ?? `/p/missing-${i}`, lastModified: new Date(0) })),
    );
    stateManager.loadProjectFromPath.mockImplementation(async (path: string) =>
        paths.includes(path) ? createMockProject({ name: path, path, status: 'stopped' }) : null,
    );
    return stateManager;
}

describe('loadProjectsForList', () => {
    it('loads each project read-only and drops one that will not load', async () => {
        const stateManager = stateWith(['/p/a', null]);

        const projects = await loadProjectsForList(stateManager);

        expect(projects.map((p: Project) => p.path)).toEqual(['/p/a']);
        expect(stateManager.loadProjectFromPath).toHaveBeenCalledWith('/p/a', undefined, {
            persistAfterLoad: false,
        });
        expect(stateManager.saveProject).not.toHaveBeenCalled();
    });

    it('shows a project whose creation is running as creating', async () => {
        const stateManager = stateWith(['/p/new']);

        const projects = await whileRunning('/p/new', 'creating', () => loadProjectsForList(stateManager));

        expect(projects.map((p: Project) => p.status)).toEqual(['creating']);
    });

    it('shows a project whose reset is running as resetting', async () => {
        // Found 2026-10-28: three cards resetting at once all still said "Needs reset".
        const stateManager = stateWith(['/p/bodea']);

        const projects = await whileRunning('/p/bodea', 'resetting', () => loadProjectsForList(stateManager));

        expect(projects.map((p: Project) => p.status)).toEqual(['resetting']);
    });

    it('never gives a reset a tile of its own', async () => {
        // Only a creation can run before its project file exists.
        const stateManager = stateWith(['/p/other']);

        const projects = await whileRunning('/p/gone', 'resetting', () => loadProjectsForList(stateManager));

        expect(projects.map((p: Project) => p.path)).toEqual(['/p/other']);
    });

    it('leaves a project alone once its creation is over', async () => {
        const stateManager = stateWith(['/p/done']);

        const projects = await loadProjectsForList(stateManager);

        expect(projects[0].status).toBe('stopped');
    });

    it('gives a running creation with no project file yet a tile of its own', async () => {
        // An Edge Delivery project has no file until its storefront is set up.
        const stateManager = stateWith(['/p/other']);

        const projects = await whileRunning('/projects/canary', 'creating', () => loadProjectsForList(stateManager));

        expect(projects).toHaveLength(2);
        expect(projects[1]).toMatchObject({ name: 'canary', path: '/projects/canary', status: 'creating' });
    });

    it('never lists a running creation twice once its file exists', async () => {
        const stateManager = stateWith(['/p/new']);

        const projects = await whileRunning('/p/new', 'creating', () => loadProjectsForList(stateManager));

        expect(projects).toHaveLength(1);
    });
});
