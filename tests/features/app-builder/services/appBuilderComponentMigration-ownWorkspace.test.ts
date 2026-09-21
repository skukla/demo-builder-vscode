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
