/**
 * setupChecklist — an integration's demo setup steps (from the real bundled catalog) with
 * where the SC is on each (AB-26x).
 */

import { setupChecklistOf, setupSummary } from '@/features/app-builder/services/setupChecklist';

describe('setupChecklistOf', () => {
    it("lists the ERP integration's steps, open until marked, the checkable one flagged", () => {
        const items = setupChecklistOf('erp-integration', {});
        expect(items?.map((item) => [item.id, item.state, item.checkable])).toEqual([
            ['confirmed-status', 'open', false],
            ['company-catalogs', 'open', true],
        ]);
    });

    it('carries the saved state and the last check note', () => {
        const items = setupChecklistOf('erp-integration', {
            setupSteps: {
                'confirmed-status': { state: 'dismissed' },
                'company-catalogs': { state: 'done', note: 'Each of the 2 companies has a customer group of its own.' },
            },
        });
        expect(items?.map((item) => item.state)).toEqual(['dismissed', 'done']);
        expect(items?.[1].note).toMatch(/customer group of its own/);
    });

    it('reads a second copy through the entry it was made from', () => {
        expect(setupChecklistOf('erp-integration-2', { catalogId: 'erp-integration' })).toHaveLength(2);
    });

    it('is undefined for an entry that declares no steps', () => {
        expect(setupChecklistOf('demo-erp', {})).toBeUndefined();
    });
});

describe('setupSummary', () => {
    const item = (state: 'open' | 'done' | 'dismissed') => ({ id: state, title: '', why: '', where: '', state, checkable: false });

    it('counts done out of the steps not dismissed', () => {
        expect(setupSummary([item('done'), item('open'), item('dismissed')])).toBe('1 of 2 done');
    });

    it('says all done when nothing is open', () => {
        expect(setupSummary([item('done'), item('dismissed')])).toBe('All done');
    });
});
