/**
 * apiRowState Tests — the four-state row resolver (step 03)
 *
 * For ONE integration, every Adobe API code resolves to exactly one state. This
 * is where the safety property lives: a user may remove an API they added, but
 * never one another integration depends on to operate. That protection is not a
 * rule bolted onto the UI — it is this derivation, and the UI only renders it.
 *
 * Precedence, most binding first: baseline > mine-required > other-required >
 * mine-optional. `other-required` outranks `mine-optional` deliberately — if I
 * also picked a code another integration REQUIRES, unchecking it could not
 * actually unsubscribe, so offering removal would be a lie.
 */

import { resolveApiRowStates, type ApiOwner } from '@/core/state/apiRowState';

const ERP: ApiOwner = { id: 'erp-sync', name: 'ERP Sync', requiredApis: ['ErpSDK'] };
const LOYALTY: ApiOwner = { id: 'loyalty', name: 'Loyalty', requiredApis: ['LoyaltySDK'] };

function states(
    componentId: string,
    owners: ApiOwner[] = [ERP, LOYALTY],
    picks: Record<string, string[]> = {}
) {
    return resolveApiRowStates({ componentId, owners, picks, baseline: ['BaselineSDK'] });
}

describe('resolveApiRowStates', () => {
    it('tags the baseline code as always-on', () => {
        expect(states('erp-sync').get('BaselineSDK')).toEqual({
            code: 'BaselineSDK',
            ownership: 'baseline',
            requiredBy: [],
        });
    });

    it("tags this integration's own catalog requirement as mine-required", () => {
        expect(states('erp-sync').get('ErpSDK')).toEqual({
            code: 'ErpSDK',
            ownership: 'mine-required',
            requiredBy: ['ERP Sync'],
        });
    });

    // The row a user must never be able to uncheck, and the reason it names.
    it("tags ANOTHER integration's requirement as other-required, naming it", () => {
        expect(states('erp-sync').get('LoyaltySDK')).toEqual({
            code: 'LoyaltySDK',
            ownership: 'other-required',
            requiredBy: ['Loyalty'],
        });
    });

    it('names EVERY other integration holding the code', () => {
        const third: ApiOwner = { id: 'third', name: 'Third', requiredApis: ['LoyaltySDK'] };

        expect(states('erp-sync', [ERP, LOYALTY, third]).get('LoyaltySDK')?.requiredBy).toEqual([
            'Loyalty',
            'Third',
        ]);
    });

    it("tags this integration's own pick as mine-optional — the only removable state", () => {
        expect(
            states('erp-sync', [ERP, LOYALTY], { 'erp-sync': ['AssetsSDK'] }).get('AssetsSDK')
        ).toEqual({ code: 'AssetsSDK', ownership: 'mine-optional', requiredBy: [] });
    });

    it("tags another integration's PICK as other-required too (it is still holding it)", () => {
        // A pick is intent just like a requirement; dropping the code would break
        // the other integration exactly the same way.
        expect(
            states('erp-sync', [ERP, LOYALTY], { loyalty: ['AssetsSDK'] }).get('AssetsSDK')
        ).toEqual({ code: 'AssetsSDK', ownership: 'other-required', requiredBy: ['Loyalty'] });
    });

    it('omits codes nobody holds (the picker renders them freely selectable)', () => {
        expect(states('erp-sync').has('UnrelatedSDK')).toBe(false);
    });

    describe('precedence', () => {
        it('baseline outranks everything', () => {
            const owners = [{ ...ERP, requiredApis: ['BaselineSDK'] }, LOYALTY];

            expect(
                states('erp-sync', owners, { 'erp-sync': ['BaselineSDK'] }).get('BaselineSDK')
                    ?.ownership
            ).toBe('baseline');
        });

        it('mine-required outranks other-required', () => {
            const owners = [ERP, { ...LOYALTY, requiredApis: ['ErpSDK'] }];

            expect(states('erp-sync', owners).get('ErpSDK')?.ownership).toBe('mine-required');
        });

        // THE safety case. I picked it; someone else requires it. Unchecking could
        // not unsubscribe, so the row must not offer removal.
        it('other-required outranks mine-optional', () => {
            expect(
                states('erp-sync', [ERP, LOYALTY], { 'erp-sync': ['LoyaltySDK'] }).get('LoyaltySDK')
                    ?.ownership
            ).toBe('other-required');
        });
    });

    describe('an integration alone in the project', () => {
        it('can remove its own pick — nothing else holds it', () => {
            expect(
                states('erp-sync', [ERP], { 'erp-sync': ['AssetsSDK'] }).get('AssetsSDK')?.ownership
            ).toBe('mine-optional');
        });

        it('still cannot remove its own catalog requirement', () => {
            expect(states('erp-sync', [ERP]).get('ErpSDK')?.ownership).toBe('mine-required');
        });
    });

    // Pre-attribution picks have an unrecoverable owner. They must still lock the
    // code — something wanted it — but they cannot name an integration.
    it('treats unattributed picks as other-required with no name', () => {
        expect(states('erp-sync', [ERP], { __existing__: ['AssetsSDK'] }).get('AssetsSDK')).toEqual(
            { code: 'AssetsSDK', ownership: 'other-required', requiredBy: [] }
        );
    });

    it("is unaffected by an unknown componentId (every row reads as another owner's)", () => {
        const map = states('does-not-exist');

        expect(map.get('ErpSDK')?.ownership).toBe('other-required');
        expect(map.get('LoyaltySDK')?.ownership).toBe('other-required');
    });
});
