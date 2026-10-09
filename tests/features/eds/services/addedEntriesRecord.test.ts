/**
 * addedEntriesRecord — the record of what a block library added to the
 * storefront's authoring files, and the sentence for what it left out (EDS-36).
 */

import {
    claimMissingEntry,
    createEntryTracker,
    describeEntriesRemovedByHand,
    mergeAddedEntries,
} from '@/features/eds/services/addedEntriesRecord';
import { toInstalledBlockLibrary } from '@/features/eds/services/installedBlockLibraryRecord';
import type { AddedComponentEntries, LibraryVersionInfo } from '@/types/blockLibraries';

const RECORD: AddedComponentEntries = {
    definition: ['hero'], sectionFilter: ['hero'], filters: [], models: [],
};

describe('claimMissingEntry', () => {
    it('adds an entry the library never added, and notes it', () => {
        const tracker = createEntryTracker();

        expect(claimMissingEntry(tracker, { name: 'Lib', addedEntries: RECORD }, 'definition', 'cards')).toBe(true);
        expect(tracker.added.get('Lib')?.definition).toEqual(['cards']);
        expect(tracker.removedByHand).toStrictEqual([]);
    });

    it('refuses an entry the library added before, and reports it as removed by hand', () => {
        const tracker = createEntryTracker();

        expect(claimMissingEntry(tracker, { name: 'Lib', addedEntries: RECORD }, 'sectionFilter', 'hero')).toBe(false);
        expect(tracker.removedByHand).toEqual([
            { library: 'Lib', file: 'component-filters.json', id: 'hero' },
        ]);
        expect(tracker.added.size).toBe(0);
    });

    it('names a stripped HTML example as such, not as a missing entry', () => {
        const tracker = createEntryTracker();
        const origin = { name: 'Lib', addedEntries: { ...RECORD, htmlExamples: ['hero'] } };

        expect(claimMissingEntry(tracker, origin, 'htmlExamples', 'hero')).toBe(false);
        expect(tracker.removedByHand).toEqual([
            { library: 'Lib', file: 'HTML example in component-definition.json', id: 'hero' },
        ]);
    });

    it('with no record, adds everything', () => {
        const tracker = createEntryTracker();

        expect(claimMissingEntry(tracker, { name: 'Lib' }, 'models', 'hero')).toBe(true);
    });
});

describe('mergeAddedEntries', () => {
    it('keeps the old ids, adds the new ones once', () => {
        expect(mergeAddedEntries(RECORD, { ...RECORD, definition: ['hero', 'cards'] })).toEqual({
            definition: ['hero', 'cards'], sectionFilter: ['hero'], filters: [], models: [],
        });
    });

    it('carries HTML examples only when there are some, so older records keep their shape', () => {
        expect(mergeAddedEntries(RECORD, { ...RECORD, htmlExamples: ['hero'] })).toEqual({
            ...RECORD, htmlExamples: ['hero'],
        });
        expect(mergeAddedEntries(RECORD, undefined)).toStrictEqual(RECORD);
    });

    it('is undefined when nothing was ever added', () => {
        expect(mergeAddedEntries(undefined, undefined)).toBeUndefined();
    });
});

describe('describeEntriesRemovedByHand', () => {
    it('says nothing when nothing was left out', () => {
        expect(describeEntriesRemovedByHand([])).toBeUndefined();
    });

    it('names each entry once, with the files it was missing from', () => {
        expect(
            describeEntriesRemovedByHand([
                { library: 'Lib', file: 'component-definition.json', id: 'hero' },
                { library: 'Lib', file: 'component-models.json', id: 'hero' },
                { library: 'Lib', file: 'component-filters.json', id: 'tabs' },
            ]),
        ).toBe(
            'Left out 2 block entries removed by hand: hero (component-definition.json, ' +
                'component-models.json); tabs (component-filters.json).',
        );
    });
});

describe('toInstalledBlockLibrary', () => {
    const version: LibraryVersionInfo = {
        name: 'Lib', source: { owner: 'o', repo: 'r', branch: 'main' }, commitSha: 'c', blockIds: ['hero'],
    };

    it('keeps the added entries, so creation and install write the same record', () => {
        expect(toInstalledBlockLibrary({ ...version, addedEntries: RECORD }, 'now')).toEqual({
            ...version, addedEntries: RECORD, installedAt: 'now',
        });
    });

    it('writes no added-entries field when nothing was added', () => {
        expect(toInstalledBlockLibrary(version, 'now')).toStrictEqual({ ...version, installedAt: 'now' });
    });
});
