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
        adobe: { organization: '285361', projectId: 'proj-1', workspace },
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
    const PREVIOUS = { organization: '285361', projectId: 'proj-1', workspace: 'ws-stage' };

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
    const PREVIOUS = { organization: '285361', projectId: 'old-proj', workspace: 'ws-old-production' };
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
