/**
 * Deploy-contract runner — a component that serves its OWN screen (the ERP).
 *
 * The runner hands the ERP's deploy the screen key, records the screen as the
 * ERP's address, and forgets the key when the pair is removed. The key
 * functions are the real ones, over the shared SecretStorage fake.
 */

import './appBuilderComponentRunner.runtimeMock';
import { mockWithOrgContext } from './appBuilderComponentRunner.orgContextMock';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';

jest.setTimeout(5000);

jest.mock('@/features/app-builder/services/appConfigPackages', () => ({
    listDeclaredPackageNames: jest.fn().mockResolvedValue([]),
    listDeclaredTriggersAndRules: jest.fn().mockResolvedValue({ triggers: [], rules: [] }),
    detectAppLayout: jest.fn(async (path: string) => (path.includes('demo-erp') ? 'standalone' : 'extension')),
}));

import {
    addAppBuilderComponent,
    deployAppBuilderComponent,
    removeAppBuilderComponent,
} from '@/features/app-builder/services/appBuilderComponentRunner';
import { resolveSecretDeployEnv } from '@/features/app-builder/services/componentSettingSecrets';
import { forgetScreenKey } from '@/features/app-builder/services/systemScreen';
import { secretKey } from '@/features/app-builder/services/secretKey';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { createDeps, createProject } from './appBuilderComponentRunner.testUtils';

const SYSTEM: AppBuilderComponentCatalogEntry = {
    id: 'demo-erp',
    name: 'ERP',
    description: 'the ERP',
    kind: 'system',
    boundTo: 'erp-integration',
    providesEnvVars: ['ERP_BASE_URL'],
    screen: { action: 'screen', keyEnvVar: 'ERP_SCREEN_KEY' },
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
        { name: 'ERP_API_KEY', type: 'secret', label: 'ERP API key' },
    ],
    source: { owner: 'skukla', repo: 'commerce-erp-integration', branch: 'main' },
};

const NS = 'https://ns.adobeioruntime.net/api/v1';
const ERP_URLS = {
    'runtime/demo-erp/events-retry': `${NS}/demo-erp/events-retry`,
    'runtime/demo-erp/health': `${NS}/web/demo-erp/health`,
    'runtime/demo-erp/screen': `${NS}/web/demo-erp/screen`,
};
const INT_URLS = { 'runtime/erp/status': `${NS}/web/erp/status` };

type DeployCall = [string, string, unknown, unknown, { extraEnv?: Record<string, string> }];

function wired() {
    const { secrets, store } = createMockSecretStorage();
    const deployApp = jest.fn(async (componentPath: string) => ({
        success: true,
        data: componentPath.includes('demo-erp')
            // `get-url`'s primary pick for this app: the first action it lists.
            ? { url: ERP_URLS['runtime/demo-erp/events-retry'], deployedUrls: ERP_URLS }
            : { url: INT_URLS['runtime/erp/status'], deployedUrls: INT_URLS },
    }));
    const deps = createDeps({
        deployApp,
        catalog: [SYSTEM, INTEGRATION],
        resolveSecretEnv: (project, entry) => resolveSecretDeployEnv(secrets, project.path, entry),
        forgetScreenKey: (project, entry) => forgetScreenKey(secrets, project.path, entry),
    });
    return { deps, deployApp, store };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockWithOrgContext.mockImplementation((_target: unknown, fn: () => Promise<unknown>) => fn());
});

describe('a component with its own screen', () => {
    it("hands the ERP's deploy the stored key, and the integration's deploy no key at all", async () => {
        const project = createProject();
        const { deps, deployApp, store } = wired();

        await addAppBuilderComponent(project, INTEGRATION, deps);

        const [erpCall, integrationCall] = deployApp.mock.calls as unknown as DeployCall[];
        const stored = [...store.values()];
        expect(stored).toHaveLength(1);
        expect(erpCall[4].extraEnv).toEqual({ ERP_SCREEN_KEY: stored[0] });
        expect(integrationCall[4].extraEnv).not.toHaveProperty('ERP_SCREEN_KEY');
    });

    it("hands the integration's deploy its secret setting from SecretStorage, and never persists it", async () => {
        const project = createProject();
        const { deps, deployApp, store } = wired();
        store.set(secretKey(project.path, 'erp-integration', 'ERP_API_KEY'), 'fake-test-pw-not-a-secret');

        await addAppBuilderComponent(project, INTEGRATION, deps);

        const [, integrationCall] = deployApp.mock.calls as unknown as DeployCall[];
        expect(integrationCall[4].extraEnv).toMatchObject({ ERP_API_KEY: 'fake-test-pw-not-a-secret' });
        const saved = JSON.stringify((deps.saveProject as jest.Mock).mock.calls);
        expect(saved).not.toContain('fake-test-pw-not-a-secret');
    });

    it('records the screen as the ERP address, whatever the deploy listed first', async () => {
        const project = createProject();
        const { deps } = wired();

        await addAppBuilderComponent(project, INTEGRATION, deps);

        expect(project.appBuilderComponents?.['demo-erp']?.url).toBe(`${NS}/web/demo-erp/screen`);
        expect(project.appBuilderComponents?.['erp-integration']?.url).toBe(INT_URLS['runtime/erp/status']);
    });

    it('never writes the key into the persisted project', async () => {
        const project = createProject();
        const { deps, store } = wired();

        await addAppBuilderComponent(project, INTEGRATION, deps);

        const [key] = [...store.values()];
        expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
        const saved = JSON.stringify((deps.saveProject as jest.Mock).mock.calls);
        expect(saved).toContain('demo-erp');
        expect(saved).not.toContain(key);
    });

    it('a redeploy reuses the same key, so a link already open keeps working', async () => {
        const project = createProject();
        const { deps, deployApp } = wired();
        await addAppBuilderComponent(project, INTEGRATION, deps);

        await deployAppBuilderComponent(project, 'demo-erp', deps);

        const erpEnvs = (deployApp.mock.calls as unknown as DeployCall[])
            .filter(([path]) => path.includes('demo-erp'))
            .map(([, , , , opts]) => opts.extraEnv?.ERP_SCREEN_KEY);
        expect(erpEnvs).toHaveLength(2);
        expect(erpEnvs[0]).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(erpEnvs[1]).toBe(erpEnvs[0]);
    });

    it('removing the pair forgets the key', async () => {
        const project = createProject();
        const { deps, store } = wired();
        await addAppBuilderComponent(project, INTEGRATION, deps);
        expect(store.size).toBe(1);

        const result = await removeAppBuilderComponent(project, 'erp-integration', deps);

        expect(result.success).toBe(true);
        expect(store.size).toBe(0);
    });
});
