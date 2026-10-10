/**
 * A destination move and the integrations that have a workspace of their own
 * (AB-23 slice 7).
 *
 * The project's destination is the PROJECT's workspace. An integration added since
 * AB-23 lives in a workspace of its own, which a change of the project's workspace
 * does not touch — so it is not redeployed, and its APIs are never subscribed on
 * the project's workspace, where nothing of it runs.
 */

import {
    mockDeployAppBuilderComponent,
    moveAppBuilderComponentsToDestination,
} from './appBuilderComponentMigration.testUtils';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { Project } from '@/types/base';
import { createDeps } from './appBuilderComponentRunner.testUtils';
import { createMockProject } from '../../../helpers/projectFake';

const OWN = { id: 'ws-erp', name: 'Northwind-ERP', title: 'Northwind ERP' };

const catalogEntry = (id: string, kind: AppBuilderComponentCatalogEntry['kind']) =>
    ({ id, name: id, kind, source: { owner: 'o', repo: id } }) as AppBuilderComponentCatalogEntry;

const CATALOG = [
    catalogEntry('eds-accs-mesh', 'mesh'),
    catalogEntry('erp-integration', 'integration'),
    catalogEntry('demo-erp', 'system'),
];

function bodea(workspace: string): Project {
    const instance = (id: string) => ({ id, name: id, path: `/p/components/${id}`, status: 'ready' as const });
    return createMockProject({
        adobe: { organization: '100000', projectId: 'proj-1', workspace },
        appBuilderComponents: {
            'eds-accs-mesh': { kind: 'mesh', status: 'deployed', source: { owner: '', repo: '' } },
            'erp-integration': { kind: 'integration', status: 'deployed', source: { owner: 'o', repo: 'r' }, workspace: OWN },
            'demo-erp': { kind: 'system', status: 'deployed', source: { owner: 'o', repo: 'r' }, workspace: OWN },
        },
        componentInstances: {
            'eds-accs-mesh': instance('eds-accs-mesh'),
            'erp-integration': instance('erp-integration'),
            'demo-erp': instance('demo-erp'),
        },
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockDeployAppBuilderComponent.mockResolvedValue({ success: true });
});

describe('a move to another workspace of the SAME Adobe project', () => {
    const PREVIOUS = { organization: '100000', projectId: 'proj-1', workspace: 'ws-stage' };

    it('redeploys what lives in the project workspace, and leaves an own workspace alone', async () => {
        const deps = createDeps({ catalog: CATALOG });

        const result = await moveAppBuilderComponentsToDestination(bodea('ws-production'), PREVIOUS, deps);

        expect(result).toEqual({ success: true, moved: ['eds-accs-mesh'], failed: [] });
        const deployed = mockDeployAppBuilderComponent.mock.calls.map(([, id]) => id);
        expect(deployed).toEqual(['eds-accs-mesh']);
    });

    it("never marks an own-workspace card as moving", async () => {
        const onRowStatus = jest.fn();

        await moveAppBuilderComponentsToDestination(
            bodea('ws-production'),
            PREVIOUS,
            createDeps({ catalog: CATALOG }),
            onRowStatus,
        );

        const touched = onRowStatus.mock.calls.map(([id]) => id);
        expect(touched).not.toContain('erp-integration');
        expect(touched).not.toContain('demo-erp');
    });

    it("subscribes the project workspace for its own components only", async () => {
        const deps = createDeps({ catalog: CATALOG });

        await moveAppBuilderComponentsToDestination(bodea('ws-production'), PREVIOUS, deps);

        const [entries] = (deps.subscribeRequiredApis as jest.Mock).mock.calls[0];
        expect((entries as AppBuilderComponentCatalogEntry[]).map((e) => e.id)).toEqual(['eds-accs-mesh']);
    });
});

// Owner decision 2026-09-21: into ANOTHER Adobe project, an own-workspace group is
// removed from the old one and added in the new one (componentRelocation), after
// everything in the project's workspace has moved.
describe('a move into a DIFFERENT Adobe project', () => {
    const PREVIOUS = { organization: '100000', projectId: 'old-proj', workspace: 'ws-old-production' };
    const MANAGED = CATALOG.map((entry) =>
        entry.id === 'erp-integration' ? { ...entry, lifecycle: 'app-management' as const } : entry,
    );

    function movedBodea(): Project {
        const project = bodea('ws-new-production');
        project.adobe = { ...project.adobe!, projectId: 'new-proj' };
        return project;
    }

    it('moves the project workspace first, then the pair, ERP before integration', async () => {
        const project = movedBodea();

        const result = await moveAppBuilderComponentsToDestination(project, PREVIOUS, createDeps({ catalog: CATALOG }));

        expect(result).toEqual({
            success: true,
            moved: ['eds-accs-mesh', 'demo-erp', 'erp-integration'],
            failed: [],
        });
        expect(mockDeployAppBuilderComponent.mock.calls.map(([, id]) => id)).toEqual([
            'eds-accs-mesh',
            'demo-erp',
            'erp-integration',
        ]);
    });

    it('rolls the whole move back when the pair cannot be cleaned up in the old project', async () => {
        const project = movedBodea();
        const deps = createDeps({
            catalog: MANAGED,
            uninstallAppManagement: jest.fn().mockResolvedValue({ status: 'failed', detail: '503' }),
        });

        const result = await moveAppBuilderComponentsToDestination(project, PREVIOUS, deps);

        expect(result).toMatchObject({ success: false, rolledBack: true, moved: ['eds-accs-mesh'] });
        expect(result.failed[0]).toMatchObject({ id: 'erp-integration' });
        expect(project.adobe).toEqual(PREVIOUS);
        expect(deps.deleteComponentWorkspace).not.toHaveBeenCalled();
    });

    it('does not roll back once the old side is gone — the card carries the failure', async () => {
        const project = movedBodea();
        mockDeployAppBuilderComponent.mockImplementation(async (_p: Project, id: string) =>
            id === 'erp-integration' ? { success: false, error: 'boom' } : { success: true },
        );
        const onRowStatus = jest.fn();

        const result = await moveAppBuilderComponentsToDestination(
            project,
            PREVIOUS,
            createDeps({ catalog: CATALOG }),
            onRowStatus,
        );

        expect(result).toEqual({
            success: false,
            moved: ['eds-accs-mesh', 'demo-erp'],
            failed: [{ id: 'erp-integration', error: 'boom' }],
            rolledBack: false,
        });
        expect(project.adobe?.projectId).toBe('new-proj');
        expect(onRowStatus).toHaveBeenCalledWith('erp-integration', 'error', 'boom');
    });
});

describe('a move into a DIFFERENT Adobe project — what the own-workspace cards are told', () => {
    const PREVIOUS = { organization: '100000', projectId: 'old-proj', workspace: 'ws-old-production' };

    function movedBodea(): Project {
        const project = bodea('ws-new-production');
        project.adobe = { ...project.adobe!, projectId: 'new-proj' };
        return project;
    }

    // The pair is in flight from the moment the move starts, although its turn
    // comes last: a card still reading Deployed through the whole project-workspace
    // half is the "grid looks idle" report the up-front marking exists to end.
    it('marks the pair as moving up front, before the subscribe, and settles each as it lands', async () => {
        const events: string[] = [];
        const deps = createDeps({
            catalog: CATALOG,
            subscribeRequiredApis: jest.fn(async () => {
                events.push('subscribe');
            }),
        });

        await moveAppBuilderComponentsToDestination(movedBodea(), PREVIOUS, deps, (id, status, message) => {
            events.push([id, status, message].filter(Boolean).join(' | '));
        });

        expect(events.slice(0, events.indexOf('subscribe'))).toStrictEqual([
            'eds-accs-mesh | deploying | Deploying Mesh',
            'demo-erp | deploying | Deploying Integration',
            'erp-integration | deploying | Deploying Integration',
        ]);
        expect(events).toContain('demo-erp | deployed');
        expect(events).toContain('erp-integration | deployed');
    });

    // Nothing in the project's workspace is not "nothing to move": the pair still
    // belongs to the Adobe project being left.
    it('moves a project whose ONLY components have a workspace of their own', async () => {
        const project = movedBodea();
        delete project.appBuilderComponents!['eds-accs-mesh'];

        const result = await moveAppBuilderComponentsToDestination(project, PREVIOUS, createDeps({ catalog: CATALOG }));

        expect(result).toStrictEqual({ success: true, moved: ['demo-erp', 'erp-integration'], failed: [] });
        expect(mockDeployAppBuilderComponent.mock.calls.map(([, id]) => id)).toStrictEqual([
            'demo-erp',
            'erp-integration',
        ]);
    });
});

/**
 * Two groups, each in a workspace of its own. Once ANY group's old side is gone the
 * move cannot be rolled back — pointing the project at the old Adobe project would
 * strand what already left it — so a later group that fails is reported, not undone.
 */
describe('a move into a DIFFERENT Adobe project — two own-workspace groups', () => {
    const PREVIOUS = { organization: '100000', projectId: 'old-proj', workspace: 'ws-old-production' };
    const TWO = [catalogEntry('erp-a', 'integration'), catalogEntry('erp-b', 'integration')];

    function twoGroups(): Project {
        const state = (workspace: string) => ({
            kind: 'integration' as const,
            status: 'deployed' as const,
            source: { owner: 'o', repo: 'r' },
            workspace: { id: workspace, name: workspace, title: workspace },
        });
        return createMockProject({
            adobe: { organization: '100000', projectId: 'new-proj', workspace: 'ws-new-production' },
            appBuilderComponents: { 'erp-a': state('ws-a'), 'erp-b': state('ws-b') },
            componentInstances: {},
        });
    }

    /** The second group cannot get a workspace in the new Adobe project: nothing of it has left the old one. */
    const secondGroupCannotStart = () =>
        jest.fn(async (_project: Project, entry: AppBuilderComponentCatalogEntry) =>
            entry.id === 'erp-b' ? { error: 'workspace quota reached' } : undefined,
        );

    it('does not roll back when a later group cannot start after an earlier one moved', async () => {
        const project = twoGroups();
        const deps = createDeps({ catalog: TWO, createComponentWorkspace: secondGroupCannotStart() });

        const result = await moveAppBuilderComponentsToDestination(project, PREVIOUS, deps);

        expect(result).toStrictEqual({
            success: false,
            moved: ['erp-a'],
            failed: [{ id: 'erp-b', error: 'Nothing of it was moved: workspace quota reached' }],
            rolledBack: false,
        });
        expect(project.adobe?.projectId).toBe('new-proj');
    });

    it('does not roll back when a later group cannot start after an earlier one left and then failed', async () => {
        const project = twoGroups();
        mockDeployAppBuilderComponent.mockImplementation(async (_p: Project, id: string) =>
            id === 'erp-a' ? { success: false, error: 'boom' } : { success: true },
        );
        const deps = createDeps({ catalog: TWO, createComponentWorkspace: secondGroupCannotStart() });

        const result = await moveAppBuilderComponentsToDestination(project, PREVIOUS, deps);

        expect(result).toStrictEqual({
            success: false,
            moved: [],
            failed: [
                { id: 'erp-a', error: 'boom' },
                { id: 'erp-b', error: 'Nothing of it was moved: workspace quota reached' },
            ],
            rolledBack: false,
        });
        expect(project.adobe?.projectId).toBe('new-proj');
    });

    it('control: the FIRST group failing to start rolls the whole move back', async () => {
        const project = twoGroups();
        const deps = createDeps({
            catalog: TWO,
            createComponentWorkspace: jest.fn(async () => ({ error: 'workspace quota reached' })),
        });

        const result = await moveAppBuilderComponentsToDestination(project, PREVIOUS, deps);

        expect(result).toMatchObject({ success: false, moved: [], rolledBack: true });
        expect(project.adobe).toStrictEqual(PREVIOUS);
    });
});

describe('the subscribe before a move', () => {
    const PREVIOUS = { organization: '100000', projectId: 'proj-1', workspace: 'ws-stage' };

    // The stack's mesh counts towards the union whether or not the project has
    // deployed one, so the entries can name a component the project holds no
    // record for. That is an entry on the project's workspace, not a crash.
    it('includes a catalog mesh the project holds no record for', async () => {
        const project = createMockProject({
            adobe: { organization: '100000', projectId: 'proj-1', workspace: 'ws-production' },
            appBuilderComponents: {
                'erp-sync': { kind: 'integration', status: 'deployed', source: { owner: 'o', repo: 'r' } },
            },
            componentInstances: {},
        });
        const deps = createDeps({
            catalog: [catalogEntry('eds-accs-mesh', 'mesh'), catalogEntry('erp-sync', 'integration')],
        });

        await moveAppBuilderComponentsToDestination(project, PREVIOUS, deps);

        const [entries, subscribedFor] = (deps.subscribeRequiredApis as jest.Mock).mock.calls[0];
        expect((entries as AppBuilderComponentCatalogEntry[]).map((e) => e.id)).toStrictEqual([
            'eds-accs-mesh',
            'erp-sync',
        ]);
        expect(subscribedFor).toBe(project);
    });

    // A project whose destination was cleared has nothing to compare the previous
    // one against: that is a different destination, never a reason to throw.
    it('moves a project that names no destination rather than failing on the comparison', async () => {
        const project = createMockProject({
            appBuilderComponents: {
                'erp-sync': { kind: 'integration', status: 'deployed', source: { owner: 'o', repo: 'r' } },
            },
            componentInstances: {},
        });
        delete project.adobe;

        const result = await moveAppBuilderComponentsToDestination(
            project,
            PREVIOUS,
            createDeps({ catalog: [catalogEntry('erp-sync', 'integration')] }),
        );

        expect(result).toStrictEqual({ success: true, moved: ['erp-sync'], failed: [] });
    });
});
