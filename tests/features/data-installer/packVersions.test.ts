/**
 * What a datapack's version says about it (walk F99): a save is shown by when it was saved, in the
 * SC's own time, never as its id; a named version as it is; and a pack's saves, newest first, are its
 * Version History.
 */

import {
    isSavedVersion,
    packLine,
    savedAt,
    savesOf,
    versionLabel,
} from '@/features/data-installer/packVersions';

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
