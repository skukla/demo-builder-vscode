/**
 * appManagementUninstaller — the pre-remove Commerce uninstall pass (AB-4).
 *
 * Mirrors the installer suite: the client is faked and the assertions pin the
 * ARGUMENTS it receives (a mock cannot see a malformed call) plus the outcome
 * shaping. Fixture shapes are the installer suite's — the live 2026-08-27
 * deployedUrls form and the full Adobe context.
 */

import { AppManagementApiError } from '@/features/app-builder/services/appManagementClient';
import {
    APP_MANAGEMENT_HANDS_BACK,
    IO_EVENTS_ENV,
    IO_EVENTS_URL,
} from '@/features/app-builder/services/appManagementInstaller';
import {
    uninstallAppManagementApp,
    type AppManagementUninstallDeps,
    type UninstallerClient,
} from '@/features/app-builder/services/appManagementUninstaller';
import type { Project } from '@/types/base';
import { createMockLogger } from '../../../helpers/loggerFake';

const NS_BASE = 'https://285361-kuklabodeamesh5ngv-stage.adobeioruntime.net/api/v1/web';

const DEPLOYED_URLS = {
    'starter-kit/info': `${NS_BASE}/starter-kit/info`,
    'app-management/installation': `${NS_BASE}/app-management/installation`,
};

function paasProject(): Project {
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
            'adobe-commerce-paas': { ADOBE_COMMERCE_URL: 'https://demo.example.com/' },
        },
    } as unknown as Project;
}

function makeClient(overrides: Partial<jest.Mocked<UninstallerClient>> = {}) {
    return {
        // Default: synchronous 200 answer (no id → nothing to poll).
        startUninstallation: jest.fn().mockResolvedValue({ message: 'done' }),
        getUninstallationState: jest.fn().mockResolvedValue({ id: 'u1', status: 'succeeded' }),
        clearUninstallationState: jest.fn().mockResolvedValue(undefined),
        clearAssociation: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    } as jest.Mocked<UninstallerClient>;
}

function makeDeps(
    client: UninstallerClient,
    overrides: Partial<AppManagementUninstallDeps> = {}
): AppManagementUninstallDeps {
    return {
        getAuth: jest.fn().mockResolvedValue({
            accessToken: 'fake-test-pw-not-a-secret',
            imsOrgId: 'ABC@AdobeOrg',
        }),
        logger: createMockLogger(),
        clientFactory: () => client,
        wait: async () => undefined,
        ...overrides,
    };
}

describe('uninstallAppManagementApp', () => {
    it('starts the uninstall with the FULL spec-required body, then clears both records', async () => {
        const client = makeClient();
        const result = await uninstallAppManagementApp(
            paasProject(),
            DEPLOYED_URLS,
            makeDeps(client)
        );

        expect(result.status).toBe('uninstalled');
        expect(client.startUninstallation).toHaveBeenCalledWith({
            appData: {
                consumerOrgId: '285361',
                orgName: 'Kukla Org',
                projectId: 'p-1',
                projectName: 'KuklaBodeaMesh5NgV',
                projectTitle: 'Kukla Bodea Mesh',
                workspaceId: 'w-1',
                workspaceName: 'Stage',
                workspaceTitle: 'Stage',
            },
            ioEventsUrl: IO_EVENTS_URL,
            ioEventsEnv: IO_EVENTS_ENV,
            commerceBaseUrl: 'https://demo.example.com',
            commerceEnv: 'paas',
        });
        expect(client.clearUninstallationState).toHaveBeenCalled();
        expect(client.clearAssociation).toHaveBeenCalled();
    });

    it('polls a queued (202) uninstall to terminal before clearing', async () => {
        const client = makeClient({
            startUninstallation: jest.fn().mockResolvedValue({ message: 'queued', id: 'u-9' }),
            getUninstallationState: jest
                .fn()
                .mockResolvedValueOnce({ id: 'u-9', status: 'in-progress' })
                .mockResolvedValueOnce({ id: 'u-9', status: 'succeeded' }),
        });

        const result = await uninstallAppManagementApp(
            paasProject(),
            DEPLOYED_URLS,
            makeDeps(client)
        );

        expect(result.status).toBe('uninstalled');
        expect(client.getUninstallationState).toHaveBeenCalledTimes(2);
        expect(client.clearAssociation).toHaveBeenCalled();
    });

    it('skips with no app-management URL — never deployed means nothing installed', async () => {
        const client = makeClient();
        const result = await uninstallAppManagementApp(
            paasProject(),
            { 'starter-kit/info': `${NS_BASE}/starter-kit/info` },
            makeDeps(client)
        );

        expect(result.status).toBe('skipped');
        expect(client.startUninstallation).not.toHaveBeenCalled();
    });

    it('a 409 from the start call is "nothing installed", not a failure', async () => {
        const client = makeClient({
            startUninstallation: jest
                .fn()
                .mockRejectedValue(
                    new AppManagementApiError(
                        'Start uninstallation failed (HTTP 409)',
                        409,
                        'not-installed'
                    )
                ),
        });

        const result = await uninstallAppManagementApp(
            paasProject(),
            DEPLOYED_URLS,
            makeDeps(client)
        );

        expect(result.status).toBe('skipped');
    });

    it('a failed terminal state carrying the 409 self-race signature is retried', async () => {
        const client = makeClient({
            startUninstallation: jest
                .fn()
                .mockResolvedValueOnce({ message: 'queued', id: 'u-1' })
                .mockResolvedValueOnce({ message: 'queued', id: 'u-2' }),
            getUninstallationState: jest
                .fn()
                .mockResolvedValueOnce({
                    id: 'u-1',
                    status: 'failed',
                    error: { message: 'HTTP 409 Conflict — Error 409 from upstream' },
                })
                .mockResolvedValueOnce({ id: 'u-2', status: 'succeeded' }),
        });

        const result = await uninstallAppManagementApp(
            paasProject(),
            DEPLOYED_URLS,
            makeDeps(client)
        );

        expect(result.status).toBe('uninstalled');
        expect(client.startUninstallation).toHaveBeenCalledTimes(2);
    });

    it('a non-retryable failed state fails with the hands-back line', async () => {
        const client = makeClient({
            startUninstallation: jest.fn().mockResolvedValue({ message: 'queued', id: 'u-1' }),
            getUninstallationState: jest
                .fn()
                .mockResolvedValue({ id: 'u-1', status: 'failed', error: { message: 'boom' } }),
        });

        const result = await uninstallAppManagementApp(
            paasProject(),
            DEPLOYED_URLS,
            makeDeps(client)
        );

        expect(result.status).toBe('failed');
        expect(result.detail).toContain(APP_MANAGEMENT_HANDS_BACK);
        expect(client.clearAssociation).not.toHaveBeenCalled();
    });

    it('a clear-records failure does not demote a successful uninstall', async () => {
        const warn = jest.fn();
        const client = makeClient({
            clearAssociation: jest.fn().mockRejectedValue(new Error('nope')),
        });
        const deps = makeDeps(client, {
            logger: createMockLogger({ warn }),
        });

        const result = await uninstallAppManagementApp(paasProject(), DEPLOYED_URLS, deps);

        expect(result.status).toBe('uninstalled');
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('association'));
    });

    it('fails typed (never throws) when no auth is available', async () => {
        const client = makeClient();
        const deps = makeDeps(client, { getAuth: jest.fn().mockResolvedValue(undefined) });

        const result = await uninstallAppManagementApp(paasProject(), DEPLOYED_URLS, deps);

        expect(result.status).toBe('failed');
        expect(result.detail).toContain('No Adobe sign-in');
        expect(client.startUninstallation).not.toHaveBeenCalled();
    });
});
