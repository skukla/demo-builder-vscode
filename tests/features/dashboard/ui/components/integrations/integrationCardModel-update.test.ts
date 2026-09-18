/**
 * integrationCardModel — a recorded update (AB-13, step 5). A deployed
 * integration whose newer code the integrations screen found reads as
 * "Update needed", with Update leading its menu; so does a system card.
 */

import {
    deriveIntegrationCard,
    deriveSystemCard,
    integration,
    type IdentifiedAppBuilderComponent,
} from './integrationCardModel.testUtils';
import { withUpdateStatus } from '@/features/dashboard/ui/components/integrations/integrationCardModel';

const UPDATE = { commit: 'abc123', checkedAt: '2026-09-17T00:00:00Z' };

function erp(over: Partial<IdentifiedAppBuilderComponent> = {}): IdentifiedAppBuilderComponent {
    return {
        id: 'demo-erp',
        kind: 'system',
        status: 'deployed',
        name: 'Nordwind',
        source: { owner: 'skukla', repo: 'demo-erp' },
        ...over,
    };
}

describe('withUpdateStatus', () => {
    it('turns deployed into stale only when an update is recorded', () => {
        expect(withUpdateStatus('deployed', { updateAvailable: UPDATE })).toBe('stale');
        expect(withUpdateStatus('deployed', {})).toBe('deployed');
    });

    it('leaves every other status alone, deploying and error included', () => {
        for (const status of ['deploying', 'error', 'not-deployed', 'stale']) {
            expect(withUpdateStatus(status, { updateAvailable: UPDATE })).toBe(status);
        }
    });
});

describe('deriveIntegrationCard with a recorded update', () => {
    it('reads Update needed, says why, and leads its menu with Update', () => {
        const card = deriveIntegrationCard(integration({ updateAvailable: UPDATE }));

        expect(card.status).toBe('stale');
        expect(card.statusLabel).toBe('Update needed');
        expect(card.message).toBe('A newer version is available. Update fetches it and deploys it.');
        expect(card.menuActions[0]).toBe('update');
        expect(card.menuActions).not.toContain('redeploy');
    });

    it('shows the live deploy over the recorded update while Update runs', () => {
        const card = deriveIntegrationCard(integration({ updateAvailable: UPDATE }), {
            status: 'deploying',
            message: 'Updating…',
        });

        expect(card.status).toBe('deploying');
        expect(card.menuActions).toStrictEqual([]);
    });

    it('a system with an update reads Update needed on its own card, Update first', () => {
        const card = deriveSystemCard(erp({ updateAvailable: UPDATE }));

        expect(card.status).toBe('stale');
        expect(card.statusLabel).toBe('Update needed');
        expect(card.menuActions[0]).toBe('update');
    });

    it('a card with no recorded update is unchanged', () => {
        const card = deriveIntegrationCard(integration());

        expect(card.status).toBe('deployed');
        expect(card.menuActions).not.toContain('update');
    });
});

describe('a failed card with a recorded update', () => {
    // Owner, 2026-09-18: the integration read "Deploy failed" and offered only Retry,
    // while Update sat on the ERP's card. Update fetches the new code and redeploys,
    // so it does Retry's job too, and belongs on the card that failed.
    it('an integration that failed offers Update in Retry\'s place, and keeps its error', () => {
        const card = deriveIntegrationCard(
            integration({ status: 'error', error: 'aio said no', updateAvailable: UPDATE }),
        );

        expect(card.status).toBe('error');
        expect(card.message).toBe('aio said no');
        expect(card.menuActions[0]).toBe('update');
        expect(card.menuActions).not.toContain('retry');
    });

    it('a system that failed offers Update the same way', () => {
        const card = deriveSystemCard(erp({ status: 'error', updateAvailable: UPDATE }));

        expect(card.menuActions[0]).toBe('update');
        expect(card.menuActions).not.toContain('retry');
    });

    it('control: a failed card with no update still offers Retry', () => {
        expect(deriveIntegrationCard(integration({ status: 'error' })).menuActions[0]).toBe('retry');
        expect(deriveSystemCard(erp({ status: 'error' })).menuActions[0]).toBe('retry');
    });
});
