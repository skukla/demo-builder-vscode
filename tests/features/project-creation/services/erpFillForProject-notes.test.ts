/**
 * erpFillForProject — how several fills read as one: `summarizeFills` (the integration's
 * install pass) and `fillNotes` (a note per ERP whose prices were not published, AB-26z). The fill itself is
 * driven through `loadErpDemoData` in erpFillHandler.test.ts.
 */

import { fillNotes, summarizeFills, type ErpFillOutcomes } from '@/features/project-creation/services/erpFillForProject';

const RESULT = { partners: 1, products: 2, skipped: 0 };
const NOTE = 'Demo data loaded; prices were not published: boom. Load demo data again to retry.';

describe('fillNotes', () => {
    it('answers nothing when no fill has a note', () => {
        expect(fillNotes([{ name: 'A' }, { name: 'B' }])).toBeUndefined();
    });

    it("answers one ERP's note as it is", () => {
        expect(fillNotes([{ name: 'A', note: NOTE }])).toBe(NOTE);
    });

    it('names the ERP before each note when there are several', () => {
        expect(fillNotes([{ name: 'A' }, { name: 'B', note: NOTE }])).toBe(`B: ${NOTE}`);
    });
});

describe('summarizeFills', () => {
    it('is filled when every ERP filled, a note on prices included (its step said it)', () => {
        const outcomes: ErpFillOutcomes = [
            { status: 'filled', result: RESULT, erpId: 'demo-erp', erp: 'demo-erp', name: 'A' },
            { status: 'filled', result: RESULT, erpId: 'demo-erp-2', erp: 'demo-erp-2', name: 'B', note: NOTE },
        ];

        expect(summarizeFills(outcomes)).toStrictEqual({ status: 'filled' });
    });

    it('is failed, each failure by its ERP, when one did not fill', () => {
        const outcomes: ErpFillOutcomes = [
            { status: 'filled', result: RESULT, erpId: 'demo-erp', erp: 'demo-erp', name: 'A', note: NOTE },
            { status: 'failed', detail: 'Commerce answered 401', erp: 'demo-erp-2', name: 'B' },
        ];

        expect(summarizeFills(outcomes)).toStrictEqual({ status: 'failed', detail: 'B: Commerce answered 401' });
    });
});
