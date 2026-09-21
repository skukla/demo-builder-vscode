/**
 * Which workspaces a removal releases (AB-23 slice 3).
 *
 * Removal is the reversal the add earns: create a workspace on add, delete it on
 * remove, and the project returns to what it was.
 *
 * The whole difficulty is that a bound pair SHARES a workspace. Releasing it when
 * the first of the pair goes would take the partner's Runtime namespace, its code
 * and its database with it — and the partner would go on reading as deployed,
 * because its own record still says so. So the question is asked of the project as
 * it stands AFTER the removal, not of the component being removed.
 */

import {
    workspacesHeldBy,
    workspacesToRelease,
} from '@/core/state/appBuilderComponentState';
import type { AppBuilderComponentState, Project } from '@/types/base';
import { makeAppBuilderComponent } from './appBuilderComponentState.testUtils';
import { createMockProject } from '../../helpers/projectFake';

const PAIR_WS = { id: 'ws-pair', name: 'NorthwindErpq3k9' };
const OTHER_WS = { id: 'ws-other', name: 'StarterKitb2x9' };

function component(
    workspace?: AppBuilderComponentState['workspace'],
): AppBuilderComponentState {
    return makeAppBuilderComponent({
        kind: 'integration',
        ...(workspace ? { workspace } : {}),
    });
}

function projectWith(components: Project['appBuilderComponents']): Project {
    return createMockProject({
        adobe: { organization: 'org-1', projectId: 'proj-1', workspace: 'ws-project' },
        appBuilderComponents: components,
    });
}

describe('workspacesHeldBy', () => {
    it('reads the workspaces of the named components, skipping those without one', () => {
        const project = projectWith({
            'erp-integration': component(PAIR_WS),
            'demo-erp': component(PAIR_WS),
            'legacy-thing': component(),
        });

        expect(
            workspacesHeldBy(project, ['erp-integration', 'demo-erp', 'legacy-thing', 'absent']),
        ).toEqual([PAIR_WS, PAIR_WS]);
    });
});

describe('workspacesToRelease', () => {
    it('releases a workspace nothing remaining records', () => {
        const remaining = projectWith({ 'starter-kit': component(OTHER_WS) });

        expect(workspacesToRelease([PAIR_WS], remaining)).toEqual([PAIR_WS]);
    });

    // The failure this exists to prevent: the partner keeps the workspace AND keeps
    // reading as deployed, so deleting it makes a live integration silently dead.
    it('does NOT release one a remaining component still records', () => {
        const remaining = projectWith({ 'demo-erp': component(PAIR_WS) });

        expect(workspacesToRelease([PAIR_WS], remaining)).toStrictEqual([]);
    });

    it('releases a shared workspace ONCE when both holders go together', () => {
        const remaining = projectWith({ 'starter-kit': component(OTHER_WS) });

        // A pair removal hands the same workspace in twice — once per component.
        expect(workspacesToRelease([PAIR_WS, PAIR_WS], remaining)).toEqual([PAIR_WS]);
    });

    it('releases nothing when the removed component held no workspace', () => {
        const remaining = projectWith({ 'starter-kit': component(OTHER_WS) });

        expect(workspacesToRelease([], remaining)).toStrictEqual([]);
    });

    it('CONTROL: an empty project releases everything it was handed', () => {
        expect(workspacesToRelease([PAIR_WS, OTHER_WS], projectWith({}))).toEqual([
            PAIR_WS,
            OTHER_WS,
        ]);
    });
});
