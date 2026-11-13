/**
 * What a datapack's version says about it (walk F99): a save is shown by when it was saved, in the
 * SC's own time, never as its id; a named version as it is; and a pack's saves, newest first.
 */

import {
    datapackDate,
    isSavedVersion,
    packLine,
    restoreIsNewer,
    restoreTargetVersion,
    savedAt,
    savesOf,
    shownVersion,
    versionChanged,
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

describe('restoreTargetVersion: what Restore installs (J4-1, J4-3)', () => {
    it("is the SC's own pack's newest save", () => {
        const mine = [listed(INSTALLED, { mine: true }), listed(LATER, { mine: true })];

        expect(restoreTargetVersion(OWN, mine)).toBe(LATER);
    });

    it('is the version installed for a team pack, a colleague\'s save, a Data Installer pack or a named version', () => {
        expect(restoreTargetVersion(OWN, [listed(INSTALLED, { mine: true, team: true }), listed(LATER, { mine: true, team: true })])).toBe(INSTALLED);
        expect(restoreTargetVersion(OWN, [listed(INSTALLED, { mine: false }), listed(LATER, { mine: false })])).toBe(INSTALLED);
        expect(restoreTargetVersion({ ...OWN, store: 'installer' }, [listed(LATER, { mine: true })])).toBe(INSTALLED);
        expect(restoreTargetVersion({ ...OWN, version: 'main' }, [listed('main', { mine: true }), listed(LATER, { mine: true })])).toBe('main');
    });

    it('is the version installed when the library lists nothing of the pack', () => {
        expect(restoreTargetVersion(OWN, [])).toBe(INSTALLED);
        expect(restoreTargetVersion(OWN, [{ ...listed(LATER, { mine: true }), id: { name: 'other', version: LATER } }])).toBe(INSTALLED);
    });
});

describe('restoreIsNewer: the amber dot, "Newer save available" (J4-1)', () => {
    it("is lit when the SC's own pack has a save newer than the one installed", () => {
        expect(restoreIsNewer(OWN, [listed(INSTALLED, { mine: true }), listed(LATER, { mine: true })])).toBe(true);
    });

    // Owner, 2026-11-09 (walk F88): Save As New moved the demo onto the save it made; nothing is newer.
    it('is dark when the save installed is the newest', () => {
        expect(restoreIsNewer({ ...OWN, version: LATER }, [listed(INSTALLED, { mine: true }), listed(LATER, { mine: true })])).toBe(false);
    });

    // Step-04 S6 (one rule with Restore): a named version changed in place no longer lights it, as
    // Restore installs the version installed. Was "Updated on Nov 9".
    it('is dark for a named version, changed since or not, and a team pack with a later save', () => {
        const main = listed('main', { mine: true, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z' });

        expect(restoreIsNewer({ ...OWN, version: 'main' }, [main])).toBe(false);
        expect(restoreIsNewer(OWN, [listed(INSTALLED, { team: true, mine: true }), listed(LATER, { team: true, mine: true })])).toBe(false);
    });

    it('is dark when the only other save listed is older than the one installed', () => {
        expect(restoreIsNewer({ ...OWN, version: LATER }, [listed(INSTALLED, { mine: true })])).toBe(false);
    });
});
