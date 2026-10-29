/**
 * updateSelectionsByProject — an update check read project by project: which projects it
 * touches, one project's entries, and the order the Updates modal lists them in.
 */

import { edsProject, emptySelections } from './updateApplyService.testUtils';
import type { UpdateSelections } from '@/features/updates/services/updateSelections';
import { inOrder, projectsOf, selectionsWhere } from '@/features/updates/services/updateSelectionsByProject';

const a = edsProject({ name: 'a', path: '/p/a' });
const b = edsProject({ name: 'b', path: '/p/b' });

function check(): UpdateSelections {
    return {
        ...emptySelections(),
        forkSync: [{ owner: 'me', repo: 'tpl', branch: 'main' }],
        template: [{ project: b }],
        component: [{ project: a, componentId: 'c', latestVersion: '2' }],
        inspector: [{ project: b, latestCommit: 'x' }],
    };
}

describe('projectsOf', () => {
    it('names each project once, in the order its first entry applies', () => {
        expect(projectsOf(check()).map((p) => p.path)).toEqual(['/p/b', '/p/a']);
    });
});

describe('selectionsWhere', () => {
    it("keeps only the projects asked for, and the template repositories, which are no project's", () => {
        const only = selectionsWhere(check(), (p) => p.path === '/p/b');

        expect(only.template).toHaveLength(1);
        expect(only.inspector).toHaveLength(1);
        expect(only.component).toStrictEqual([]);
        expect(only.forkSync).toHaveLength(1);
    });
});

describe('inOrder', () => {
    it('puts the projects it names first, as named, and the rest after as they were', () => {
        const c = edsProject({ name: 'c', path: '/p/c' });

        expect(inOrder([a, b, c], ['/p/c', 'forks', '/p/a']).map((p) => p.path)).toEqual(['/p/c', '/p/a', '/p/b']);
    });

    it('leaves them as they were with no order', () => {
        expect(inOrder([b, a], undefined)).toEqual([b, a]);
    });
});
