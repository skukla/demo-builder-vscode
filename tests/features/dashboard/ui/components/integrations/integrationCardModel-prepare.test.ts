/**
 * integrationCardModel — "Prepare this store" and "Undo preparation" on an integration's card
 * (AB-77). Offered on a deployed integration while a step it can fix is still open (the ERP
 * integration's steps declare fixes); the undo whenever a preparation is recorded on it.
 */

import { deriveIntegrationCard, integration } from './integrationCardModel.testUtils';

// The test catalog's one fixable step (integrationCardModel.testUtils).
const allFixableDone = { 'price-scope-website': { state: 'done' as const, lastCheck: 'passed' as const } };
const recordedRun = { at: '2026-10-10T10:00:00Z', steps: { 'price-scope-website': { kind: 'config' as const, previous: [] } } };

const erpIntegration = (over = {}) => integration({ id: 'erp-integration', source: { owner: 'skukla', repo: 'commerce-erp-integration' }, ...over });

describe('Prepare this store on an integration card', () => {
    it('sits after the ERP verbs on a deployed integration with applicable setup steps', () => {
        const actions = deriveIntegrationCard(erpIntegration()).menuActions;
        expect(actions.indexOf('prepare-store')).toBe(actions.indexOf('reset-records') + 1);
        expect(actions).not.toContain('undo-store-preparation');
    });

    it('adds the undo once a preparation is recorded', () => {
        const recorded = erpIntegration({ storePreparation: { at: '2026-10-10T10:00:00Z', steps: { 'price-scope-website': { kind: 'config', previous: [] } } } });
        const actions = deriveIntegrationCard(recorded).menuActions;
        const at = actions.indexOf('prepare-store');
        expect(actions.slice(at, at + 2)).toEqual(['prepare-store', 'undo-store-preparation']);
    });

    it('is not offered while the integration is not deployed, nor on an entry with no applicable step', () => {
        expect(deriveIntegrationCard(erpIntegration({ status: 'error' })).menuActions).not.toContain('prepare-store');
        expect(deriveIntegrationCard(integration({ id: 'app-builder-shell' })).menuActions).not.toContain('prepare-store');
    });

    // An "All done" Demo setup must not offer a button that would find nothing to apply
    // (owner, 2026-10-18). The undo stays: what was applied can still be put back.
    it('is not offered once every step it can fix is done, while the undo stays', () => {
        const done = deriveIntegrationCard(erpIntegration({ setupSteps: allFixableDone, storePreparation: recordedRun })).menuActions;
        expect(done).not.toContain('prepare-store');
        expect(done.indexOf('undo-store-preparation')).toBe(done.indexOf('reset-records') + 1);
    });

    // A step marked done whose check could not tell is still open (setupChecklist's rule).
    it('CONTROL: a fixable step marked done but unconfirmed still offers it', () => {
        const unconfirmed = { 'price-scope-website': { state: 'done' as const, lastCheck: 'unknown' as const, note: 'Could not read the setting.' } };
        expect(deriveIntegrationCard(erpIntegration({ setupSteps: unconfirmed })).menuActions).toContain('prepare-store');
    });
});
