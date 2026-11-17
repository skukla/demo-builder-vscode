/**
 * Installing a datapack the store already matches ends at "Bodea Is Up to Date" (owner walk Q8,
 * 2026-11-13), the same small result Restore and Update end on when there is nothing to do: one
 * `upToDateResult`, and one pure rule for when a preview says so (`isUpToDate`).
 */

import { kindChanges, MATCHING_PREVIEW } from '../../../../helpers/changePreviewFixtures';
import { isUpToDate, upToDateResult } from '@/features/data-installer/ui/components/importResult';

describe('upToDateResult', () => {
    it('is the small result named for the datapack', () => {
        expect(upToDateResult('Bodea')).toEqual({ variant: 'success', title: 'Bodea Is Up to Date', finished: true });
    });
});

describe('isUpToDate', () => {
    it('is up to date when Demo Builder installed it here and installing again changes nothing', () => {
        expect(isUpToDate(MATCHING_PREVIEW)).toBe(true);
    });

    it('counts rows the store already had, which installing leaves as they are, as nothing to do', () => {
        expect(isUpToDate({ installed: true, kinds: [kindChanges('products', { inStore: 4 })] })).toBe(true);
    });

    it.each([
        ['adds a row', { add: 1 }],
        ['updates rows', { update: 2 }],
        ['removes a row', { remove: 1 }],
        ['keeps an edit the SC made', { keep: 1 }],
    ])('is not up to date when installing %s', (_what, counts) => {
        expect(isUpToDate({ installed: true, kinds: [kindChanges('categories'), kindChanges('products', counts)] })).toBe(false);
    });

    it('is not up to date when Demo Builder never installed it here: the install records it', () => {
        expect(isUpToDate({ ...MATCHING_PREVIEW, installed: false })).toBe(false);
    });

    it('is not up to date when it would change store configuration', () => {
        const settings = { changes: ['catalog/frontend/grid_per_page: 12 → 24'] };
        expect(isUpToDate({ ...MATCHING_PREVIEW, settings })).toBe(false);
    });
});
