/**
 * The per-type lines an import shows — while it runs, and once it finishes.
 *
 * These had no test of their own. The expression that built them lived twice,
 * byte-identical, in `WatchProgress` (in-flight) and `terminalResult`
 * (finished), and nothing asserted either copy. That went unnoticed while both
 * printed a raw code; it stopped being safe the moment they printed a name,
 * because a missed copy would show the code for the whole duration of an import
 * and the name only at the end — the half-converted state nobody would report
 * as a bug, only as "it looked odd for a while".
 *
 * So the shared function is pinned here, at the seam both views now call.
 */

import { describePerType } from '@/features/data-installer/ui/components/importResult';
import type { DataTypeStatus } from '@/features/data-installer/types';

function record(perType: Record<string, DataTypeStatus>): Record<string, DataTypeStatus> {
    return perType;
}

describe('describePerType', () => {
    it('pairs each data type with the state the service reports', () => {
        const lines = describePerType(record({ categories: 'success' as DataTypeStatus }));

        expect(lines).toEqual(['Categories: success']);
    });

    /** The reason this function exists as one function rather than two copies. */
    it('names the type rather than printing its code', () => {
        const lines = describePerType(
            record({ customer_groups: 'success' as DataTypeStatus }),
        );

        expect(lines).toEqual(['Customer groups: success']);
        expect(lines[0]).not.toContain('_');
    });

    it('keeps every type, in the order the record carries them', () => {
        const lines = describePerType(
            record({
                categories: 'success' as DataTypeStatus,
                products: 'failed' as DataTypeStatus,
            }),
        );

        expect(lines).toEqual(['Categories: success', 'Products: failed']);
    });

    it('returns nothing for a job that has reported no type yet', () => {
        expect(describePerType(record({}))).toEqual([]);
    });

    /**
     * The finished view narrows to what needs attention: on a partial run the
     * successes are the noise, and the short list is what keeps the result
     * inside StatusDisplay's fixed box.
     */
    describe('troubledOnly', () => {
        const mixed = record({
            categories: 'success' as DataTypeStatus,
            products: 'failed' as DataTypeStatus,
            customer_groups: 'skipped' as DataTypeStatus,
        });

        it('drops the types that succeeded', () => {
            expect(describePerType(mixed, { troubledOnly: true })).toEqual([
                'Products: failed',
                'Customer groups: skipped',
            ]);
        });

        it('keeps every type when it is not asked for', () => {
            expect(describePerType(mixed)).toHaveLength(3);
            expect(describePerType(mixed, { troubledOnly: false })).toHaveLength(3);
        });

        it('returns nothing when every type succeeded', () => {
            const allGood = record({ categories: 'success' as DataTypeStatus });

            expect(describePerType(allGood, { troubledOnly: true })).toEqual([]);
        });
    });
});
