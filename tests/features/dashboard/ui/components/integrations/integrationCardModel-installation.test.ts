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
            } as never)
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
            } as never)
        );

        expect(model.installation).toMatchObject({
            label: 'Installed',
            detail: 'Already installed and current.',
            failed: false,
        });
    });

    it('failed on a deployed card: Not installed + the install action AFTER the status verb slot', () => {
        const model = deriveIntegrationCard(
            integration({
                status: 'deployed',
                installation: { status: 'failed', detail: 'hands-back line' },
            } as never)
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

    it('no install action while deploying or on an errored card — the deploy re-runs the install itself', () => {
        const failedInstall = { status: 'failed' as const };

        const deploying = deriveIntegrationCard(
            integration({ status: 'deploying', installation: failedInstall } as never)
        );
        const errored = deriveIntegrationCard(
            integration({ status: 'error', installation: failedInstall } as never)
        );

        expect(deploying.menuActions).toEqual([]);
        expect(errored.menuActions).not.toContain('install');
    });
});
