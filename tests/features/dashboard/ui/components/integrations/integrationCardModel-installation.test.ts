/**
 * deriveIntegrationCard — the Commerce install facet (AB-5).
 *
 * The persisted `installation` record becomes the drawer's "Commerce install"
 * row and, when failed on a deployed card, the "Install into Commerce" menu
 * action. Split from integrationCardModel.test.ts (481 lines) rather than
 * grown into it.
 */

import { deriveIntegrationCard, integration } from './integrationCardModel.testUtils';

describe('deriveIntegrationCard — installation facet', () => {
    it('renders nothing for an entry with no install record (every non-App-Management card)', () => {
        const model = deriveIntegrationCard(integration({ status: 'deployed' }));

        expect(model.installation).toBeUndefined();
        expect(model.menuActions).not.toContain('install');
    });

    it('installed: label Installed, no install action', () => {
        const model = deriveIntegrationCard(
            integration({
                status: 'deployed',
                installation: { status: 'installed', at: '2026-08-27T01:00:00Z' },
            })
        );

        expect(model.installation).toMatchObject({ label: 'Installed', failed: false });
        expect(model.installation?.at).toBeDefined();
        expect(model.menuActions).not.toContain('install');
    });

    it('skipped IS installed — the installer found everything already current', () => {
        const model = deriveIntegrationCard(
            integration({
                status: 'deployed',
                installation: { status: 'skipped', detail: 'Already installed and current.' },
            })
        );

        expect(model.installation).toMatchObject({
            label: 'Installed',
            detail: 'Already installed and current.',
            failed: false,
        });
    });

    it('upgraded IS installed — the installer moved the app to the deployed version', () => {
        const model = deriveIntegrationCard(
            integration({
                status: 'deployed',
                installation: {
                    status: 'upgraded',
                    detail: 'Upgraded in Commerce to version 0.2.0.',
                    version: '0.2.0',
                },
            })
        );

        expect(model.installation).toMatchObject({
            label: 'Installed',
            detail: 'Upgraded in Commerce to version 0.2.0.',
            failed: false,
        });
        expect(model.menuActions).not.toContain('install');
    });

    it('failed on a deployed card: Not installed + the install action AFTER the status verb slot', () => {
        const model = deriveIntegrationCard(
            integration({
                status: 'deployed',
                installation: { status: 'failed', detail: 'hands-back line' },
            })
        );

        expect(model.installation).toMatchObject({
            label: 'Not installed',
            detail: 'hands-back line',
            failed: true,
        });
        // Deployed has no status verb, so install LEADS.
        expect(model.menuActions[0]).toBe('install');
        expect(model.menuActions).toContain('redeploy');
    });

    it('a refused upgrade: Needs reinstall, and Reinstall replaces Install', () => {
        const model = deriveIntegrationCard(
            integration({
                status: 'deployed',
                installation: {
                    status: 'failed',
                    detail: 'Commerce cannot upgrade the installed app in place.',
                    needsReinstall: true,
                },
            })
        );

        expect(model.installation).toMatchObject({
            label: 'Needs reinstall',
            failed: true,
            needsReinstall: true,
        });
        expect(model.menuActions[0]).toBe('reinstall');
        expect(model.menuActions).not.toContain('install');
    });

    // Commerce can lose what an app registered while the app still reports itself
    // installed (2026-09-22, live: another copy of the same app uninstalled and took
    // this one's webhooks with it). The install pass then answers "skipped", so the
    // reinstall — the one pass that starts from nothing — is the SC's only repair and
    // is offered on every installed card, below Redeploy rather than leading.
    it('Reinstall is offered on any installed card, as the repair', () => {
        const states = [
            { status: 'installed' as const },
            { status: 'upgraded' as const, version: '0.2.0' },
            { status: 'failed' as const, detail: 'hands-back line' },
        ];

        for (const installation of states) {
            const model = deriveIntegrationCard(integration({ status: 'deployed', installation }));
            expect(model.menuActions).toContain('reinstall');
            expect(model.menuActions.indexOf('reinstall')).toBeGreaterThan(
                model.menuActions.indexOf('redeploy')
            );
            expect(model.installation?.needsReinstall).toBeUndefined();
        }
    });

    it('no Reinstall where there is nothing installed to redo', () => {
        const deploying = deriveIntegrationCard(
            integration({ status: 'deploying', installation: { status: 'failed', needsReinstall: true } })
        );
        const errored = deriveIntegrationCard(
            integration({ status: 'error', installation: { status: 'installed' } })
        );
        const noRecord = deriveIntegrationCard(integration({ status: 'deployed' }));

        expect(deploying.menuActions).not.toContain('reinstall');
        expect(errored.menuActions).not.toContain('reinstall');
        expect(noRecord.menuActions).not.toContain('reinstall');
    });

    it('no install action while deploying or on an errored card — the deploy re-runs the install itself', () => {
        const failedInstall = { status: 'failed' as const };

        const deploying = deriveIntegrationCard(
            integration({ status: 'deploying', installation: failedInstall })
        );
        const errored = deriveIntegrationCard(
            integration({ status: 'error', installation: failedInstall })
        );

        expect(deploying.menuActions).toStrictEqual([]);
        expect(errored.menuActions).not.toContain('install');
    });
});
