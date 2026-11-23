/**
 * The job window's shared words and settings (`importModalJob.ts`): how many columns a run's data
 * types take. Ported from `importModalView.test.ts` when the old window's view decisions went (step
 * 03, S7).
 */

import { runColumns, TWO_COLUMN_MIN_VIEWPORT } from '@/features/data-installer/ui/components/importModalJob';

describe('runColumns (walk F135)', () => {
    it('takes two columns for more than six data types in an editor wide enough', () => {
        expect(runColumns(7, TWO_COLUMN_MIN_VIEWPORT)).toBe(2);
        expect(runColumns(11, 1400)).toBe(2);
    });

    it('takes one column for six or fewer', () => {
        expect(runColumns(6, 1400)).toBe(1);
        expect(runColumns(1, 1400)).toBe(1);
    });

    it('takes one column in an editor too narrow for two', () => {
        expect(runColumns(11, TWO_COLUMN_MIN_VIEWPORT - 1)).toBe(1);
    });
});
