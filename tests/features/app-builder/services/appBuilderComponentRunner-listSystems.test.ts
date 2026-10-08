/**
 * The runner sends an integration its list of systems after a deploy (AB-51): after the
 * integration itself deploys (its fill, next, asks by those ids) and after a listed
 * system redeploys (its id or address may be new). A list that could not be sent is a
 * warning on the deploy, never a failure.
 *
 * Without it, a first pair served the standalone id `erp` while its ERP deployed as
 * `northwind`, and the fill could not find the ERP it had just deployed.
 */

import { mockWithOrgContext } from './appBuilderComponentRunner.orgContextMock';
import './appBuilderComponentRunner.runtimeMock';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppDeploymentResult } from '@/features/app-builder/services/types';
import type { AppBuilderComponentState, ComponentInstance } from '@/types/base';

jest.setTimeout(5000);

jest.mock('@/features/app-builder/services/appConfigPackages', () => ({
    listDeclaredPackageNames: jest.fn().mockResolvedValue([]),
    listDeclaredTriggersAndRules: jest.fn().mockResolvedValue({ triggers: [], rules: [] }),
    detectAppLayout: jest.fn(async (path: string) =>
        path.includes('demo-erp') ? 'standalone' : 'extension'
    ),
}));

import { createDeps, createProject } from './appBuilderComponentRunner.testUtils';
import { addAppBuilderComponent } from '@/features/app-builder/services/appBuilderAddRun';
import { deployAppBuilderComponent } from '@/features/app-builder/services/appBuilderRedeployRun';

const SYSTEM: AppBuilderComponentCatalogEntry = {
    id: 'demo-erp',
    name: 'ERP',
    description: 'the ERP',
    kind: 'system',
    boundTo: 'erp-integration',
    listedAs: { envVar: 'ERP_ID', adapter: 'demo-erp' },
    providesEnvVars: ['ERP_BASE_URL'],
    source: { owner: 'skukla', repo: 'demo-erp', branch: 'main' },
};

const INTEGRATION: AppBuilderComponentCatalogEntry = {
    id: 'erp-integration',
    name: 'ERP integration',
    description: 'the integration',
    kind: 'integration',
    layout: 'extension',
    envSchema: [
        { name: 'ERP_BASE_URL', type: 'text', label: 'ERP address', providedBy: 'demo-erp' },
    ],
    source: { owner: 'skukla', repo: 'commerce-erp-integration', branch: 'main' },
};

const ERP_URL = 'https://ns.adobeioruntime.net/api/v1/web/demo-erp/health';

function deploy() {
    return jest.fn(async (componentPath: string): Promise<AppDeploymentResult> => {
        if (componentPath.includes('demo-erp')) {
            return {
                success: true,
                data: { url: ERP_URL, deployedUrls: { 'runtime/demo-erp/health': ERP_URL } },
            };
        }
        return { success: true, data: { url: 'https://x/erp/status', deployedUrls: {} } };
    });
}

function state(
    kind: AppBuilderComponentState['kind'],
    extra: Partial<AppBuilderComponentState> = {}
) {
    return { kind, status: 'deployed' as const, source: { owner: 'skukla', repo: 'x' }, ...extra };
}

function instance(id: string): ComponentInstance {
    return { id, name: id, type: 'app-builder', status: 'ready', path: `/proj/components/${id}` };
}

/** A project holding the pair, linked, as an add leaves it. */
function pairProject() {
    return createProject({
        componentInstances: {
            'erp-integration': instance('erp-integration'),
            'demo-erp': instance('demo-erp'),
        },
        appBuilderComponents: {
            'erp-integration': state('integration', { systems: ['demo-erp'], deployedUrls: {} }),
            'demo-erp': state('system', {
                usedBy: 'erp-integration',
                name: 'Northwind ERP',
                listId: 'northwind',
                deployedUrls: { 'runtime/demo-erp/health': ERP_URL },
                providesEnvVars: {
                    ERP_BASE_URL: 'https://ns.adobeioruntime.net/api/v1/web/demo-erp',
                },
            }),
        },
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockWithOrgContext.mockImplementation((_target: unknown, fn: () => Promise<unknown>) => fn());
});

describe('the integration is told its systems after a deploy', () => {
    it('when the pair is added: after the integration deploys, with the recorded ids', async () => {
        const project = createProject();
        const listSystems = jest.fn(async () => undefined);
        const deps = createDeps({
            deployApp: deploy(),
            catalog: [SYSTEM, INTEGRATION],
            listSystems,
        });

        const result = await addAppBuilderComponent(project, INTEGRATION, deps);

        expect(result).toEqual({ success: true });
        expect(listSystems).toHaveBeenCalledTimes(1);
        expect(listSystems).toHaveBeenCalledWith(project, 'erp-integration');
        // The ERP's id was recorded before the list went: what the list carries is what
        // the ERP deployed with.
        expect(project.appBuilderComponents?.['demo-erp']?.listId).toBe('erp');
    });

    it('when a listed ERP redeploys: its integration, by the stored link', async () => {
        const project = pairProject();
        const listSystems = jest.fn(async () => undefined);
        const deps = createDeps({
            deployApp: deploy(),
            catalog: [SYSTEM, INTEGRATION],
            listSystems,
        });

        const result = await deployAppBuilderComponent(project, 'demo-erp', deps);

        expect(result).toEqual({ success: true });
        expect(listSystems).toHaveBeenCalledWith(project, 'erp-integration');
        // A redeploy never re-derives the id.
        expect(project.appBuilderComponents?.['demo-erp']?.listId).toBe('northwind');
    });

    it('a list that could not be sent is a warning on a deploy that stands', async () => {
        const project = pairProject();
        const listSystems = jest.fn(async () => 'Adobe sign-in required.');
        const deps = createDeps({
            deployApp: deploy(),
            catalog: [SYSTEM, INTEGRATION],
            listSystems,
        });

        const result = await deployAppBuilderComponent(project, 'demo-erp', deps);

        expect(result.success).toBe(true);
        expect(result.warnings).toEqual([
            'erp-integration was not told about its ERPs (Adobe sign-in required). Redeploy it to send the list again.',
        ]);
    });

    it('is not asked for an integration that lists nothing', async () => {
        const project = createProject();
        const listSystems = jest.fn(async () => undefined);
        const deps = createDeps({ deployApp: deploy(), catalog: [INTEGRATION], listSystems });

        await addAppBuilderComponent(project, { ...INTEGRATION, envSchema: [] }, deps);

        expect(listSystems).not.toHaveBeenCalled();
    });
});
