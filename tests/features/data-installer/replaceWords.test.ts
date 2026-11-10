/**
 * The words for an import that replaces the demo's pack (walk F97, F101): another save by when it
 * was saved, never its id; another pack by its line; and nothing replaced by the same version or a
 * pack with no record.
 */

import { versionLabel } from '@/features/data-installer/packVersions';
import {
    replacedName,
    replacesHeld,
    replacesSentence,
} from '@/features/data-installer/replaceWords';

const IMPORTING = { name: 'luma', version: '20261109-141504' };

describe('replaceWords', () => {
    it('names another save of the same pack by when it was saved, never by its id', () => {
        const held = { name: 'luma', version: '20261101-120000' };

        expect(replacedName(held, IMPORTING, 'My Luma')).toBe(`My Luma, ${versionLabel(held.version)}`);
        const sentence = replacesSentence(held, IMPORTING, { held: 'My Luma', importing: 'My Luma' });
        expect(sentence).toBe(`Replaces this demo's data with the version from ${versionLabel(IMPORTING.version)}.`);
        expect(sentence).not.toContain('20261109');
    });

    it('names a named version of the same pack by its name', () => {
        const held = { name: 'luma', version: '20261101-120000' };

        expect(replacesSentence(held, { name: 'luma', version: 'main' }, { held: 'Luma', importing: 'Luma' })).toBe(
            "Replaces this demo's data with the main version."
        );
    });

    it('names another pack by its line, and the pack imported by its name', () => {
        const held = { name: 'luma-eds', version: 'eds-compatible' };

        expect(replacedName(held, IMPORTING, 'Luma')).toBe('Luma, eds-compatible');
        expect(replacesSentence(held, IMPORTING, { held: 'Luma', importing: 'My Luma' })).toBe(
            "Replaces this demo's datapack, Luma (eds-compatible)."
        );
    });

    it('replaces another pack or version Demo Builder installed', () => {
        expect(replacesHeld({ name: 'luma', version: '1' }, IMPORTING, true)).toBe(true);
        expect(replacesHeld({ name: 'bodea', version: IMPORTING.version }, IMPORTING, true)).toBe(
            true
        );
    });

    it('CONTROL: replaces nothing for the same version, a pack with no record, or no pack', () => {
        expect(replacesHeld(IMPORTING, IMPORTING, true)).toBe(false);
        expect(replacesHeld({ name: 'luma', version: '1' }, IMPORTING, false)).toBe(false);
        expect(replacesHeld(undefined, IMPORTING, true)).toBe(false);
    });
});
