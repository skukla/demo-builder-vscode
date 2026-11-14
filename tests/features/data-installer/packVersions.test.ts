/**
 * What a datapack's version says about it (walk F99): a save is shown by when it was saved, in the
 * SC's own time, never as its id; a named version as it is; and a pack's saves, newest first.
 */

import {
    datapackDate,
    isSavedVersion,
    packLine,
    newerVersion,
    originalSave,
    savedAt,
    savesOf,
    shownVersion,
    versionChanged,
    versionChoices,
    versionLabel,
} from '@/features/data-installer/packVersions';
import { savedVersion } from '@/features/data-installer/services/demoPack';
import type { DatapackSummary } from '@/features/data-installer/types';
import type { ProjectDatapack } from '@/types/datapack';

/** The label a save should get here, in whatever time zone the suite runs. */
const LOCAL = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
});

describe('packVersions', () => {
    it('reads when a save was made from its id, which is UTC to the second', () => {
        expect(savedAt('20261109-141504')?.toISOString()).toBe('2026-11-09T14:15:04.000Z');
    });

    it('shows a save by when it was saved, in the local time, never as its id', () => {
        const label = versionLabel('20261109-141504');

        expect(label).toBe(LOCAL.format(new Date('2026-11-09T14:15:04Z')));
        expect(label).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2} (AM|PM)$/u);
        expect(label).not.toContain('20261109');
    });

    it('CONTROL: shows a named version as it is, and reads no time from it', () => {
        expect(versionLabel('main')).toBe('main');
        expect(versionLabel('eds-compatible')).toBe('eds-compatible');
        expect(savedAt('main')).toBeUndefined();
        expect(isSavedVersion('main')).toBe(false);
    });

    it('lists a pack’s saves newest first, leaving its named versions out', () => {
        expect(savesOf(['20261108-163000', 'main', '20261109-185605', '20261109-141504'])).toEqual([
            '20261109-185605',
            '20261109-141504',
            '20261108-163000',
        ]);
    });

    it('leaves a save out of a pack’s line, which names the pack', () => {
        expect(packLine('My Luma', '20261109-141504')).toBe('My Luma');
        expect(packLine('Luma', 'eds-compatible')).toBe('Luma, eds-compatible');
    });
});

/** One version as the library lists it. */
function listed(version: string, at: Partial<DatapackSummary> = {}): DatapackSummary {
    return { id: { name: 'my-bodea', version }, displayName: 'My Bodea', shared: false, dataTypes: [], art: {}, ...at };
}

const INSTALLED = '20261101-090000';
const LATER = '20261103-120000';
const OWN: ProjectDatapack = { name: 'my-bodea', version: INSTALLED, store: 'library' };

describe('the one datapack date (step-04 S6, J8-2)', () => {
    it('writes every datapack date one absolute way, "Nov 10, 9:15 AM", from an ISO string or a Date', () => {
        const at = new Date('2026-11-10T09:15:00Z');

        expect(datapackDate('2026-11-10T09:15:00Z')).toBe(LOCAL.format(at));
        expect(datapackDate(at)).toBe(LOCAL.format(at));
        expect(datapackDate(at)).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2} (AM|PM)$/u);
    });

    it('writes nothing for a date it cannot read', () => {
        expect(datapackDate('not a date')).toBe('');
    });

    it('names a save on the card and the flyout "Saved" and its date, and a named version as it is', () => {
        expect(shownVersion(INSTALLED)).toBe(`Saved ${LOCAL.format(new Date('2026-11-01T09:00:00Z'))}`);
        expect(shownVersion('main')).toBe('main');
    });

    // P4-Q2 is open: the picker still shows; only its date words move to the one format.
    it('says when a named version last changed, its update before its creation, in the one format', () => {
        expect(versionChanged(listed('main', { createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-11-06T12:00:00Z' }))).toBe(
            `Updated ${LOCAL.format(new Date('2026-11-06T12:00:00Z'))}`,
        );
        expect(versionChanged(listed('main', { createdAt: '2026-10-01T12:00:00Z' }))).toBe(
            `Updated ${LOCAL.format(new Date('2026-10-01T12:00:00Z'))}`,
        );
    });

    it('says nothing for a version with no date', () => {
        expect(versionChanged(listed('main'))).toBeUndefined();
    });
});

describe('isSavedVersion', () => {
    it('knows a save by the version a save makes, and no named variant', () => {
        expect(isSavedVersion(savedVersion(new Date('2026-11-04T05:17:53Z')))).toBe(true);
        expect(['main', 'eds-compatible', 'import-form', '2026-11-04'].filter(isSavedVersion)).toStrictEqual([]);
    });
});

describe('newerVersion: what Update installs, and the amber dot (U1, J9-1)', () => {
    it("is the SC's own datapack's newest save, when newer than the one installed", () => {
        expect(newerVersion(OWN, [listed(INSTALLED, { mine: true }), listed(LATER, { mine: true })])).toBe(LATER);
    });

    // J9-1: Luma, a Demo Builder datapack updated in the library, lights the dot too (was dark, J4-1).
    it('is a Demo Builder datapack\'s newer save, whoever owns it', () => {
        expect(newerVersion(OWN, [listed(INSTALLED, { team: true }), listed(LATER, { team: true })])).toBe(LATER);
        expect(newerVersion(OWN, [listed(INSTALLED, { team: true, mine: true }), listed(LATER, { team: true, mine: true })])).toBe(LATER);
    });

    // Owner, 2026-11-09 (walk F88): Save As New moved the demo onto the save it made; nothing is newer.
    it('is none when the save installed is the newest, or the only other is older', () => {
        expect(newerVersion({ ...OWN, version: LATER }, [listed(INSTALLED, { mine: true }), listed(LATER, { mine: true })])).toBeUndefined();
        expect(newerVersion({ ...OWN, version: LATER }, [listed(INSTALLED, { mine: true })])).toBeUndefined();
    });

    it("is none for a colleague's datapack, a Data Installer pack, a named version, or another datapack", () => {
        expect(newerVersion(OWN, [listed(INSTALLED, { mine: false }), listed(LATER, { mine: false })])).toBeUndefined();
        expect(newerVersion({ ...OWN, store: 'installer' }, [listed(LATER, { mine: true })])).toBeUndefined();
        const main = listed('main', { mine: true, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z' });
        expect(newerVersion({ ...OWN, version: 'main' }, [main, listed(LATER, { mine: true })])).toBeUndefined();
        expect(newerVersion(OWN, [{ ...listed(LATER, { mine: true }), id: { name: 'other', version: LATER } }])).toBeUndefined();
        expect(newerVersion(OWN, [])).toBeUndefined();
    });
});

describe("originalSave: a datapack's first save, kept for good (U1, J9-6)", () => {
    it('is the oldest save, whatever the order listed, and never a named version', () => {
        expect(originalSave(['20261110-091500', 'main', '20261101-090000', '20261105-103000'])).toBe('20261101-090000');
    });

    it('is none for a datapack with no saves', () => {
        expect(originalSave(['main', 'eds-compatible'])).toBeUndefined();
    });
});

// Step-07 P4 (owner, P4-Q2 and S9): the card's picker, and the dashboard line's version, only when
// there are two or more to choose from. A pack's saves are one choice, the save on show.
describe('versionChoices', () => {
    it('lists the named versions, then one save', () => {
        expect(versionChoices(['main', '20261101-080000', 'eds-compatible', '20261105-080000'])).toEqual([
            'main',
            'eds-compatible',
            '20261101-080000',
        ]);
    });

    it('offers the save on show as the save', () => {
        expect(versionChoices(['main', '20261101-080000', '20261105-080000'], '20261105-080000')).toEqual(['main', '20261105-080000']);
    });

    it('has one choice for one named version, and for a pack of saves', () => {
        expect(versionChoices(['main'])).toHaveLength(1);
        expect(versionChoices(['20261101-080000', '20261105-080000'])).toHaveLength(1);
    });
});
