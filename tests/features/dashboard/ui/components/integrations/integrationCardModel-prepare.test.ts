/**
 * integrationCardModel — the demo setup has no verbs on an integration's card (AB-81). "Prepare
 * this store" and "Undo preparation" were a second door into the same steps the setup guide
 * lists; they were removed on 2026-10-26, and Apply all and each step's Undo live in the guide.
 */

import { deriveIntegrationCard, integration } from './integrationCardModel.testUtils';

const recordedRun = { at: '2026-10-10T10:00:00Z', steps: { 'price-scope-website': { kind: 'config' as const, previous: [] } } };

const erpIntegration = (over = {}) => integration({ id: 'erp-integration', source: { owner: 'skukla', repo: 'commerce-erp-integration' }, ...over });

describe('the demo setup on an integration card', () => {
    it('offers no preparation verb on a deployed integration with steps it can apply, recorded or not', () => {
        for (const card of [erpIntegration(), erpIntegration({ storePreparation: recordedRun })]) {
            const actions = deriveIntegrationCard(card).menuActions as string[];
            expect(actions).not.toContain('prepare-store');
            expect(actions).not.toContain('undo-store-preparation');
            // CONTROL: the same card's menu is there, with the ERP verbs that sat beside them.
            expect(actions).toContain('reset-records');
        }
    });
});
