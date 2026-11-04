/**
 * The line under a datapack step: how many of its data types are finished, and the
 * ones in flight. One wording for creation, Reset's removal, the datapack's own modal
 * and the notification it hands over to (progress vocabulary slice 5, owner
 * 2026-10-16): a count of items goes on line 2, never as the step's position.
 */

import { phaseLine, typesLine } from '@/features/data-installer/services/datapackTypesLine';

describe('typesLine', () => {
    it('counts the finished types and names the ones in flight', () => {
        expect(typesLine(3, 14, ['Products', 'Categories'])).toBe('3 of 14 data types: Products, Categories');
    });

    it('is the count alone between types', () => {
        expect(typesLine(3, 14, [])).toBe('3 of 14 data types');
    });

    it('says one type in the singular', () => {
        expect(typesLine(0, 1, ['Products'])).toBe('0 of 1 data type: Products');
    });
});

// A run through its reads in a fixed order (a save's read, the clearing's check; owner, 2026-11-04).
describe('phaseLine', () => {
    const PHASES = [['products', 'giftcards'], ['categories'], ['b2b_companies']];

    it('counts the types of the reads before this one as done, and names this one', () => {
        expect(phaseLine(PHASES, 0)).toBe('0 of 4 data types: Products, Gift Cards');
        expect(phaseLine(PHASES, 2)).toBe('3 of 4 data types: B2B Companies');
    });

    it('is the count alone past the last read', () => {
        expect(phaseLine(PHASES, 3)).toBe('4 of 4 data types');
    });
});
