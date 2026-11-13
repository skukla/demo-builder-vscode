/**
 * packMenu tests: what the flyout's actions say, apart from drawing them.
 *
 * Characterisation tests, written when these moved out of `PackActions` (step-04 R2). The drawn
 * behaviour stays pinned by `PackActions.test.tsx`; these pin each decision on its own.
 */

import type { DatapackDetail } from '@/features/data-installer/types';
import {
    confirmCopy,
    mainButtonLabel,
    packRows,
    removeRows,
} from '@/features/data-installer/ui/components/packMenu';
import { SHARE_CONSENT } from '@/features/data-installer/shareWording';

function makeDetail(overrides: Partial<DatapackDetail> = {}): DatapackDetail {
    return {
        id: { name: 'bodea', version: 'main' },
        displayName: 'Bodea',
        shared: false,
        dataTypes: ['products'],
        art: {},
        ...overrides,
    };
}

const labels = (rows: { label: string }[]): string[] => rows.map((row) => row.label);

describe('packRows', () => {
    it('offers Save as File on any pack', () => {
        expect(labels(packRows(makeDetail(), false))).toEqual(['Save as File']);
    });

    it('adds Undo Last Save when there is a save to go back to', () => {
        expect(labels(packRows(makeDetail(), true))).toEqual(['Save as File', 'Undo Last Save']);
    });

    it("adds Share on the SC's own library pack, Stop Sharing once shared", () => {
        expect(labels(packRows(makeDetail({ store: 'library', mine: true }), false))).toEqual([
            'Save as File',
            'Share',
        ]);
        expect(
            labels(packRows(makeDetail({ store: 'library', mine: true, shared: true }), false))
        ).toEqual(['Save as File', 'Stop Sharing']);
    });

    it("offers no Share on someone else's library pack", () => {
        expect(labels(packRows(makeDetail({ store: 'library', mine: false }), false))).toEqual([
            'Save as File',
        ]);
    });
});

describe('removeRows', () => {
    it('is empty when nothing can be removed', () => {
        expect(removeRows(false, false, false)).toStrictEqual([]);
    });

    it('lists Uninstall, then Delete Datapack, then Delete Store Configuration', () => {
        expect(removeRows(true, true, true).map((row) => row.key)).toEqual([
            'remove-data',
            'remove',
            'remove-settings',
        ]);
        expect(labels(removeRows(true, true, true))).toEqual([
            'Uninstall',
            'Delete Datapack',
            'Delete Store Configuration',
        ]);
    });
});

describe('confirmCopy', () => {
    it('asks Undo in blue', () => {
        const copy = confirmCopy('undo', makeDetail());
        expect(copy).toMatchObject({
            title: 'Undo Last Save?',
            actionLabel: 'Undo',
            actionVariant: 'accent',
        });
    });

    it('asks Share with the consent line, and Stop Sharing once shared', () => {
        expect(confirmCopy('share', makeDetail())).toEqual({
            title: 'Share Bodea?',
            actionLabel: 'Share',
            actionVariant: 'accent',
            children: SHARE_CONSENT,
        });
        expect(confirmCopy('share', makeDetail({ shared: true }))).toMatchObject({
            title: 'Stop Sharing Bodea?',
        });
    });

    it('asks the store configuration delete in red', () => {
        expect(confirmCopy('remove-settings', makeDetail())).toMatchObject({
            title: "Delete Bodea's Store Configuration?",
            actionVariant: 'negative',
        });
    });

    it('deletes a named version by name, and a pack of saves whole', () => {
        expect(confirmCopy('remove', makeDetail(), 'shared warning').children).toEqual([
            'Permanently deletes version main.',
            'shared warning',
        ]);
        const saves = makeDetail({ id: { name: 'my-luma', version: '20261109-185605' } });
        expect(confirmCopy('remove', saves).children).toEqual([
            'Permanently deletes it.',
            undefined,
        ]);
    });
});

describe('mainButtonLabel', () => {
    it('reads Install, or Restore with the name on the installed version', () => {
        expect(mainButtonLabel(makeDetail(), false)).toBe('Install');
        expect(mainButtonLabel(makeDetail(), true)).toBe('Restore Bodea');
    });
});
