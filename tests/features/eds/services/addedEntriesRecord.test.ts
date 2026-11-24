/**
 * addedEntriesRecord — which block folders an install left out because the SC
 * removed them by hand, and the sentence that says so (EDS-36).
 */

import {
    claimMissingBlockFolder,
    createEntryTracker,
    describeEntriesRemovedByHand,
} from '@/features/eds/services/addedEntriesRecord';
import { toInstalledBlockLibrary } from '@/features/eds/services/installedBlockLibraryRecord';
import type { LibraryVersionInfo } from '@/types/blockLibraries';

describe('claimMissingBlockFolder', () => {
    it('copies a folder the library never copied', () => {
        const tracker = createEntryTracker();

        expect(claimMissingBlockFolder(tracker, { name: 'Lib', blockIds: ['hero'] }, 'cards')).toBe(true);
        expect(tracker.removedByHand).toStrictEqual([]);
    });

    it('refuses a folder the library copied before, and reports it as removed by hand', () => {
        const tracker = createEntryTracker();

        expect(claimMissingBlockFolder(tracker, { name: 'Lib', blockIds: ['hero'] }, 'hero')).toBe(false);
        expect(tracker.removedByHand).toEqual([
            { library: 'Lib', file: 'block folder blocks/hero', id: 'hero' },
        ]);
    });

    it('with no record, copies everything', () => {
        expect(claimMissingBlockFolder(createEntryTracker(), { name: 'Lib' }, 'hero')).toBe(true);
    });
});

describe('describeEntriesRemovedByHand', () => {
    it('says nothing when nothing was left out', () => {
        expect(describeEntriesRemovedByHand([])).toBeUndefined();
    });

    it('names each block once, with the places it was missing from', () => {
        expect(
            describeEntriesRemovedByHand([
                { library: 'Lib', file: 'block folder blocks/hero', id: 'hero' },
                { library: 'Lib', file: 'block folder blocks/tabs', id: 'tabs' },
            ]),
        ).toBe(
            'Left out 2 block entries removed by hand: hero (block folder blocks/hero); ' +
                'tabs (block folder blocks/tabs).',
        );
    });
});

describe('toInstalledBlockLibrary', () => {
    const version: LibraryVersionInfo = {
        name: 'Lib', source: { owner: 'o', repo: 'r', branch: 'main' }, commitSha: 'c', blockIds: ['hero'],
    };

    it('writes the record creation and install share, with no added-entries field', () => {
        expect(toInstalledBlockLibrary(version, 'now')).toStrictEqual({ ...version, installedAt: 'now' });
    });
});
