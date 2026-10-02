/**
 * setupChecklist — an integration's demo setup steps (from the real bundled catalog) with
 * where the SC is on each (AB-26x).
 */

import { setupChecklistOf } from '@/features/app-builder/services/setupChecklist';

describe('setupChecklistOf', () => {
    it("lists the ERP integration's steps, open until marked, every one checkable", () => {
        const items = setupChecklistOf('erp-integration', {});
        expect(items?.map((item) => [item.id, item.state, item.checkable])).toStrictEqual([
            ['confirmed-status', 'open', true],
            ['company-catalogs', 'open', true],
            ['price-scope-website', 'open', true],
            ['second-source', 'open', true],
            ['erp-attributes', 'open', true],
            ['partially-held-status', 'open', true],
            ['payment-on-account', 'open', true],
        ]);
    });

    it('carries the saved state and the last check note', () => {
        const items = setupChecklistOf('erp-integration', {
            setupSteps: {
                'confirmed-status': { state: 'dismissed' },
                'company-catalogs': {
                    state: 'done',
                    note: 'Each of the 2 companies has a customer group of its own.',
                },
            },
        });
        expect(items?.map((item) => item.state)).toEqual([
            'dismissed',
            'done',
            'open',
            'open',
            'open',
            'open',
            'open',
        ]);
        expect(items?.[1].note).toMatch(/customer group of its own/);
    });

    it("carries what the last check concluded, and infers it for a record saved before it was kept", () => {
        const items = setupChecklistOf('erp-integration', {
            setupSteps: {
                'confirmed-status': { note: 'Could not check: busy', lastCheck: 'unknown', state: 'done' },
                // Saved before 2026-10-01: a note and a state, no outcome.
                'company-catalogs': { state: 'done', note: 'Every company is in a shared catalog.' },
                'price-scope-website': { note: 'Catalog Price Scope is Global; it must be Website.' },
            },
        });
        expect(items?.slice(0, 4).map((item) => item.lastCheck)).toStrictEqual([
            'unknown',
            'passed',
            'failed',
            undefined,
        ]);
    });

    it('reads a second copy through the entry it was made from', () => {
        expect(
            setupChecklistOf('erp-integration-2', { catalogId: 'erp-integration' })
        ).toHaveLength(7);
    });

    it('is undefined for an entry that declares no steps', () => {
        expect(setupChecklistOf('demo-erp', {})).toBeUndefined();
    });
});
