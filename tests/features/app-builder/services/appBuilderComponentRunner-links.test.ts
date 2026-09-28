/**
 * Deploy-contract runner — the stored link between an integration and the
 * systems it uses (linked cards plan, step 1). Adding the pair writes it;
 * removing follows it rather than the catalog.
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
    detectAppLayout: jest.fn(async (path: string) => (path.includes('demo-erp') ? 'standalone' : 'extension')),
}));

import { createDeps, createProject } from './appBuilderComponentRunner.testUtils';
import {
    addAppBuilderComponent,
    removeAppBuilderComponent,
} from '@/features/app-builder/services/appBuilderComponentRunner';

const SYSTEM: AppBuilderComponentCatalogEntry = {
    id: 'demo-erp',
    name: 'ERP',
    description: 'the ERP',
    kind: 'system',
    boundTo: 'erp-integration',
    providesEnvVars: ['ERP_BASE_URL'],
    source: { owner: 'skukla', repo: 'demo-erp', branch: 'main' },
};

const INTEGRATION: AppBuilderComponentCatalogEntry = {
    id: 'erp-integration',
    name: 'ERP integration',
    description: 'the integration',
    kind: 'integration',
    layout: 'extension',
    envSchema: [{ name: 'ERP_BASE_URL', type: 'text', label: 'ERP address', providedBy: 'demo-erp' }],
    source: { owner: 'skukla', repo: 'commerce-erp-integration', branch: 'main' },
};

const ERP_URL = 'https://ns.adobeioruntime.net/api/v1/web/demo-erp/health';

function deploy(integrationSucceeds = true) {
    return jest.fn(async (componentPath: string): Promise<AppDeploymentResult> => {
        if (componentPath.includes('demo-erp')) {
            return { success: true, data: { url: ERP_URL, deployedUrls: { 'runtime/demo-erp/health': ERP_URL } } };
        }
        return integrationSucceeds
            ? { success: true, data: { url: 'https://x/erp/status', deployedUrls: {} } }
            : { success: false, error: 'aio app deploy failed' };
    });
}

function state(kind: AppBuilderComponentState['kind'], extra: Partial<AppBuilderComponentState> = {}) {
    return { kind, status: 'deployed' as const, source: { owner: 'skukla', repo: 'x' }, ...extra };
}

function instance(id: string): ComponentInstance {
    return { id, name: id, type: 'app-builder', status: 'ready', path: `/proj/components/${id}` };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockWithOrgContext.mockImplementation((_target: unknown, fn: () => Promise<unknown>) => fn());
});

describe('adding the pair stores the link', () => {
    it('on both records, and saves it', async () => {
        const project = createProject();
        const deps = createDeps({ deployApp: deploy(), catalog: [SYSTEM, INTEGRATION] });

        await addAppBuilderComponent(project, INTEGRATION, deps);

        expect(project.appBuilderComponents?.['erp-integration']?.systems).toEqual(['demo-erp']);
        expect(project.appBuilderComponents?.['demo-erp']?.usedBy).toBe('erp-integration');
        expect(deps.saveProject).toHaveBeenLastCalledWith(
            expect.objectContaining({
                appBuilderComponents: expect.objectContaining({
                    'erp-integration': expect.objectContaining({ systems: ['demo-erp'] }),
                }),
            }),
        );
    });

    it('also when the integration fails to deploy, so its removal still takes the ERP', async () => {
        const project = createProject();
        const deps = createDeps({ deployApp: deploy(false), catalog: [SYSTEM, INTEGRATION] });

        const result = await addAppBuilderComponent(project, INTEGRATION, deps);

        expect(result.success).toBe(false);
        expect(project.appBuilderComponents?.['erp-integration']?.systems).toEqual(['demo-erp']);
    });

    it('stores nothing for an integration that brings no system', async () => {
        const project = createProject();
        const deps = createDeps({ deployApp: deploy(), catalog: [INTEGRATION] });

        await addAppBuilderComponent(project, { ...INTEGRATION, envSchema: [] }, deps);

        expect(project.appBuilderComponents?.['erp-integration']).not.toHaveProperty('systems');
    });
});

describe('removal follows the stored link', () => {
    function linkedProject() {
        return createProject({
            componentInstances: {
                'erp-integration': instance('erp-integration'),
                'erp-a': instance('erp-a'),
                'demo-erp': instance('demo-erp'),
            },
            appBuilderComponents: {
                'erp-integration': state('integration', { systems: ['erp-a'] }),
                'erp-a': state('system', { usedBy: 'erp-integration' }),
                // In the catalog as the integration's system, but not linked to it.
                'demo-erp': state('system'),
            },
        });
    }

    it('removes the linked system with its integration, and no other', async () => {
        const project = linkedProject();
        const deps = createDeps({ catalog: [SYSTEM, INTEGRATION] });

        const result = await removeAppBuilderComponent(project, 'erp-integration', deps);

        expect(result.success).toBe(true);
        expect(Object.keys(project.appBuilderComponents ?? {})).toEqual(['demo-erp']);
        const undeploys = deps.commandManager.execute.mock.calls
            .filter((call) => String(call[0]) === 'aio app undeploy')
            .map((call) => (call[1] as { cwd?: string }).cwd);
        expect(undeploys).toEqual(['/proj/components/erp-integration', '/proj/components/erp-a']);
    });

    it('removing a linked system removes the integration it is linked to, and not the other system', async () => {
        const project = linkedProject();
        const deps = createDeps({ catalog: [SYSTEM, INTEGRATION] });

        const result = await removeAppBuilderComponent(project, 'erp-a', deps);

        expect(result.success).toBe(true);
        expect(Object.keys(project.appBuilderComponents ?? {})).toEqual(['demo-erp']);
    });

    it('lets a system the integration does not use go alone', async () => {
        const project = linkedProject();
        const deps = createDeps({ catalog: [SYSTEM, INTEGRATION] });

        await expect(removeAppBuilderComponent(project, 'demo-erp', deps)).resolves.toMatchObject({ success: true });
        expect(Object.keys(project.appBuilderComponents ?? {})).toEqual(['erp-integration', 'erp-a']);
    });
});

/*
 * An ERP added from the integration's card (AB-16): `demo-erp-2`, made from the catalog's
 * `demo-erp`, linked to `erp-integration` (whose own pair is `demo-erp`). It is removed on its
 * own, after the integration stops listing it; the integration's removal still takes it.
 */
describe('an ERP added from the card', () => {
    function withAddedErp() {
        return createProject({
            componentInstances: {
                'erp-integration': instance('erp-integration'),
                'demo-erp': instance('demo-erp'),
                'demo-erp-2': instance('demo-erp-2'),
            },
            appBuilderComponents: {
                'erp-integration': state('integration', { systems: ['demo-erp', 'demo-erp-2'], name: 'Acme ERP Integration' }),
                'demo-erp': state('system', { usedBy: 'erp-integration' }),
                'demo-erp-2': state('system', { usedBy: 'erp-integration', catalogId: 'demo-erp', name: 'Brand B ERP' }),
            },
        });
    }

    it('goes alone, and only after the integration stopped listing it', async () => {
        const project = withAddedErp();
        const order: string[] = [];
        const unlistSystem = jest.fn(async () => {
            order.push('unlist');
            return undefined;
        });
        const deps = createDeps({ catalog: [SYSTEM, INTEGRATION], unlistSystem });
        const execute = deps.commandManager.execute.getMockImplementation();
        deps.commandManager.execute.mockImplementation(async (command, options) => {
            if (command === 'aio app undeploy') order.push('undeploy');
            return execute!(command, options);
        });

        const result = await removeAppBuilderComponent(project, 'demo-erp-2', deps);

        expect(result.success).toBe(true);
        expect(unlistSystem).toHaveBeenCalledWith(project, 'erp-integration', 'demo-erp-2');
        expect(order).toEqual(['unlist', 'undeploy']);
        expect(Object.keys(project.appBuilderComponents ?? {})).toEqual(['erp-integration', 'demo-erp']);
    });

    it('removes nothing when the integration could not be told, and says so', async () => {
        const project = withAddedErp();
        const deps = createDeps({ catalog: [SYSTEM, INTEGRATION], unlistSystem: jest.fn(async () => 'Adobe sign-in required.') });

        const result = await removeAppBuilderComponent(project, 'demo-erp-2', deps);

        expect(result).toEqual({
            success: false,
            error: 'Acme ERP Integration still lists Brand B ERP (Adobe sign-in required). Nothing was removed; Remove anyway goes on without it.',
        });
        expect(Object.keys(project.appBuilderComponents ?? {})).toEqual(['erp-integration', 'demo-erp', 'demo-erp-2']);
    });

    it('Remove anyway goes on without the list', async () => {
        const project = withAddedErp();
        const deps = createDeps({ catalog: [SYSTEM, INTEGRATION], unlistSystem: jest.fn(async () => 'Adobe sign-in required.') });

        const result = await removeAppBuilderComponent(project, 'demo-erp-2', deps, { force: true });

        expect(result.success).toBe(true);
        expect(project.appBuilderComponents).not.toHaveProperty('demo-erp-2');
    });

    it("the integration's removal takes every ERP, without unlisting any", async () => {
        const project = withAddedErp();
        const unlistSystem = jest.fn(async () => undefined);
        const deps = createDeps({ catalog: [SYSTEM, INTEGRATION], unlistSystem });

        const result = await removeAppBuilderComponent(project, 'erp-integration', deps);

        expect(result.success).toBe(true);
        expect(project.appBuilderComponents).toStrictEqual({});
        expect(unlistSystem).not.toHaveBeenCalled();
    });
});
