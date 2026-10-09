/**
 * erpFillForProject — how several fills read as one: `summarizeFills` (the integration's
 * install pass), `fillWarnings` (what the SC must act on, per ERP: prices not published,
 * AB-26z) and `fillNotes` (what the SC need only know, per ERP: prices still being
 * published). The fill itself is driven through `loadErpDemoData` in erpFillHandler.test.ts.
 */

import {
    fillNotes,
    fillWarnings,
    summarizeFills,
    type ErpFillOutcomes,
} from '@/features/project-creation/services/erpFillForProject';

const RESULT = { partners: 1, products: 2, skipped: 0 };
const WARNING = 'Demo data loaded; prices were not published: boom. Load demo data again to retry.';
const NOTE = 'Demo data loaded. Prices are still being published and will finish by themselves in a few minutes.';

describe('fillWarnings', () => {
    it('answers nothing when no fill has a warning', () => {
        expect(fillWarnings([{ name: 'A' }, { name: 'B', note: NOTE }])).toBeUndefined();
    });

    it("answers one ERP's warning as it is", () => {
        expect(fillWarnings([{ name: 'A', warning: WARNING }])).toBe(WARNING);
    });

    it('names the ERP before each warning when there are several', () => {
        expect(fillWarnings([{ name: 'A' }, { name: 'B', warning: WARNING }])).toBe(`B: ${WARNING}`);
    });
});

describe('fillNotes', () => {
    it('answers nothing when no fill has a note', () => {
        expect(fillNotes([{ name: 'A', warning: WARNING }, { name: 'B' }])).toBeUndefined();
    });

    it("answers one ERP's note as it is", () => {
        expect(fillNotes([{ name: 'A', note: NOTE }])).toBe(NOTE);
    });

    it('names the ERP before each note when there are several', () => {
        expect(fillNotes([{ name: 'A' }, { name: 'B', note: NOTE }])).toBe(`B: ${NOTE}`);
    });
});

describe('summarizeFills', () => {
    it('is filled when every ERP filled, a warning on prices included (its step said it)', () => {
        const outcomes: ErpFillOutcomes = [
            { status: 'filled', result: RESULT, erpId: 'demo-erp', erp: 'demo-erp', name: 'A' },
            { status: 'filled', result: RESULT, erpId: 'demo-erp-2', erp: 'demo-erp-2', name: 'B', warning: WARNING },
        ];

        expect(summarizeFills(outcomes)).toStrictEqual({ status: 'filled' });
    });

    it('is failed, each failure by its ERP, when one did not fill', () => {
        const outcomes: ErpFillOutcomes = [
            { status: 'filled', result: RESULT, erpId: 'demo-erp', erp: 'demo-erp', name: 'A', warning: WARNING },
            { status: 'failed', detail: 'Commerce answered 401', erp: 'demo-erp-2', name: 'B' },
        ];

        expect(summarizeFills(outcomes)).toStrictEqual({ status: 'failed', detail: 'B: Commerce answered 401' });
    });
});
