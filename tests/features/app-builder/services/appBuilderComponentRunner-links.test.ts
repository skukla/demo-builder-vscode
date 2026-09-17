/**
 * Deploy-contract runner — the stored link between an integration and the
 * systems it uses (linked cards plan, step 1). Adding the pair writes it;
 * removing follows it rather than the catalog.
 */

import { mockWithOrgContext } from './appBuilderComponentRunner.orgContextMock';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppDeploymentResult } from '@/features/app-builder/services/types';
import type { AppBuilderComponentState, ComponentInstance } from '@/types/base';

jest.setTimeout(5000);

jest.mock('@/features/app-builder/services/appConfigPackages', () => ({
    listDeclaredPackageNames: jest.fn().mockResolvedValue([]),
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
