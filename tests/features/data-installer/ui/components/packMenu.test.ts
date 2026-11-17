/**
 * packMenu tests: what the flyout's actions say, apart from drawing them.
 *
 * Characterisation tests, written when these moved out of `PackActions` (step-04 R2). The drawn
 * behaviour stays pinned by `PackActions.test.tsx`; these pin each decision on its own.
 */

import type { DatapackDetail } from '@/features/data-installer/types';
import {
    confirmCopy,
    deletable,
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

    // Owner, 2026-11-14 (rule 1, reversibility): in the Datapack Library the mark can be taken off on
    // the screen, and put on, since no screen marked before. Only the SC's own pack: the store changes
    // the mark on the caller's own versions only.
    it('in the Datapack Library, offers Remove Demo Builder Mark on the SC\'s own Demo Builder datapack', () => {
        const own = makeDetail({ store: 'library', mine: true, team: true });
        expect(labels(packRows(own, false, true))).toEqual(['Save as File', 'Share', 'Remove Demo Builder Mark']);
    });

    it("in the Datapack Library, offers Mark as Demo Builder Datapack on the SC's own other pack", () => {
        const own = makeDetail({ store: 'library', mine: true });
        expect(labels(packRows(own, false, true))).toEqual(['Save as File', 'Share', 'Mark as Demo Builder Datapack']);
    });

    it("offers no mark row outside the Datapack Library, or on a colleague's pack", () => {
        expect(labels(packRows(makeDetail({ store: 'library', mine: true, team: true }), false))).toEqual([
            'Save as File',
            'Share',
        ]);
        expect(labels(packRows(makeDetail({ store: 'library', mine: false, team: true }), false, true))).toEqual([
            'Save as File',
        ]);
        expect(labels(packRows(makeDetail({ mine: true }), false, true))).toEqual(['Save as File']);
    });
});

describe('removeRows', () => {
    it('is empty when nothing can be removed', () => {
        expect(removeRows(false, false)).toStrictEqual([]);
    });

    // Bare verbs (decisions Phase 7, J8-3): the datapack is the menu's subject. Delete Store
    // Configuration is removed from the flyout (overview Phase 7).
    it('lists Uninstall, then Delete, and nothing else', () => {
        expect(removeRows(true, true).map((row) => row.key)).toEqual(['remove-data', 'remove']);
        expect(labels(removeRows(true, true))).toEqual(['Uninstall', 'Delete']);
    });

    // Owner, 2026-11-17: the two looked the same. An uninstall is undone by installing again; a
    // delete is for good, so only Delete keeps the trash can.
    it('draws Uninstall as taking data out, and only Delete as the trash can', () => {
        expect(removeRows(true, true).map((row) => row.icon)).toEqual(['uninstall', 'delete']);
    });
});

describe('deletable', () => {
    it("is the SC's own library datapack", () => {
        expect(deletable(makeDetail({ store: 'library', mine: true }))).toBe(true);
    });

    // Overview Phase 7: no one deletes a Demo Builder datapack from the flyout, its owner included.
    it("is never a Demo Builder datapack, even its owner's", () => {
        expect(deletable(makeDetail({ store: 'library', mine: true, team: true }))).toBe(false);
    });

    it("is never a colleague's datapack or a Data Installer one", () => {
        expect(deletable(makeDetail({ store: 'library', mine: false }))).toBe(false);
        expect(deletable(makeDetail({ mine: true }))).toBe(false);
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

    // Blue: neither deletes anything (rule 20).
    it('asks Remove Demo Builder Mark in blue, naming the datapack', () => {
        expect(confirmCopy('unmark', makeDetail({ team: true }))).toEqual({
            title: 'Remove the Demo Builder Mark?',
            actionLabel: 'Remove Mark',
            actionVariant: 'accent',
            children: 'Bodea goes back to being a regular datapack in the library, and can be deleted.',
        });
    });

    it('asks Mark as Demo Builder Datapack in blue, naming the datapack', () => {
        expect(confirmCopy('mark', makeDetail())).toEqual({
            title: 'Mark as a Demo Builder Datapack?',
            actionLabel: 'Mark',
            actionVariant: 'accent',
            children: "Bodea can't be deleted while it is a Demo Builder datapack.",
        });
    });

    // Overview Phase 7: the SC never sees a version, so the Delete line names none.
    it('deletes in red, saying "Permanently deletes it." with no version, plus the shared warning', () => {
        expect(confirmCopy('remove', makeDetail(), 'shared warning')).toEqual({
            title: 'Delete Bodea?',
            actionLabel: 'Delete',
            actionVariant: 'negative',
            children: ['Permanently deletes it.', 'shared warning'],
        });
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

    // Decisions J8-1 (owner, 2026-11-12): over another recorded datapack the button says it switches.
    it('reads Switch to with the name over another recorded datapack', () => {
        expect(mainButtonLabel(makeDetail(), false, true)).toBe('Switch to Bodea');
    });
});
