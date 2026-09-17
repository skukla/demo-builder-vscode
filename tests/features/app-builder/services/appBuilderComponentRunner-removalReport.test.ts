/**
 * Deploy-contract runner — a removal's clean-ups (linked cards plan, step 4).
 * The clean-ups only the deployed code can do run before anything is
 * undeployed: a failure stops the removal with nothing removed, unless the SC
 * removes anyway, which reports what stays behind. Also: the ERP's records are
 * wiped, a system's leftover Runtime package is reported with its
 * integration's, and a missing local instance does not stop the removal.
 */

import { mockWithOrgContext } from './appBuilderComponentRunner.orgContextMock';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState, ComponentInstance } from '@/types/base';

jest.setTimeout(5000);

jest.mock('@/features/app-builder/services/appConfigPackages', () => ({
    listDeclaredPackageNames: jest.fn().mockResolvedValue([]),
    detectAppLayout: jest.fn().mockResolvedValue('extension'),
}));

import { createDeps, createProject } from './appBuilderComponentRunner.testUtils';
import { removeAppBuilderComponent } from '@/features/app-builder/services/appBuilderComponentRunner';
import { createSuccessResult } from '../../../helpers/commandResultFake';

const SYSTEM: AppBuilderComponentCatalogEntry = {
    id: 'demo-erp',
    name: 'ERP',
    description: 'the ERP',
    kind: 'system',
    boundTo: 'erp-integration',
    wipe: { action: 'admin', path: 'wipe' },
    source: { owner: 'skukla', repo: 'demo-erp', branch: 'main' },
};

const INTEGRATION: AppBuilderComponentCatalogEntry = {
    id: 'erp-integration',
    name: 'ERP integration',
    description: 'the integration',
    kind: 'integration',
    layout: 'extension',
    lifecycle: 'app-management',
    source: { owner: 'skukla', repo: 'commerce-erp-integration', branch: 'main' },
};

function instance(id: string): ComponentInstance {
    return { id, name: id, type: 'app-builder', status: 'ready', path: `/proj/components/${id}` };
}

function state(kind: AppBuilderComponentState['kind'], name: string): AppBuilderComponentState {
    return { kind, name, status: 'deployed', source: { owner: 'skukla', repo: 'x' } };
}

function pairedProject() {
    return createProject({
        componentInstances: { 'erp-integration': instance('erp-integration'), 'demo-erp': instance('demo-erp') },
        appBuilderComponents: {
            'erp-integration': { ...state('integration', 'ERP integration'), systems: ['demo-erp'] },
            'demo-erp': { ...state('system', 'Nordwind'), usedBy: 'erp-integration' },
        },
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockWithOrgContext.mockImplementation((_target: unknown, fn: () => Promise<unknown>) => fn());
});

const failedUninstall = () => jest.fn(async () => ({ status: 'failed' as const, detail: 'timed out' }));

function undeployCount(deps: ReturnType<typeof createDeps>): number {
    return deps.commandManager.execute.mock.calls.filter((call) => String(call[0]) === 'aio app undeploy').length;
}

describe('a clean-up that does not finish', () => {
    it('stops the removal with nothing undeployed, says why, and records it on the component asked', async () => {
        const project = pairedProject();
        const deps = createDeps({ catalog: [SYSTEM, INTEGRATION], uninstallAppManagement: failedUninstall() });

        const result = await removeAppBuilderComponent(project, 'erp-integration', deps);

        const error =
            'Nothing was removed. ERP integration could not be uninstalled from Commerce (timed out); ' +
            'removing anyway leaves its webhooks and event subscriptions in Commerce. ' +
            'Remove again to retry, or remove anyway.';
        expect(result).toEqual({ success: false, error, code: 'COMPONENT_REMOVAL_STOPPED' });
        expect(undeployCount(deps)).toBe(0);
        expect(Object.keys(project.appBuilderComponents ?? {})).toEqual(['erp-integration', 'demo-erp']);
        expect(project.appBuilderComponents?.['erp-integration']?.removalStopped).toBe(error);
        expect(deps.saveProject).toHaveBeenLastCalledWith(project);
    });

    it('a thrown uninstall stops it the same way', async () => {
        const deps = createDeps({
            catalog: [SYSTEM, INTEGRATION],
            uninstallAppManagement: jest.fn(async () => {
                throw new Error('socket hang up');
            }),
        });

        const result = await removeAppBuilderComponent(pairedProject(), 'erp-integration', deps);

        expect(result.error).toContain('(socket hang up)');
    });

    it('removing anyway goes ahead, removes both, and says what stays behind', async () => {
        const project = pairedProject();
        const deps = createDeps({ catalog: [SYSTEM, INTEGRATION], uninstallAppManagement: failedUninstall() });

        const result = await removeAppBuilderComponent(project, 'erp-integration', deps, { force: true });

        expect(result.success).toBe(true);
        expect(result.warnings).toEqual([
            'ERP integration could not be uninstalled from Commerce (timed out); ' +
                'its webhooks and event subscriptions in Commerce stay behind.',
        ]);
        expect(undeployCount(deps)).toBe(2);
        expect(project.appBuilderComponents).toStrictEqual({});
    });

    it('finished clean-ups add no warning', async () => {
        const deps = createDeps({
            catalog: [SYSTEM, INTEGRATION],
            uninstallAppManagement: jest.fn(async () => ({ status: 'uninstalled' as const })),
            wipeSystemRecords: jest.fn(async () => ({ status: 'wiped' as const })),
        });

        const result = await removeAppBuilderComponent(pairedProject(), 'erp-integration', deps);

        expect(result).toMatchObject({ success: true });
        expect(result).not.toHaveProperty('warnings');
    });
});

describe("the ERP's records", () => {
    it('are wiped once, before anything is undeployed, with the ERP entry, its URLs and its name', async () => {
        const project = pairedProject();
        const order: string[] = [];
        const wipeSystemRecords = jest.fn(async () => {
            order.push('wipe');
            return { status: 'wiped' as const };
        });
        const deps = createDeps({ catalog: [SYSTEM, INTEGRATION], wipeSystemRecords });
        deps.commandManager.execute.mockImplementation(async (command: string) => {
            if (command === 'aio app undeploy') order.push('undeploy');
            return createSuccessResult();
        });

        await removeAppBuilderComponent(project, 'erp-integration', deps);

        expect(order).toEqual(['wipe', 'undeploy', 'undeploy']);
        expect(wipeSystemRecords).toHaveBeenCalledWith(project, SYSTEM, undefined, 'Nordwind');
    });

    it('a failed wipe stops the pair before the integration is undeployed', async () => {
        const project = pairedProject();
        const deps = createDeps({
            catalog: [SYSTEM, INTEGRATION],
            wipeSystemRecords: jest.fn(async () => ({ status: 'failed' as const, detail: '401: unauthorized' })),
        });

        const result = await removeAppBuilderComponent(project, 'demo-erp', deps);

        expect(result.code).toBe('COMPONENT_REMOVAL_STOPPED');
        expect(result.error).toContain("Nordwind's records could not be deleted (401: unauthorized)");
        expect(undeployCount(deps)).toBe(0);
        // The removal was asked of the ERP and ran as the integration's.
        expect(project.appBuilderComponents?.['erp-integration']?.removalStopped).toBe(result.error);
    });

    it('an ERP whose integration is gone wipes on its own removal', async () => {
        const project = pairedProject();
        delete project.appBuilderComponents?.['erp-integration'];
        const wipeSystemRecords = jest.fn(async () => ({ status: 'wiped' as const }));
        const deps = createDeps({ catalog: [SYSTEM, INTEGRATION], wipeSystemRecords });

        const result = await removeAppBuilderComponent(project, 'demo-erp', deps);

        expect(result.success).toBe(true);
        expect(wipeSystemRecords).toHaveBeenCalledTimes(1);
    });
});

describe('the system removed after its integration', () => {
    it('a system that fails is named in the result, and the integration stays removed', async () => {
        const project = pairedProject();
        const deps = createDeps({ catalog: [SYSTEM, INTEGRATION] });
        deps.saveProject.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('disk full'));

        const result = await removeAppBuilderComponent(project, 'erp-integration', deps);

        expect(result.success).toBe(true);
        expect(result.warnings).toEqual([
            'Nordwind was not removed: it stopped partway, and the Debug Logs say why. Remove it from its card.',
        ]);
        expect(project.appBuilderComponents).not.toHaveProperty('erp-integration');
    });

    it("a system's leftover Runtime package is reported with the integration's", async () => {
        const deps = createDeps({ catalog: [SYSTEM, INTEGRATION] });
        deps.commandManager.execute.mockImplementation(async (command: string) => {
            if (command === 'aio runtime package list --json') {
                return createSuccessResult(JSON.stringify([{ name: 'demo-erp' }]));
            }
            if (command.startsWith('aio runtime package delete demo-erp')) {
                throw new Error('forbidden');
            }
            return createSuccessResult();
        });

        const result = await removeAppBuilderComponent(pairedProject(), 'erp-integration', deps);

        expect(result.runtimeCleanup).toEqual({ verified: true, deleted: [], failed: ['demo-erp'] });
    });
});

describe('a component whose local instance is already gone', () => {
    it('is still cleared from the project, with its system', async () => {
        const project = pairedProject();
        const deps = createDeps({ catalog: [SYSTEM, INTEGRATION] });
        deps.componentManager.removeComponent.mockRejectedValue(new Error('Component erp-integration not found'));

        const result = await removeAppBuilderComponent(project, 'erp-integration', deps);

        expect(result.success).toBe(true);
        expect(project.appBuilderComponents).toStrictEqual({});
    });
});
