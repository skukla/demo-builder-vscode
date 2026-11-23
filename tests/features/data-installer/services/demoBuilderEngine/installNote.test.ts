/**
 * The lines an install leaves on its data types' rows: only what Commerce refused. What the check
 * found is Verify's line, so it shows once (review, 2026-11-10).
 */

import { rowNotesOf } from '@/features/data-installer/services/demoBuilderEngine/installNote';
import type { SkippedRow } from '@/features/data-installer/services/demoBuilderEngine/kindContext';

const skipped = (kind: string, n: number): SkippedRow[] =>
    Array.from({ length: n }, (_, i) => ({ kind, key: `${kind}-${i}`, reason: 'refused' }));

describe('rowNotesOf', () => {
    it('says how many were not added, in the words of that data type (walk F221)', () => {
        expect(rowNotesOf([...skipped('products', 3), ...skipped('categories', 1)])).toEqual({
            products: "3 products weren't added.",
            categories: "1 category wasn't added.",
        });
    });

    it('CONTROL: leaves every row alone when nothing was refused', () => {
        expect(rowNotesOf(undefined)).toStrictEqual({});
        expect(rowNotesOf([])).toStrictEqual({});
    });
});
