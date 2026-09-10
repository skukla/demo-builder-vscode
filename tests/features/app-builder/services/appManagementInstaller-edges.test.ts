/**
 * appManagementInstaller — the edges of the derivations and the install loop.
 *
 * The sibling suite covers the happy paths and the measured live shapes. This
 * one covers what happens at the edges of each decision: manifests that are not
 * the shape the types promise (they are read from disk), URLs that are almost
 * right, 409s that are NOT the benign no-op, the poll budget running out, and
 * the guards that must stop the install before any client call.
 *
 * Every assertion here is either a returned value or the ARGUMENTS a
 * collaborator received — a mock cannot see a malformed call.
 */

import {
    APP_MANAGEMENT_HANDS_BACK,
    buildAppData,
    deriveCommerceTarget,
    installAppManagementApp,
    isRetryableInstallFailure,
} from '@/features/app-builder/services/appManagementInstaller';
import { AppManagementApiError } from '@/features/app-builder/services/appManagementClient';
import type { InstallationState } from '@/features/app-builder/services/appManagementClient';
import type { Project } from '@/types/base';
import {
    DEPLOYED_URLS,
    makeInstallerClient,
    makeInstallerDeps,
    paasProject,
} from './appManagementInstaller.testUtils';

/** ceil(TIMEOUTS.LONG 180s / 5s poll interval) — the whole-install allowance. */
const POLL_ROUNDS = 36;

const accsProject = (endpoint: string): Project =>
    paasProject({
        componentSelections: { backend: 'adobe-commerce-accs' },
        componentConfigs: { 'adobe-commerce-accs': { ACCS_GRAPHQL_ENDPOINT: endpoint } },
    });

describe('deriveCommerceTarget — manifests that are not the declared shape', () => {
    it('names the backend it found when that backend has no Commerce contract', () => {
        const project = paasProject({ componentSelections: { backend: 'some-other-backend' } });

        expect(deriveCommerceTarget(project)).toEqual({
            error: expect.stringContaining('some-other-backend'),
        });
    });

    it('says "none" when no backend was selected at all', () => {
        const project = paasProject({ componentSelections: {} });

        expect(deriveCommerceTarget(project)).toEqual({ error: expect.stringContaining('none') });
    });

    it('survives a project with no componentSelections at all', () => {
        const project = paasProject();
        delete (project as { componentSelections?: unknown }).componentSelections;

        expect(deriveCommerceTarget(project)).toEqual({ error: expect.stringContaining('none') });
    });

    it('steps over a component entry that is missing entirely', () => {
        // A manifest is read from disk; the declared type cannot express a hole
        // in it, which is exactly why the lookup is written defensively.
        const project = paasProject({
            componentConfigs: {
                ghost: undefined,
                'adobe-commerce-paas': { ADOBE_COMMERCE_URL: 'https://demo.example.com' },
            } as unknown as Project['componentConfigs'],
        });

        expect(deriveCommerceTarget(project)).toEqual({
            commerceBaseUrl: 'https://demo.example.com',
            commerceEnv: 'paas',
        });
    });

    it('steps over a non-string value under the declared key', () => {
        const project = paasProject({
            componentConfigs: {
                'stale-component': { ADOBE_COMMERCE_URL: 42 },
                'adobe-commerce-paas': { ADOBE_COMMERCE_URL: 'https://demo.example.com' },
            },
        });

        expect(deriveCommerceTarget(project)).toEqual({
            commerceBaseUrl: 'https://demo.example.com',
            commerceEnv: 'paas',
        });
    });

    it('steps over an EMPTY value under the declared key', () => {
        // An empty field is "not configured here", not "configured as nothing" —
        // and a blank base URL would reach Commerce as a request to nowhere.
        const project = paasProject({
            componentConfigs: {
                'stale-component': { ADOBE_COMMERCE_URL: '' },
                'adobe-commerce-paas': { ADOBE_COMMERCE_URL: 'https://demo.example.com' },
            },
        });

        expect(deriveCommerceTarget(project)).toEqual({
            commerceBaseUrl: 'https://demo.example.com',
            commerceEnv: 'paas',
        });
    });
});

describe('deriveCommerceTarget — trimming the URL', () => {
    it('trims EVERY trailing slash, not just the last', () => {
        const project = paasProject({
            componentConfigs: {
                'adobe-commerce-paas': { ADOBE_COMMERCE_URL: 'https://demo.example.com//' },
            },
        });

        expect(deriveCommerceTarget(project)).toMatchObject({
            commerceBaseUrl: 'https://demo.example.com',
        });
    });

    it('trims the slashes left behind after the suffix is stripped', () => {
        expect(
            deriveCommerceTarget(accsProject('https://na1.api.commerce.adobe.com/t-x///graphql'))
        ).toMatchObject({ commerceBaseUrl: 'https://na1.api.commerce.adobe.com/t-x' });
    });

    it('leaves an endpoint that does not carry the suffix alone', () => {
        // Stripping unconditionally would cut eight characters off a URL that
        // never ended in /graphql, and the association would point at a host that
        // does not exist.
        expect(
            deriveCommerceTarget(accsProject('https://na1.api.commerce.adobe.com/t-x'))
        ).toMatchObject({ commerceBaseUrl: 'https://na1.api.commerce.adobe.com/t-x' });
    });
});

describe('buildAppData — the Adobe context', () => {
    it.each([
        'organization',
        'organizationName',
        'projectId',
        'projectName',
        'workspace',
    ])('refuses a context missing %s', (field) => {
        const project = paasProject();
        delete (project.adobe as Record<string, unknown>)[field];

        expect(buildAppData(project)).toEqual({ error: expect.stringContaining('is missing') });
    });

    it('refuses a project with no Adobe context at all', () => {
        const project = paasProject();
        delete (project as { adobe?: unknown }).adobe;

        expect(buildAppData(project)).toEqual({ error: expect.stringContaining('consumerOrgId') });
    });
});

describe('isRetryableInstallFailure', () => {
    it('is false for an error it cannot serialise', () => {
        // A circular error object is not a 409 signature, and guessing "retry"
        // from a failure nobody can read would loop five times for nothing.
        const circular: Record<string, unknown> = {};
        circular.self = circular;

        expect(
            isRetryableInstallFailure({
                id: 'j',
                status: 'failed',
                startedAt: 'now',
                error: circular,
            } as InstallationState)
        ).toBe(false);
    });

    it('is false for a state carrying no error at all', () => {
        expect(
            isRetryableInstallFailure({ id: 'j', status: 'failed', startedAt: 'now' })
        ).toBe(false);
    });
});

describe('installAppManagementApp — 409s that are NOT the benign no-op', () => {
    it('treats a NON-409 already-current claim as a failure', () => {
        // The no-op is a 409 specifically; a 500 that happens to carry the same
        // reason is a broken call, and reporting it as "already installed" would
        // hide it.
        const client = makeInstallerClient({
            reconcileInstallation: jest
                .fn()
                .mockRejectedValue(new AppManagementApiError('boom', 500, 'already-current')),
        });

        return installAppManagementApp(paasProject(), DEPLOYED_URLS, makeInstallerDeps(client)).then(
            (result) => {
                expect(result.status).toBe('failed');
                expect(result.detail).toContain(APP_MANAGEMENT_HANDS_BACK);
            }
        );
    });

    it('treats a 409 with some OTHER message as a failure', async () => {
        const client = makeInstallerClient({
            reconcileInstallation: jest
                .fn()
                .mockRejectedValue(
                    new AppManagementApiError(
                        'Reconcile failed (HTTP 409)',
                        409,
                        undefined,
                        'The workspace is locked by another operation.'
                    )
                ),
        });

        const result = await installAppManagementApp(
            paasProject(),
            DEPLOYED_URLS,
            makeInstallerDeps(client)
        );

        expect(result.status).toBe('failed');
    });

    it('names the no-op when it IS one', async () => {
        const client = makeInstallerClient({
            reconcileInstallation: jest
                .fn()
                .mockRejectedValue(new AppManagementApiError('409', 409, 'already-current')),
        });

        const result = await installAppManagementApp(
            paasProject(),
            DEPLOYED_URLS,
            makeInstallerDeps(client)
        );

        expect(result).toEqual({ status: 'skipped', detail: 'Already installed and current.' });
    });
});

describe('installAppManagementApp — the poll budget', () => {
    /** A reconcile that queues, and a state that never leaves in-progress. */
    function neverLands() {
        return makeInstallerClient({
            reconcileInstallation: jest
                .fn()
                .mockResolvedValue({ operation: 'install', message: 'queued', id: 'job-1' }),
            getInstallationState: jest
                .fn()
                .mockResolvedValue({ id: 'job-1', status: 'in-progress' }),
        });
    }

    it('hands back once the whole-install allowance runs out', async () => {
        const client = neverLands();

        const result = await installAppManagementApp(
            paasProject(),
            DEPLOYED_URLS,
            makeInstallerDeps(client)
        );

        expect(result.status).toBe('failed');
        expect(result.detail).toContain('still running');
        expect(result.detail).toContain(APP_MANAGEMENT_HANDS_BACK);
    });

    it('spends exactly the allowance, not one round more', async () => {
        const client = neverLands();

        await installAppManagementApp(paasProject(), DEPLOYED_URLS, makeInstallerDeps(client));

        expect(client.getInstallationState).toHaveBeenCalledTimes(POLL_ROUNDS);
    });

    it('waits the poll interval between reads', async () => {
        const wait = jest.fn(async () => undefined);
        const client = neverLands();

        await installAppManagementApp(
            paasProject(),
            DEPLOYED_URLS,
            makeInstallerDeps(client, { wait })
        );

        expect(wait).toHaveBeenCalledWith(5000);
    });

    it('answers a synchronous 200 without polling at all', async () => {
        const client = makeInstallerClient({
            reconcileInstallation: jest
                .fn()
                .mockResolvedValue({ operation: 'upgrade', message: 'plan applied' }),
        });

        const result = await installAppManagementApp(
            paasProject(),
            DEPLOYED_URLS,
            makeInstallerDeps(client)
        );

        expect(result).toEqual({ status: 'installed', detail: 'plan applied' });
        expect(client.getInstallationState).not.toHaveBeenCalled();
    });
});

describe('installAppManagementApp — what it tells the user', () => {
    const progressFrom = (calls: string[]) => calls;

    it('narrates the association, then the install', async () => {
        const onProgress = jest.fn();
        const client = makeInstallerClient();

        await installAppManagementApp(
            paasProject(),
            DEPLOYED_URLS,
            makeInstallerDeps(client, { onProgress })
        );

        expect(progressFrom(onProgress.mock.calls.map((c) => c[0] as string))).toEqual([
            'Associating the app with your Commerce instance…',
            'Installing into Commerce (App Management)…',
        ]);
    });

    it('says which retry round it is on', async () => {
        const racy = {
            id: 'j',
            status: 'failed',
            error: { message: 'HTTP 409 Conflict — Error 409 from upstream' },
        };
        const onProgress = jest.fn();
        const client = makeInstallerClient({
            reconcileInstallation: jest
                .fn()
                .mockResolvedValue({ operation: 'install', message: 'queued', id: 'j' }),
            getInstallationState: jest
                .fn()
                .mockResolvedValueOnce(racy)
                .mockResolvedValue({ id: 'j', status: 'succeeded' }),
        });

        await installAppManagementApp(
            paasProject(),
            DEPLOYED_URLS,
            makeInstallerDeps(client, { onProgress })
        );

        const messages = onProgress.mock.calls.map((c) => c[0] as string);
        expect(messages).toContain('Installing into Commerce (App Management)…');
        expect(messages).toContain('Retrying the install (transient conflict, round 2)…');
    });

    it('narrates each poll round while the install is queued', async () => {
        const onProgress = jest.fn();
        const client = makeInstallerClient({
            reconcileInstallation: jest
                .fn()
                .mockResolvedValue({ operation: 'install', message: 'queued', id: 'j' }),
            getInstallationState: jest
                .fn()
                .mockResolvedValueOnce({ id: 'j', status: 'in-progress' })
                .mockResolvedValue({ id: 'j', status: 'succeeded' }),
        });

        await installAppManagementApp(
            paasProject(),
            DEPLOYED_URLS,
            makeInstallerDeps(client, { onProgress })
        );

        expect(onProgress.mock.calls.map((c) => c[0] as string)).toContain(
            'Installing into Commerce…'
        );
    });
});

describe('installAppManagementApp — the guards before any call', () => {
    it('stops on an underivable Commerce target, naming it', async () => {
        const client = makeInstallerClient();
        const project = paasProject({ componentSelections: {} });

        const result = await installAppManagementApp(project, DEPLOYED_URLS, makeInstallerDeps(client));

        expect(result.status).toBe('failed');
        expect(result.detail).toContain('no Commerce backend');
        expect(client.setAssociation).not.toHaveBeenCalled();
    });

    it('stops on an incomplete Adobe context, naming the field', async () => {
        const client = makeInstallerClient();
        const project = paasProject();
        delete project.adobe?.workspaceName;

        const result = await installAppManagementApp(project, DEPLOYED_URLS, makeInstallerDeps(client));

        expect(result.status).toBe('failed');
        expect(result.detail).toContain('workspaceName');
        expect(client.setAssociation).not.toHaveBeenCalled();
    });
});

describe('installAppManagementApp — the default client', () => {
    it('builds a real client against the derived base URL when none is injected', async () => {
        // The factory default is the only line that decides WHERE the install
        // call goes when nothing overrides it; every other test replaces it.
        const fetchMock = jest.fn(async (url: string) =>
            url.endsWith('/association')
                ? new Response(null, { status: 204 })
                : new Response(JSON.stringify({ operation: 'install', message: 'ok' }), {
                      status: 200,
                      headers: { 'Content-Type': 'application/json' },
                  })
        );
        const originalFetch = global.fetch;
        global.fetch = fetchMock as unknown as typeof fetch;

        try {
            const deps = makeInstallerDeps(makeInstallerClient());
            delete deps.clientFactory;

            const result = await installAppManagementApp(paasProject(), DEPLOYED_URLS, deps);

            expect(result.status).toBe('installed');
            const urls = fetchMock.mock.calls.map((c) => c[0]);
            expect(urls[0]).toBe(
                'https://285361-kuklabodeamesh5ngv-stage.adobeioruntime.net/api/v1/web/app-management/association'
            );
            expect(urls[1]).toBe(
                'https://285361-kuklabodeamesh5ngv-stage.adobeioruntime.net/api/v1/web/app-management/installation'
            );
        } finally {
            global.fetch = originalFetch;
        }
    });
});
