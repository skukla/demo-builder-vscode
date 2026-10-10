/**
 * integrationCardModel — "Prepare this store" and "Undo preparation" on an integration's card
 * (AB-77). Offered on a deployed integration whose catalog steps declare a fix (the ERP
 * integration's do); the undo only once a preparation is recorded on it.
 */

import { deriveIntegrationCard, integration } from './integrationCardModel.testUtils';

const erpIntegration = (over = {}) => integration({ id: 'erp-integration', source: { owner: 'skukla', repo: 'commerce-erp-integration' }, ...over });

describe('Prepare this store on an integration card', () => {
    it('sits just above Remove on a deployed integration with applicable setup steps', () => {
        const actions = deriveIntegrationCard(erpIntegration()).menuActions;
        expect(actions.indexOf('prepare-store')).toBe(actions.indexOf('remove') - 1);
        expect(actions).not.toContain('undo-store-preparation');
    });

    it('adds the undo once a preparation is recorded', () => {
        const recorded = erpIntegration({ storePreparation: { at: '2026-10-10T10:00:00Z', steps: { 'price-scope-website': { kind: 'config', previous: [] } } } });
        const actions = deriveIntegrationCard(recorded).menuActions;
        expect(actions.slice(-3)).toEqual(['prepare-store', 'undo-store-preparation', 'remove']);
    });

    it('is not offered while the integration is not deployed, nor on an entry with no applicable step', () => {
        expect(deriveIntegrationCard(erpIntegration({ status: 'error' })).menuActions).not.toContain('prepare-store');
        expect(deriveIntegrationCard(integration({ id: 'app-builder-shell' })).menuActions).not.toContain('prepare-store');
    });
});
