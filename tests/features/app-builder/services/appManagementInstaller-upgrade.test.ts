/**
 * appManagementInstaller — an installed app on @adobe/aio-commerce-lib-app 2.x.
 *
 * Shapes are the 2.0.0 OpenAPI's (read from the package, 2026-09-17): an
 * upgrade answers `operation: 'upgrade'` with a plan (202 when it started, 200
 * when only planned), `already-current` is a 409 reason, and the latest attempt
 * is read with the post-deploy invocation header.
 */

import { installAppManagementApp } from '@/features/app-builder/services/appManagementInstaller';
import {
    AppManagementApiError,
    type LifecycleAttempt,
} from '@/features/app-builder/services/appManagementClient';
import {
    DEPLOYED_URLS,
    makeInstallerClient,
    makeInstallerDeps,
    paasProject,
} from './appManagementInstaller.testUtils';

const DEPLOY_STARTED = '2026-09-17T12:00:00.000Z';

function attempt(overrides: Partial<LifecycleAttempt>): LifecycleAttempt {
    return {
        id: 'a1',
        operation: 'upgrade',
        status: 'in-progress',
        startedAt: '2026-09-17T12:01:00.000Z',
        ...overrides,
    };
}

const upgraded = attempt({
    status: 'succeeded',
    result: { appVersion: '0.2.0', snapshotId: 's2' },
});

describe('installAppManagementApp — upgrading an installed app', () => {
    it('starts an automatic upgrade and follows it to the version it reached', async () => {
        const client = makeInstallerClient({
            getLatestLifecycleAttempt: jest
                .fn()
                .mockResolvedValueOnce(undefined)
                .mockResolvedValueOnce(attempt({ status: 'pending' }))
                .mockResolvedValueOnce(upgraded),
            reconcileInstallation: jest
                .fn()
                .mockResolvedValue({ operation: 'upgrade', message: 'Upgrade started', plan: {}, accepted: true }),
        });
        const progress: string[] = [];

        const result = await installAppManagementApp(
            paasProject(), 'app',
            DEPLOYED_URLS,
            makeInstallerDeps(client, {
                appVersion: '0.2.0',
                since: DEPLOY_STARTED,
                onProgress: (m) => progress.push(m),
            })
        );

        expect(result).toEqual({
            status: 'upgraded',
            version: '0.2.0',
            detail: 'Upgraded in Commerce to version 0.2.0.',
        });
        expect(progress).toContain('Upgrading in Commerce…');
        expect(client.getInstallationState).not.toHaveBeenCalled();
    });

    it('follows an upgrade the deploy hook already started instead of asking again', async () => {
        const client = makeInstallerClient({
            getLatestLifecycleAttempt: jest
                .fn()
                .mockResolvedValueOnce(attempt({ status: 'in-progress' }))
                .mockResolvedValueOnce(upgraded),
        });

        const result = await installAppManagementApp(
            paasProject(), 'app',
            DEPLOYED_URLS,
            makeInstallerDeps(client, { appVersion: '0.2.0', since: DEPLOY_STARTED })
        );

        expect(result.status).toBe('upgraded');
        expect(client.reconcileInstallation).not.toHaveBeenCalled();
        // The association is still written first: the upgrade reads it.
        expect(client.setAssociation).toHaveBeenCalled();
    });

    it("reports the deploy hook's finished upgrade when the app answers already current", async () => {
        const client = makeInstallerClient({
            getLatestLifecycleAttempt: jest
                .fn()
                .mockResolvedValueOnce(upgraded)
                .mockResolvedValueOnce(upgraded),
            reconcileInstallation: jest
                .fn()
                .mockRejectedValue(new AppManagementApiError('Reconcile installation failed (HTTP 409)', 409, 'already-current', 'The app is already on the target version.')),
        });

        const result = await installAppManagementApp(
            paasProject(), 'app',
            DEPLOYED_URLS,
            makeInstallerDeps(client, { appVersion: '0.2.0', since: DEPLOY_STARTED })
        );

        expect(result).toEqual({
            status: 'upgraded',
            version: '0.2.0',
            detail: 'Upgraded in Commerce to version 0.2.0.',
        });
    });

    it('says already installed at the version when no upgrade ran since the deploy', async () => {
        const earlier = { ...upgraded, startedAt: '2026-09-10T09:00:00.000Z' };
        const client = makeInstallerClient({
            getLatestLifecycleAttempt: jest.fn().mockResolvedValue(earlier),
            reconcileInstallation: jest
                .fn()
                .mockRejectedValue(new AppManagementApiError('Reconcile installation failed (HTTP 409)', 409, 'already-current')),
        });

        const result = await installAppManagementApp(
            paasProject(), 'app',
            DEPLOYED_URLS,
            makeInstallerDeps(client, { appVersion: '0.2.0', since: DEPLOY_STARTED })
        );

        expect(result).toEqual({
            status: 'skipped',
            version: '0.2.0',
            detail: 'Already installed at version 0.2.0.',
        });
    });

    it('keeps the 1.x answer a no-op, with the version when it is known', async () => {
        const client = makeInstallerClient({
            reconcileInstallation: jest
                .fn()
                .mockRejectedValue(new AppManagementApiError('x', 409, undefined, 'Installation has already completed successfully.')),
        });

        const result = await installAppManagementApp(
            paasProject(), 'app',
            DEPLOYED_URLS,
            makeInstallerDeps(client, { appVersion: '0.1.0' })
        );

        expect(result).toEqual({
            status: 'skipped',
            version: '0.1.0',
            detail: 'Already installed at version 0.1.0.',
        });
    });

    it('says plainly that a manual-mode upgrade changed nothing', async () => {
        const client = makeInstallerClient({
            reconcileInstallation: jest
                .fn()
                .mockResolvedValue({ operation: 'upgrade', message: 'Upgrade planned', plan: {}, accepted: false }),
        });

        const result = await installAppManagementApp(
            paasProject(), 'app',
            DEPLOYED_URLS,
            makeInstallerDeps(client, { appVersion: '0.3.0' })
        );

        expect(result).toEqual({
            status: 'skipped',
            version: '0.3.0',
            detail: 'An upgrade to version 0.3.0 was planned, but this app upgrades manually, so nothing changed in Commerce.',
        });
        expect(client.getLatestLifecycleAttempt).toHaveBeenCalledTimes(1);
    });

    it("reports a failed upgrade with the app's reason", async () => {
        const client = makeInstallerClient({
            getLatestLifecycleAttempt: jest
                .fn()
                .mockResolvedValueOnce(undefined)
                .mockResolvedValueOnce(
                    attempt({ status: 'failed', failure: { key: 'webhooks', message: 'subscribe answered 400' } })
                ),
            reconcileInstallation: jest
                .fn()
                .mockResolvedValue({ operation: 'upgrade', message: 'Upgrade started', plan: {}, accepted: true }),
        });

        const result = await installAppManagementApp(
            paasProject(), 'app',
            DEPLOYED_URLS,
            makeInstallerDeps(client, { appVersion: '0.2.0' })
        );

        expect(result).toEqual({
            status: 'failed',
            detail: 'The upgrade in Commerce failed: subscribe answered 400.',
        });
    });

    it.each([
        'The existing installation does not include its original config and cannot be upgraded safely. Uninstall and reinstall the app.',
        'Upgrade planning is blocked',
    ])('asks for a reinstall when Commerce refuses to upgrade in place: %s', async (message) => {
        const client = makeInstallerClient({
            reconcileInstallation: jest
                .fn()
                .mockRejectedValue(new AppManagementApiError('Reconcile installation failed (HTTP 409)', 409, undefined, message)),
        });

        const result = await installAppManagementApp(
            paasProject(), 'app',
            DEPLOYED_URLS,
            makeInstallerDeps(client, { appVersion: '0.2.0' })
        );

        expect(result).toEqual({
            status: 'failed',
            needsReinstall: true,
            detail: 'Commerce cannot upgrade the installed app in place. Reinstalling it (uninstall, then install) applies the new version.',
        });
    });

    it('treats an unreadable attempt before asking as none', async () => {
        const client = makeInstallerClient({
            getLatestLifecycleAttempt: jest.fn().mockRejectedValue(new Error('Get upgrade state failed (HTTP 500)')),
        });

        const result = await installAppManagementApp(
            paasProject(), 'app',
            DEPLOYED_URLS,
            makeInstallerDeps(client, { appVersion: '0.2.0' })
        );

        expect(client.reconcileInstallation).toHaveBeenCalled();
        expect(result.status).toBe('installed');
    });

    it('gives up following an upgrade that cannot be read back', async () => {
        const client = makeInstallerClient({
            getLatestLifecycleAttempt: jest.fn().mockResolvedValue(undefined),
            reconcileInstallation: jest
                .fn()
                .mockResolvedValue({ operation: 'upgrade', message: 'Upgrade started', plan: {}, accepted: true }),
        });

        const result = await installAppManagementApp(
            paasProject(), 'app',
            DEPLOYED_URLS,
            makeInstallerDeps(client)
        );

        expect(result).toEqual({
            status: 'failed',
            detail: 'The upgrade in Commerce could not be read back.',
        });
    });

    it('stops following an upgrade that never finishes', async () => {
        const wait = jest.fn().mockResolvedValue(undefined);
        const client = makeInstallerClient({
            getLatestLifecycleAttempt: jest.fn().mockResolvedValue(attempt({ status: 'in-progress' })),
        });

        const result = await installAppManagementApp(
            paasProject(), 'app',
            DEPLOYED_URLS,
            makeInstallerDeps(client, { wait })
        );

        expect(result).toEqual({
            status: 'failed',
            detail: 'The upgrade in Commerce is still running.',
        });
        expect(wait).toHaveBeenCalledWith(3000);
    });
});
