/**
 * setupChecklist — an integration's demo setup steps (from the real bundled catalog) with
 * where the SC is on each (AB-26x).
 */

import { nextSetupStep, setupChecklistOf } from '@/features/app-builder/services/setupChecklist';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';

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
            ['storefront-returns', 'open', true],
            ['card-payments', 'open', true],
        ]);
    });

    it('marks card payments optional, and no other step', () => {
        const items = setupChecklistOf('erp-integration', {});
        expect(items?.filter((item) => item.optional).map((item) => item.id)).toStrictEqual(['card-payments']);
        // Absent rather than false on a required step, as the other optional fields are.
        expect(items?.[0]).not.toHaveProperty('optional');
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

    it("fills each ERP's own name into a value entered once per ERP, and keeps the placeholder with none", () => {
        const warehouse = (erpNames?: string[]) =>
            setupChecklistOf('erp-integration', {}, erpNames)?.find((item) => item.id === 'second-source')?.enter;
        expect(warehouse(['Justrite ERP', 'Accuform ERP'])).toStrictEqual(['Justrite Warehouse', 'Accuform Warehouse']);
        // A name without a trailing "ERP" is used whole.
        expect(warehouse(['Northwind'])).toStrictEqual(['Northwind Warehouse']);
        expect(warehouse()).toStrictEqual(['<ERP name> Warehouse']);
    });

    it('reads a second copy through the entry it was made from', () => {
        expect(
            setupChecklistOf('erp-integration-2', { catalogId: 'erp-integration' })
        ).toHaveLength(9);
    });

    it('is undefined for an entry that declares no steps', () => {
        expect(setupChecklistOf('demo-erp', {})).toBeUndefined();
    });
});

describe('nextSetupStep', () => {
    const item = (id: string, state: SetupChecklistItem['state'], optional?: boolean): SetupChecklistItem => ({
        id,
        title: `Step ${id}`,
        why: 'why',
        where: 'where',
        state,
        checkable: false,
        ...(optional ? { optional } : {}),
    });

    it('names the first open step that is not optional', () => {
        expect(nextSetupStep([item('a', 'done'), item('b', 'open', true), item('c', 'open')])).toBe('Step c');
    });

    it('names nothing when only optional steps are open', () => {
        expect(nextSetupStep([item('a', 'done'), item('b', 'open', true)])).toBeUndefined();
    });
});
