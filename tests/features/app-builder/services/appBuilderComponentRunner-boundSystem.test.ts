/**
 * Deploy-contract runner — the BOUND PAIR (decision 2, 2026-09-14).
 *
 * The ERP integration comes with its ERP, a `kind: 'system'` entry bound to it.
 * Adding the integration adds and deploys the system FIRST (so the provider
 * check passes and the ERP's base URL is there to inject); removing the
 * integration removes the system AFTER it; removing the system removes its
 * integration the same way, whichever card asked. Every assertion reads an argument a
 * collaborator was handed or the state the runner persisted.
 */

import { mockWithOrgContext } from './appBuilderComponentRunner.orgContextMock';
import './appBuilderComponentRunner.runtimeMock';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';

jest.setTimeout(5000);

const mockDetectAppLayout = jest.fn();
jest.mock('@/features/app-builder/services/appConfigPackages', () => ({
    listDeclaredPackageNames: jest.fn().mockResolvedValue([]),
    listDeclaredTriggersAndRules: jest.fn().mockResolvedValue({ triggers: [], rules: [] }),
    detectAppLayout: (...args: unknown[]) => mockDetectAppLayout(...args),
}));

import {
    addAppBuilderComponent,
    removeAppBuilderComponent,
} from '@/features/app-builder/services/appBuilderComponentRunner';
import { createDeps, createProject } from './appBuilderComponentRunner.testUtils';
import { createSuccessResult } from '../../../helpers/commandResultFake';

const SYSTEM: AppBuilderComponentCatalogEntry = {
    id: 'demo-erp',
    name: 'ERP',
    description: 'the ERP',
    kind: 'system',
    boundTo: 'erp-integration',
    nameFromEnvVar: 'ERP_DISPLAY_NAME',
    providesEnvVars: ['ERP_BASE_URL'],
    envSchema: [{ name: 'ERP_DISPLAY_NAME', type: 'text', label: 'ERP name', default: 'Acme ERP' }],
    source: { owner: 'skukla', repo: 'demo-erp', branch: 'main' },
};

const INTEGRATION: AppBuilderComponentCatalogEntry = {
    id: 'erp-integration',
    name: 'ERP integration',
    description: 'the integration',
    kind: 'integration',
    layout: 'extension',
    lifecycle: 'app-management',
    envSchema: [
        { name: 'ERP_BASE_URL', type: 'text', label: 'ERP address', providedBy: 'demo-erp' },
        { name: 'ERP_DISPLAY_NAME', type: 'text', label: 'ERP name', default: 'Acme ERP' },
    ],
    source: { owner: 'skukla', repo: 'commerce-erp-integration', branch: 'main' },
};

const ERP_URLS = { 'runtime/demo-erp/health': 'https://ns.adobeioruntime.net/api/v1/web/demo-erp/health' };
const INT_URLS = { 'runtime/erp/status': 'https://ns.adobeioruntime.net/api/v1/web/erp/status' };

/** A deploy tail that answers per entry: the ERP's URLs, then the integration's. */
function deployByPath() {
    return jest.fn(async (componentPath: string) => ({
        success: true,
        data: componentPath.includes('demo-erp')
            ? { url: ERP_URLS['runtime/demo-erp/health'], deployedUrls: ERP_URLS }
            : { url: INT_URLS['runtime/erp/status'], deployedUrls: INT_URLS },
    }));
}

beforeEach(() => {
    jest.clearAllMocks();
    mockWithOrgContext.mockImplementation((_target: unknown, fn: () => Promise<unknown>) => fn());
    // The ERP is standalone-shaped, the kit is extension-shaped — the layout the
    // catalog declares for each, so the add door accepts both.
    mockDetectAppLayout.mockImplementation(async (path: string) =>
        path.includes('demo-erp') ? 'standalone' : 'extension',
    );
});

describe("the pair's APIs are subscribed for this project only", () => {
    const UNRELATED: AppBuilderComponentCatalogEntry = {
        id: 'other-integration',
        name: 'Other',
        description: 'an integration this project does not have',
        kind: 'integration',
        requiredApis: ['OtherSDK'],
        source: { owner: 'skukla', repo: 'other', branch: 'main' },
    };

    it('subscribes the ERP, then the ERP and its integration, and never an integration the project lacks', async () => {
        const project = createProject();
        const deps = createDeps({
            deployApp: deployByPath(),
            catalog: [{ ...SYSTEM, requiredApis: ['AppBuilderDataServicesSDK'] }, INTEGRATION, UNRELATED],
        });

        await addAppBuilderComponent(project, INTEGRATION, deps);

        const scopes = (deps.subscribeRequiredApis as jest.Mock).mock.calls.map(([entries]) =>
            (entries as AppBuilderComponentCatalogEntry[]).map((e) => e.id),
        );
        expect(scopes).toEqual([['demo-erp'], ['demo-erp', 'erp-integration']]);
    });
});

describe('adding the integration adds its system first', () => {
    it('deploys the ERP, then the integration, in that order', async () => {
        const project = createProject();
        const deployApp = deployByPath();
        const deps = createDeps({ deployApp, catalog: [SYSTEM, INTEGRATION] });

        const result = await addAppBuilderComponent(project, INTEGRATION, deps);

        expect(result).toEqual({ success: true });
        const paths = deployApp.mock.calls.map((call) => String(call[0]));
        expect(paths).toHaveLength(2);
        expect(paths[0]).toContain('demo-erp');
        expect(paths[1]).toContain('erp-integration');
    });

    it("persists both rows: the ERP named from its input and providing its web base, the integration keyed by its own id", async () => {
        const project = createProject();
        const deps = createDeps({ deployApp: deployByPath(), catalog: [SYSTEM, INTEGRATION] });

        await addAppBuilderComponent(project, INTEGRATION, deps);

        expect(project.appBuilderComponents?.['demo-erp']).toMatchObject({
            kind: 'system',
            status: 'deployed',
            name: 'Acme ERP',
            providesEnvVars: { ERP_BASE_URL: 'https://ns.adobeioruntime.net/api/v1/web/demo-erp' },
        });
        expect(project.appBuilderComponents?.['erp-integration']).toMatchObject({
            kind: 'integration',
            status: 'deployed',
            name: 'ERP integration',
        });
    });

    it("hands the integration's deploy the ERP's base URL and the ERP's name in its env", async () => {
        const project = createProject({
            componentConfigs: { 'erp-integration': { ERP_DISPLAY_NAME: 'Nordwind' } },
        });
        const deployApp = deployByPath();
        const deps = createDeps({ deployApp, catalog: [SYSTEM, INTEGRATION] });

        await addAppBuilderComponent(project, INTEGRATION, deps);

        const [erpCall, integrationCall] = deployApp.mock.calls as unknown as Array<
            [string, string, unknown, unknown, { extraEnv?: Record<string, string> }]
        >;
        expect(erpCall[4].extraEnv).toEqual({ ERP_DISPLAY_NAME: 'Nordwind' });
        expect(integrationCall[4].extraEnv).toEqual({
            ERP_BASE_URL: 'https://ns.adobeioruntime.net/api/v1/web/demo-erp',
            ERP_DISPLAY_NAME: 'Nordwind',
        });
        // The ERP's row wears the name the SC typed on the integration.
        expect(project.appBuilderComponents?.['demo-erp']?.name).toBe('Nordwind');
    });

    // PL-59: the pair is two full deploys back to back, a total known before anything
    // starts, so every report says which one it is on (owner, 2026-09-19).
    it('says which of the two it is on: the ERP is 1 of 2, the integration 2 of 2', async () => {
        const project = createProject();
        const onProgress = jest.fn();
        const deps = createDeps({ deployApp: deployByPath(), catalog: [SYSTEM, INTEGRATION], onProgress });

        await addAppBuilderComponent(project, INTEGRATION, deps);

        const positions = onProgress.mock.calls.map((call) => call[2]);
        const firstForIntegration = positions.findIndex((p) => p?.index === 2);
        expect(positions[0]).toEqual({ index: 1, total: 2 });
        expect(firstForIntegration).toBeGreaterThan(0);
        expect(positions.slice(0, firstForIntegration).every((p) => p?.index === 1)).toBe(true);
        expect(positions.slice(firstForIntegration).every((p) => p?.index === 2 && p.total === 2)).toBe(true);
    });

    it('an add with no system to add first carries no count', async () => {
        const project = createProject({
            appBuilderComponents: {
                'demo-erp': {
                    kind: 'system',
                    status: 'deployed',
                    source: { owner: 'skukla', repo: 'demo-erp' },
                    providesEnvVars: { ERP_BASE_URL: 'https://ns.adobeioruntime.net/api/v1/web/demo-erp' },
                },
            },
        });
        const onProgress = jest.fn();
        const deps = createDeps({ deployApp: deployByPath(), catalog: [SYSTEM, INTEGRATION], onProgress });

        await addAppBuilderComponent(project, INTEGRATION, deps);

        expect(onProgress).toHaveBeenCalled();
        expect(onProgress.mock.calls.every((call) => call[2] === undefined)).toBe(true);
    });

    it('an ERP already in the project is not added again', async () => {
        const project = createProject({
            appBuilderComponents: {
                'demo-erp': {
                    kind: 'system',
                    status: 'deployed',
                    source: { owner: 'skukla', repo: 'demo-erp' },
                    providesEnvVars: { ERP_BASE_URL: 'https://ns.adobeioruntime.net/api/v1/web/demo-erp' },
                },
            },
        });
        const deployApp = deployByPath();
        const deps = createDeps({ deployApp, catalog: [SYSTEM, INTEGRATION] });

        await addAppBuilderComponent(project, INTEGRATION, deps);

        expect(deployApp).toHaveBeenCalledTimes(1);
        expect(String(deployApp.mock.calls[0][0])).toContain('erp-integration');
    });

    it("an ERP that fails to deploy stops the integration before its own deploy, and says whose failure it was", async () => {
        const project = createProject();
        const deployApp = jest.fn(async (componentPath: string) =>
            componentPath.includes('demo-erp')
                ? { success: false, error: 'database not provisioned' }
                : { success: true, data: { url: 'x', deployedUrls: INT_URLS } },
        );
        const deps = createDeps({ deployApp, catalog: [SYSTEM, INTEGRATION] });

        const result = await addAppBuilderComponent(project, INTEGRATION, deps);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Could not add ERP, which ERP integration needs: database not provisioned');
        expect(deployApp).toHaveBeenCalledTimes(1);
        expect(project.appBuilderComponents?.['erp-integration']).toBeUndefined();
    });

    it('the ERP provides only to its integration, so nothing republishes the storefront', async () => {
        const project = createProject();
        const deps = createDeps({ deployApp: deployByPath(), catalog: [SYSTEM, INTEGRATION] });

        await addAppBuilderComponent(project, INTEGRATION, deps);

        expect(deps.republishStorefront).not.toHaveBeenCalled();
    });
});

describe('removing the pair', () => {
    function pairedProject() {
        return createProject({
            componentInstances: {
                'demo-erp': { id: 'demo-erp', name: 'ERP', type: 'app-builder', status: 'ready', path: '/proj/components/demo-erp' },
                'erp-integration': { id: 'erp-integration', name: 'ERP integration', type: 'app-builder', status: 'ready', path: '/proj/components/erp-integration' },
            },
            appBuilderComponents: {
                'demo-erp': {
                    kind: 'system',
                    status: 'deployed',
                    name: 'Acme ERP',
                    source: { owner: 'skukla', repo: 'demo-erp' },
                    providesEnvVars: { ERP_BASE_URL: 'https://ns.adobeioruntime.net/api/v1/web/demo-erp' },
                },
                'erp-integration': {
                    kind: 'integration',
                    status: 'deployed',
                    name: 'ERP integration',
                    source: { owner: 'skukla', repo: 'commerce-erp-integration' },
                    deployedUrls: INT_URLS,
                },
            },
        });
    }

    it('removing the integration removes the ERP after it: two undeploys, both rows gone', async () => {
        const project = pairedProject();
        const deps = createDeps({ catalog: [SYSTEM, INTEGRATION] });

        const result = await removeAppBuilderComponent(project, 'erp-integration', deps);

        expect(result.success).toBe(true);
        const undeploys = deps.commandManager.execute.mock.calls
            .filter((call) => String(call[0]) === 'aio app undeploy')
            .map((call) => (call[1] as { cwd?: string }).cwd);
        expect(undeploys).toEqual(['/proj/components/erp-integration', '/proj/components/demo-erp']);
        expect(project.appBuilderComponents).toStrictEqual({});
        expect(deps.componentManager.removeComponent).toHaveBeenCalledWith(expect.anything(), 'erp-integration', true);
        expect(deps.componentManager.removeComponent).toHaveBeenCalledWith(expect.anything(), 'demo-erp', true);
        expect(deps.republishStorefront).not.toHaveBeenCalled();
    });

    it("undoes the integration's Commerce writes before its uninstall and undeploy, once, and hands the result back", async () => {
        const project = pairedProject();
        const order: string[] = [];
        const detached = { status: 'detached' as const, detail: 'Undid 2 company changes and cleared 1 ERP order number in Commerce.' };
        const deps = createDeps({
            catalog: [SYSTEM, INTEGRATION],
            detachFromCommerce: jest.fn(async () => {
                order.push('detach');
                return detached;
            }),
            uninstallAppManagement: jest.fn(async () => {
                order.push('uninstall');
                return { status: 'uninstalled' as const };
            }),
        });
        deps.commandManager.execute.mockImplementation(async (command: string) => {
            if (command === 'aio app undeploy') order.push('undeploy');
            return createSuccessResult();
        });

        const result = await removeAppBuilderComponent(project, 'erp-integration', deps);

        expect(result).toMatchObject({ success: true, commerceDetach: detached });
        expect(order.slice(0, 3)).toEqual(['detach', 'uninstall', 'undeploy']);
        expect(deps.detachFromCommerce).toHaveBeenCalledTimes(1);
        expect(deps.detachFromCommerce).toHaveBeenCalledWith(project, INT_URLS, expect.any(Function));
    });

    it('a failed undo stops the pair with nothing removed; removing anyway removes both and says so', async () => {
        const failed = { status: 'failed' as const, detail: "The ERP's changes in Commerce were not undone: offline" };
        const deps = createDeps({
            catalog: [SYSTEM, INTEGRATION],
            detachFromCommerce: jest.fn(async () => failed),
        });

        const stopped = pairedProject();
        const refused = await removeAppBuilderComponent(stopped, 'erp-integration', deps);
        expect(refused).toMatchObject({ success: false, code: 'COMPONENT_REMOVAL_STOPPED' });
        expect(Object.keys(stopped.appBuilderComponents ?? {})).toEqual(['demo-erp', 'erp-integration']);

        const forced = pairedProject();
        const result = await removeAppBuilderComponent(forced, 'erp-integration', deps, { force: true });
        expect(result).toMatchObject({ success: true, commerceDetach: failed });
        expect(result).not.toHaveProperty('warnings');
        expect(forced.appBuilderComponents).toStrictEqual({});
    });

    it('carries nothing when the component has no detach to run', async () => {
        const project = pairedProject();
        const deps = createDeps({
            catalog: [SYSTEM, INTEGRATION],
            detachFromCommerce: jest.fn(async () => ({ status: 'skipped' as const })),
        });

        const result = await removeAppBuilderComponent(project, 'erp-integration', deps);

        expect(result).not.toHaveProperty('commerceDetach');
    });

    it('removing the ERP removes its integration first, then the ERP: the same order as from the integration', async () => {
        const project = pairedProject();
        const deps = createDeps({ catalog: [SYSTEM, INTEGRATION] });

        const result = await removeAppBuilderComponent(project, 'demo-erp', deps);

        expect(result.success).toBe(true);
        const undeploys = deps.commandManager.execute.mock.calls
            .filter((call) => String(call[0]) === 'aio app undeploy')
            .map((call) => (call[1] as { cwd?: string }).cwd);
        expect(undeploys).toEqual(['/proj/components/erp-integration', '/proj/components/demo-erp']);
        expect(project.appBuilderComponents).toStrictEqual({});
    });

    it('an ERP whose integration is already gone can be removed on its own', async () => {
        const project = pairedProject();
        delete project.appBuilderComponents?.['erp-integration'];
        const deps = createDeps({ catalog: [SYSTEM, INTEGRATION] });

        const result = await removeAppBuilderComponent(project, 'demo-erp', deps);

        expect(result.success).toBe(true);
        expect(project.appBuilderComponents).toStrictEqual({});
    });
});
