/**
 * Runner ↔ App Management install wiring (2026-08-27).
 *
 * After a SUCCESSFUL deploy of a `lifecycle: 'app-management'` entry, the
 * runner calls the injected installer, persists the outcome on the keyed
 * entry's `installation` record, and — critically — never fails the deploy on
 * an install failure (deployed-but-dormant, hands-back recorded). Deploy-only
 * entries never invoke it.
 */

import {
    addAppBuilderComponent,
    deployAppBuilderComponent,
} from '@/features/app-builder/services/appBuilderComponentRunner';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { Project } from '@/types/base';
import {
    INTEGRATION_ENTRY,
    createDeps,
    createProject,
} from './appBuilderComponentRunner.testUtils';

const KIT_ENTRY: AppBuilderComponentCatalogEntry = {
    id: 'commerce-integration-starter-kit',
    name: 'Commerce Integration Starter Kit',
    description: 'The kit',
    kind: 'integration',
    layout: 'extension',
    lifecycle: 'app-management',
    source: { owner: 'adobe', repo: 'commerce-integration-starter-kit', branch: 'main' },
};

const KIT_URLS = {
    'app-management/installation':
        'https://ns.adobeioruntime.net/api/v1/web/app-management/installation',
};

function kitDeps(overrides: Partial<Record<string, unknown>> = {}) {
    const installAppManagement =
        (overrides.installAppManagement as jest.Mock | undefined) ??
        jest.fn().mockResolvedValue({ status: 'installed' });
    const deps = createDeps({
        deployApp: jest.fn().mockResolvedValue({
            success: true,
            data: { url: 'https://app/api', deployedUrls: KIT_URLS },
        }),
        ...overrides,
        installAppManagement,
    });
    return { deps, installAppManagement };
}

// The add path verifies the cloned repo's layout on disk; mock the detector to
// agree with the entry so the door admits it.
jest.mock('@/features/app-builder/services/appConfigPackages', () => ({
    listDeclaredPackageNames: jest.fn().mockResolvedValue([]),
    detectAppLayout: jest.fn(async () => 'extension'),
}));

describe('S2S deploy-env wiring', () => {
    it('add: an app-management entry deploys WITH the resolved IMS env (args pinned)', async () => {
        const s2sEnv = { AIO_COMMERCE_AUTH_IMS_CLIENT_ID: 'client-id-abc' };
        const resolveAppManagementEnv = jest.fn().mockResolvedValue(s2sEnv);
        const { deps } = kitDeps({ resolveAppManagementEnv });
        const project = createProject();

        await addAppBuilderComponent(project, KIT_ENTRY, deps);

        expect(resolveAppManagementEnv).toHaveBeenCalledWith(project);
        expect(deps.deployApp).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(String),
            expect.anything(),
            expect.anything(),
            expect.objectContaining({ extraEnv: s2sEnv })
        );
    });

    it('add: a resolve FAILURE fails the deploy — a kit without credentials deploys broken', async () => {
        const { deps, installAppManagement } = kitDeps({
            resolveAppManagementEnv: jest.fn().mockRejectedValue(new Error('no S2S credential')),
        });
        const project = createProject();

        const result = await addAppBuilderComponent(project, KIT_ENTRY, deps);

        expect(result.success).toBe(false);
        expect(result.error).toContain('IMS credentials');
        expect(deps.deployApp).not.toHaveBeenCalled();
        expect(installAppManagement).not.toHaveBeenCalled();
    });

    it('add: a deploy-only entry never consults the resolver and passes no extra env', async () => {
        // The suite's layout detector answers 'extension' (the kit's shape);
        // this standalone entry needs the matching answer to pass the door.
        const { detectAppLayout } = jest.requireMock(
            '@/features/app-builder/services/appConfigPackages'
        );
        (detectAppLayout as jest.Mock).mockResolvedValueOnce('standalone');
        const resolveAppManagementEnv = jest.fn();
        const { deps } = kitDeps({ resolveAppManagementEnv });
        const project = createProject();

        await addAppBuilderComponent(project, INTEGRATION_ENTRY, deps);

        expect(resolveAppManagementEnv).not.toHaveBeenCalled();
        expect(deps.deployApp).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(String),
            expect.anything(),
            expect.anything(),
            expect.objectContaining({ extraEnv: undefined })
        );
    });

    it('redeploy: an app-management entry re-runs the union subscribe (entitlement)', async () => {
        const { deps } = kitDeps({ catalog: [KIT_ENTRY] });
        const project = createProject({
            appBuilderComponents: {
                [KIT_ENTRY.id]: {
                    kind: 'integration',
                    status: 'deployed',
                    source: KIT_ENTRY.source,
                },
            },
            componentInstances: {
                [KIT_ENTRY.id]: {
                    id: KIT_ENTRY.id,
                    name: KIT_ENTRY.name,
                    status: 'ready',
                    path: '/proj/components/kit',
                },
            },
        });

        await deployAppBuilderComponent(project, KIT_ENTRY.id, deps);

        expect(deps.subscribeRequiredApis).toHaveBeenCalledWith([KIT_ENTRY], project);
    });

    it('redeploy: a deploy-only entry still skips the subscribe (adds own it)', async () => {
        const { deps } = kitDeps({ catalog: [INTEGRATION_ENTRY] });
        const project = createProject({
            appBuilderComponents: {
                [INTEGRATION_ENTRY.id]: {
                    kind: 'integration',
                    status: 'deployed',
                    source: INTEGRATION_ENTRY.source,
                },
            },
            componentInstances: {
                [INTEGRATION_ENTRY.id]: {
                    id: INTEGRATION_ENTRY.id,
                    name: INTEGRATION_ENTRY.name,
                    status: 'ready',
                    path: '/proj/components/erp',
                },
            },
        });

        await deployAppBuilderComponent(project, INTEGRATION_ENTRY.id, deps);

        expect(deps.subscribeRequiredApis).not.toHaveBeenCalled();
    });
});

describe('install-after-deploy wiring', () => {
    it('add: an app-management entry installs after deploy, args pinned', async () => {
        const { deps, installAppManagement } = kitDeps();
        const project = createProject();

        const result = await addAppBuilderComponent(project, KIT_ENTRY, deps);

        expect(result.success).toBe(true);
        expect(installAppManagement).toHaveBeenCalledWith(project, KIT_URLS, expect.any(Function));
        expect(project.appBuilderComponents?.[KIT_ENTRY.id]?.installation).toMatchObject({
            status: 'installed',
        });
    });

    it('add: an install FAILURE keeps the deploy green and records the hands-back', async () => {
        const { deps } = kitDeps({
            installAppManagement: jest.fn().mockResolvedValue({
                status: 'failed',
                detail: 'The install call failed (HTTP 500). Finish in Commerce Admin.',
            }),
        });
        const project = createProject();

        const result = await addAppBuilderComponent(project, KIT_ENTRY, deps);

        expect(result.success).toBe(true);
        expect(project.appBuilderComponents?.[KIT_ENTRY.id]?.status).toBe('deployed');
        expect(project.appBuilderComponents?.[KIT_ENTRY.id]?.installation).toMatchObject({
            status: 'failed',
            detail: expect.stringContaining('Commerce Admin'),
        });
    });

    it('add: a deploy-only entry never touches the installer', async () => {
        // Match the detector to this standalone entry, or the add is refused at
        // the layout door and "not called" would pass without the deploy ever
        // running (a silent false pass this suite shipped with).
        const { detectAppLayout } = jest.requireMock(
            '@/features/app-builder/services/appConfigPackages'
        );
        (detectAppLayout as jest.Mock).mockResolvedValueOnce('standalone');
        const { deps, installAppManagement } = kitDeps();
        const project = createProject();

        const result = await addAppBuilderComponent(project, INTEGRATION_ENTRY, deps);

        expect(result.success).toBe(true);
        expect(installAppManagement).not.toHaveBeenCalled();
    });

    it('redeploy: a persisted kit instance re-installs (capabilities via entryFromState)', async () => {
        // The id is NOT in the catalog — the runner reconstructs the entry from
        // state, which must recover lifecycle 'app-management' through source
        // recognition or this call never happens.
        const { deps, installAppManagement } = kitDeps({ catalog: [] });
        const project = createProject({
            appBuilderComponents: {
                'order-sync': {
                    kind: 'integration',
                    status: 'deployed',
                    name: 'Order Sync',
                    source: { owner: 'adobe', repo: 'commerce-integration-starter-kit' },
                },
            },
            componentInstances: {
                'order-sync': {
                    id: 'order-sync',
                    name: 'Order Sync',
                    status: 'ready',
                    path: '/proj/components/order-sync',
                },
            },
        } as Partial<Project>);

        const result = await deployAppBuilderComponent(project, 'order-sync', deps);

        expect(result.success).toBe(true);
        expect(installAppManagement).toHaveBeenCalled();
    });

    it('redeploy: a plain custom app (no seed source) never touches the installer', async () => {
        const { deps, installAppManagement } = kitDeps({ catalog: [] });
        const project = createProject({
            appBuilderComponents: {
                'my-app': {
                    kind: 'integration',
                    status: 'deployed',
                    source: { owner: 'acme', repo: 'erp-bridge' },
                },
            },
            componentInstances: {
                'my-app': {
                    id: 'my-app',
                    name: 'My App',
                    status: 'ready',
                    path: '/proj/components/my-app',
                },
            },
        } as Partial<Project>);

        await deployAppBuilderComponent(project, 'my-app', deps);

        expect(installAppManagement).not.toHaveBeenCalled();
    });
});
