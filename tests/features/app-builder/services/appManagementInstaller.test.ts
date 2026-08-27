/**
 * appManagementInstaller — post-deploy install/associate orchestration.
 *
 * The client is faked; every assertion that matters here is about the ARGUMENTS
 * the client receives (a mock cannot see a malformed call — so the calls are
 * what these tests pin) and about the derivations feeding them.
 *
 * URL fixtures are the LIVE shape from the 2026-08-27 kit deploy
 * (aio app get-url --json → adobeioruntime.net web-action URLs).
 */

import {
    APP_MANAGEMENT_HANDS_BACK,
    buildAppData,
    deriveAppManagementBaseUrl,
    deriveCommerceTarget,
    installAppManagementApp,
    type AppManagementInstallDeps,
    type InstallerClient,
} from '@/features/app-builder/services/appManagementInstaller';
import { AppManagementApiError } from '@/features/app-builder/services/appManagementClient';
import type { Project } from '@/types/base';

const NS_BASE = 'https://285361-kuklabodeamesh5ngv-stage.adobeioruntime.net/api/v1/web';

/** Live-shaped deployedUrls: package-qualified action keys → web action URLs. */
const DEPLOYED_URLS = {
    'starter-kit/info': `${NS_BASE}/starter-kit/info`,
    'app-management/installation': `${NS_BASE}/app-management/installation`,
    'app-management/association': `${NS_BASE}/app-management/association`,
};

/** A PaaS project with the full Adobe context (field names from types/base.ts). */
function paasProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'demo',
        path: '/tmp/demo',
        adobe: {
            organization: '285361',
            organizationName: 'Kukla Org',
            projectId: 'p-1',
            projectName: 'KuklaBodeaMesh5NgV',
            projectTitle: 'Kukla Bodea Mesh',
            workspace: 'w-1',
            workspaceName: 'Stage',
            workspaceTitle: 'Stage',
        },
        componentSelections: { backend: 'adobe-commerce-paas' },
        componentConfigs: {
            'adobe-commerce-paas': {
                ADOBE_COMMERCE_URL: 'https://demo.example.com/',
            },
        },
        ...overrides,
    } as Project;
}

function makeClient(overrides: Partial<jest.Mocked<InstallerClient>> = {}) {
    return {
        getInstallationState: jest.fn().mockResolvedValue({ id: 'i1', status: 'succeeded' }),
        reconcileInstallation: jest.fn().mockResolvedValue({ operation: 'install', message: 'ok' }),
        setAssociation: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    } as jest.Mocked<InstallerClient>;
}

function makeDeps(
    client: InstallerClient,
    overrides: Partial<AppManagementInstallDeps> = {}
): AppManagementInstallDeps {
    return {
        getAuth: jest.fn().mockResolvedValue({
            accessToken: 'fake-test-pw-not-a-secret',
            imsOrgId: 'ABC@AdobeOrg',
        }),
        logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as never,
        clientFactory: () => client,
        wait: async () => undefined,
        ...overrides,
    };
}

describe('deriveAppManagementBaseUrl', () => {
    it('cuts any app-management action URL at the package segment', () => {
        expect(deriveAppManagementBaseUrl(DEPLOYED_URLS)).toBe(`${NS_BASE}/app-management`);
    });

    it('returns undefined when no app-management action deployed', () => {
        expect(
            deriveAppManagementBaseUrl({ 'starter-kit/info': `${NS_BASE}/starter-kit/info` })
        ).toBeUndefined();
        expect(deriveAppManagementBaseUrl(undefined)).toBeUndefined();
    });
});

describe('deriveCommerceTarget', () => {
    it('paas: flavor paas + the configured instance URL, trailing slash trimmed', () => {
        expect(deriveCommerceTarget(paasProject())).toEqual({
            commerceBaseUrl: 'https://demo.example.com',
            commerceEnv: 'paas',
        });
    });

    it('accs: flavor saas + the GraphQL endpoint with /graphql stripped', () => {
        const project = paasProject({
            componentSelections: { backend: 'adobe-commerce-accs' },
            componentConfigs: {
                'adobe-commerce-accs': {
                    ACCS_GRAPHQL_ENDPOINT: 'https://na1.api.commerce.adobe.com/tenant-x/graphql',
                },
            },
        });
        expect(deriveCommerceTarget(project)).toEqual({
            commerceBaseUrl: 'https://na1.api.commerce.adobe.com/tenant-x',
            commerceEnv: 'saas',
        });
    });

    it('no Commerce backend → an error naming what was found', () => {
        const project = paasProject({ componentSelections: { backend: undefined } });
        expect(deriveCommerceTarget(project)).toEqual({
            error: expect.stringContaining('no Commerce backend'),
        });
    });

    it('backend selected but endpoint unconfigured → an error naming the key', () => {
        const project = paasProject({ componentConfigs: {} });
        expect(deriveCommerceTarget(project)).toEqual({
            error: expect.stringContaining('ADOBE_COMMERCE_URL'),
        });
    });
});

describe('buildAppData', () => {
    it('maps the persisted Adobe context onto the spec-required eight fields', () => {
        expect(buildAppData(paasProject())).toEqual({
            consumerOrgId: '285361',
            orgName: 'Kukla Org',
            projectId: 'p-1',
            projectName: 'KuklaBodeaMesh5NgV',
            projectTitle: 'Kukla Bodea Mesh',
            workspaceId: 'w-1',
            workspaceName: 'Stage',
            workspaceTitle: 'Stage',
        });
    });

    it('titles fall back to names when absent (real manifests hold subsets)', () => {
        const project = paasProject();
        delete project.adobe?.projectTitle;
        delete project.adobe?.workspaceTitle;
        const data = buildAppData(project);
        expect(data).toMatchObject({
            projectTitle: 'KuklaBodeaMesh5NgV',
            workspaceTitle: 'Stage',
        });
    });

    it('a missing field is an error NAMING it, not a silent partial body', () => {
        const project = paasProject();
        delete project.adobe?.workspaceName;
        expect(buildAppData(project)).toEqual({
            error: expect.stringContaining('workspaceName'),
        });
    });
});

describe('installAppManagementApp', () => {
    it('associates then reconciles with the DERIVED bodies (the calls are the contract)', async () => {
        const client = makeClient();
        const result = await installAppManagementApp(
            paasProject(),
            DEPLOYED_URLS,
            makeDeps(client)
        );

        expect(result.status).toBe('installed');
        expect(client.setAssociation).toHaveBeenCalledWith({
            commerceBaseUrl: 'https://demo.example.com',
            commerceEnv: 'paas',
        });
        expect(client.reconcileInstallation).toHaveBeenCalledWith({
            appData: expect.objectContaining({ consumerOrgId: '285361', workspaceId: 'w-1' }),
            ioEventsUrl: 'https://api.adobe.io/events',
            ioEventsEnv: 'prod',
            commerceBaseUrl: 'https://demo.example.com',
            commerceEnv: 'paas',
        });
    });

    it('a 202 (queued) polls the state until it lands succeeded', async () => {
        const client = makeClient({
            reconcileInstallation: jest
                .fn()
                .mockResolvedValue({ operation: 'install', message: 'queued', id: 'job-1' }),
            getInstallationState: jest
                .fn()
                .mockResolvedValueOnce({ id: 'job-1', status: 'in-progress' })
                .mockResolvedValueOnce({ id: 'job-1', status: 'succeeded' }),
        });
        const result = await installAppManagementApp(
            paasProject(),
            DEPLOYED_URLS,
            makeDeps(client)
        );

        expect(result.status).toBe('installed');
        expect(client.getInstallationState).toHaveBeenCalledTimes(2);
    });

    it('a queued install that lands FAILED hands back to Commerce Admin', async () => {
        const client = makeClient({
            reconcileInstallation: jest
                .fn()
                .mockResolvedValue({ operation: 'install', message: 'queued', id: 'job-1' }),
            getInstallationState: jest.fn().mockResolvedValue({ id: 'job-1', status: 'failed' }),
        });
        const result = await installAppManagementApp(
            paasProject(),
            DEPLOYED_URLS,
            makeDeps(client)
        );

        expect(result.status).toBe('failed');
        expect(result.detail).toContain(APP_MANAGEMENT_HANDS_BACK);
    });

    it('a RETRYABLE landed failure re-reconciles until it converges (the measured 409 race)', async () => {
        // Measured live 2026-08-27: the app's installer races itself creating
        // registrations; each idempotent reconcile gets further and the fourth
        // landed green (registrations 6 → 8 → 19 → 23 → succeeded).
        const racyError = {
            key: 'STEP_EXECUTION_FAILED',
            message:
                "Failed to create I/O Events registration '…': HTTP 409 Conflict — Error 409 from upstream",
        };
        const client = makeClient({
            reconcileInstallation: jest
                .fn()
                .mockResolvedValue({ operation: 'install', message: 'queued', id: 'job-1' }),
            getInstallationState: jest
                .fn()
                .mockResolvedValueOnce({ id: 'job-1', status: 'failed', error: racyError })
                .mockResolvedValueOnce({ id: 'job-2', status: 'failed', error: racyError })
                .mockResolvedValueOnce({ id: 'job-3', status: 'succeeded' }),
        });
        const result = await installAppManagementApp(
            paasProject(),
            DEPLOYED_URLS,
            makeDeps(client)
        );

        expect(result.status).toBe('installed');
        expect(client.reconcileInstallation).toHaveBeenCalledTimes(3);
    });

    it('a NON-retryable landed failure never loops — one round, hands back', async () => {
        const client = makeClient({
            reconcileInstallation: jest
                .fn()
                .mockResolvedValue({ operation: 'install', message: 'queued', id: 'job-1' }),
            getInstallationState: jest.fn().mockResolvedValue({
                id: 'job-1',
                status: 'failed',
                error: { key: 'STEP_EXECUTION_FAILED', message: 'HTTP 403 Forbidden' },
            }),
        });
        const result = await installAppManagementApp(
            paasProject(),
            DEPLOYED_URLS,
            makeDeps(client)
        );

        expect(result.status).toBe('failed');
        expect(client.reconcileInstallation).toHaveBeenCalledTimes(1);
    });

    it('a failure that stays retryable exhausts the rounds and hands back', async () => {
        const racy = {
            id: 'j',
            status: 'failed',
            error: { message: 'HTTP 409 Conflict — Error 409 from upstream' },
        };
        const client = makeClient({
            reconcileInstallation: jest
                .fn()
                .mockResolvedValue({ operation: 'install', message: 'queued', id: 'j' }),
            getInstallationState: jest.fn().mockResolvedValue(racy),
        });
        const result = await installAppManagementApp(
            paasProject(),
            DEPLOYED_URLS,
            makeDeps(client)
        );

        expect(result.status).toBe('failed');
        expect(result.detail).toContain('transient conflict');
        expect(client.reconcileInstallation).toHaveBeenCalledTimes(5);
    });

    it('a 409 already-current reconcile is a SKIP, not a failure', async () => {
        const client = makeClient({
            reconcileInstallation: jest
                .fn()
                .mockRejectedValue(
                    new AppManagementApiError('Reconcile failed (HTTP 409)', 409, 'already-current')
                ),
        });
        const result = await installAppManagementApp(
            paasProject(),
            DEPLOYED_URLS,
            makeDeps(client)
        );

        expect(result.status).toBe('skipped');
    });

    it('an association failure fails WITH the hands-back line, never throws', async () => {
        const client = makeClient({
            setAssociation: jest
                .fn()
                .mockRejectedValue(
                    new AppManagementApiError('Set association failed (HTTP 500)', 500)
                ),
        });
        const result = await installAppManagementApp(
            paasProject(),
            DEPLOYED_URLS,
            makeDeps(client)
        );

        expect(result.status).toBe('failed');
        expect(result.detail).toContain('HTTP 500');
        expect(result.detail).toContain(APP_MANAGEMENT_HANDS_BACK);
        expect(client.reconcileInstallation).not.toHaveBeenCalled();
    });

    it('no auth available → failed with the hands-back, and no client call at all', async () => {
        const client = makeClient();
        const deps = makeDeps(client, { getAuth: jest.fn().mockResolvedValue(undefined) });
        const result = await installAppManagementApp(paasProject(), DEPLOYED_URLS, deps);

        expect(result.status).toBe('failed');
        expect(client.setAssociation).not.toHaveBeenCalled();
    });

    it('no app-management URL in the deploy → failed naming that, no client call', async () => {
        const client = makeClient();
        const result = await installAppManagementApp(
            paasProject(),
            { 'starter-kit/info': `${NS_BASE}/starter-kit/info` },
            makeDeps(client)
        );

        expect(result.status).toBe('failed');
        expect(result.detail).toContain('no app-management install API URL');
        expect(client.setAssociation).not.toHaveBeenCalled();
    });
});
