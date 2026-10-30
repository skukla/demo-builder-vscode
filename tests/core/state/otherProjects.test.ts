/**
 * Every local project but one, read the way the projects list reads them, never saved back.
 */

import { loadOtherProjects } from '@/core/state/otherProjects';
import { createMockProject } from '../../helpers/projectFake';
import { createMockStateManager } from '../../helpers/stateManagerFake';

const A = createMockProject({ name: 'a', path: '/nonexistent/projects/a' });
const B = createMockProject({ name: 'b', path: '/nonexistent/projects/b' });
const when = new Date('2026-10-30T10:00:00.000Z');

function source() {
    const stateManager = createMockStateManager({
        getAllProjects: jest.fn().mockResolvedValue([
            { name: 'a', path: A.path, lastModified: when },
            { name: 'b', path: B.path, lastModified: when },
            { name: 'broken', path: '/nonexistent/projects/broken', lastModified: when },
        ]),
        loadProjectFromPath: jest.fn(async (projectPath: string) => [A, B].find((p) => p.path === projectPath) ?? null),
    });
    return { stateManager };
}

describe('loadOtherProjects', () => {
    it('loads every project but the one left out, saving none, and skips one that does not load', async () => {
        const made = source();

        expect(await loadOtherProjects(made, A.path)).toEqual([B]);
        expect(made.stateManager.loadProjectFromPath.mock.calls).toEqual([
            [B.path, undefined, { persistAfterLoad: false }],
            ['/nonexistent/projects/broken', undefined, { persistAfterLoad: false }],
        ]);
    });

    it('loads them all when none is left out', async () => {
        expect(await loadOtherProjects(source(), undefined)).toEqual([A, B]);
    });
});
