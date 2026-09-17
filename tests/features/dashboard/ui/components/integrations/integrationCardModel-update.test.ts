/**
 * integrationCardModel — a recorded update (AB-13, step 5). A deployed
 * integration whose newer code the integrations screen found reads as
 * "Update needed", with Update leading its menu; so does a pair whose ERP has
 * one.
 */

import {
    deriveIntegrationCard,
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

    it('a pair whose ERP has an update reads Update needed and names the ERP', () => {
        const card = deriveIntegrationCard(integration({ id: 'erp-integration' }), undefined, {
            component: erp({ updateAvailable: UPDATE }),
        });

        expect(card.status).toBe('stale');
        expect(card.system?.status).toBe('stale');
        expect(card.message).toBe('Nordwind: Update needed');
    });

    it('a card with no recorded update is unchanged', () => {
        const card = deriveIntegrationCard(integration());

        expect(card.status).toBe('deployed');
        expect(card.menuActions).not.toContain('update');
    });
});
