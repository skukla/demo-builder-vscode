/**
 * loadProjectsForList — the one load both projects-list paths share (PL-82).
 */

import { whileCreating } from '@/core/state/creationsRunning';
import { loadProjectsForList } from '@/features/projects-dashboard/services/loadProjectsForList';
import type { Project, ProjectStatus } from '@/types/base';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

function stateWith(projects: Array<{ path: string; status: ProjectStatus } | null>) {
    const stateManager = createMockStateManager();
    stateManager.getAllProjects.mockResolvedValue(
        projects.map((p, i) => ({ name: `p${i}`, path: p?.path ?? `/p/missing-${i}`, lastModified: new Date(0) })),
    );
    stateManager.loadProjectFromPath.mockImplementation(async (path: string) => {
        const found = projects.find((p) => p?.path === path);
        return found ? createMockProject({ name: path, path, status: found.status }) : null;
    });
    return stateManager;
}

describe('loadProjectsForList', () => {
    it('loads each project read-only and drops one that will not load', async () => {
        const stateManager = stateWith([{ path: '/p/a', status: 'ready' }, null]);

        const projects = await loadProjectsForList(stateManager);

        expect(projects.map((p: Project) => p.path)).toEqual(['/p/a']);
        expect(stateManager.loadProjectFromPath).toHaveBeenCalledWith('/p/a', undefined, {
            persistAfterLoad: false,
        });
    });

    it('keeps a project whose creation is running as creating', async () => {
        const stateManager = stateWith([{ path: '/p/new', status: 'creating' }]);

        const projects = await whileCreating('/p/new', () => loadProjectsForList(stateManager));

        expect(projects[0].status).toBe('creating');
    });

    it('shows a creating project whose creation is not running as error', async () => {
        // Failed, or cut off by a closed window: it is not being created any more.
        const stateManager = stateWith([{ path: '/p/dead', status: 'creating' }]);

        const projects = await loadProjectsForList(stateManager);

        expect(projects[0].status).toBe('error');
        expect(stateManager.saveProject).not.toHaveBeenCalled();
    });

    it('leaves every other status alone', async () => {
        const stateManager = stateWith([
            { path: '/p/r', status: 'running' },
            { path: '/p/s', status: 'resetting' },
        ]);

        const projects = await loadProjectsForList(stateManager);

        expect(projects.map((p: Project) => p.status)).toEqual(['running', 'resetting']);
    });
});
