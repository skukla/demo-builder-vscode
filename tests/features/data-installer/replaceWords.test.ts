/**
 * The words for an import that replaces the demo's pack (walk F97): another save by its
 * datapack, never its id or when it was saved (Phase 2, owner 2026-11-12: the SC never manages
 * versions); another pack by its line; and nothing replaced by the same version or a pack with no
 * record.
 */

import { replacedName, replacesHeld } from '@/features/data-installer/replaceWords';

const IMPORTING = { name: 'luma', version: '20261109-141504' };

describe('replaceWords', () => {
    it('names another save of the same pack by the datapack, never by its id or when it was saved', () => {
        const held = { name: 'luma', version: '20261101-120000' };

        expect(replacedName(held, 'My Luma')).toBe('My Luma');
    });

    it('keeps a named version in the name of the pack replaced', () => {
        expect(replacedName({ name: 'luma', version: 'main' }, 'Luma')).toBe('Luma, main');
    });

    it('names another pack by its line', () => {
        const held = { name: 'luma-eds', version: 'eds-compatible' };

        expect(replacedName(held, 'Luma')).toBe('Luma, eds-compatible');
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
