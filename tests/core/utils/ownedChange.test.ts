/**
 * decideOwnedChange — the one rule for "is this still as we left it?" (datapack-engine step 04).
 *
 * Given what was recorded when Demo Builder last wrote a thing, what is there now and what is
 * wanted, it answers what may happen to it. It only answers; each caller does its own read and
 * write, and decides what a change means for it (ADR-013 overwrites an unrecorded file once; a
 * DA.live template never does).
 *
 * Fingerprints are opaque strings here: equal means "the same content".
 */

import { decideOwnedChange, type OwnedState } from '@/core/utils/ownedChange';

const OURS = 'fingerprint-of-what-we-wrote';
const THEIRS = 'fingerprint-after-someone-edited-it';
const NEXT = 'fingerprint-of-what-we-want-now';

describe('decideOwnedChange', () => {
    describe('nothing is there', () => {
        it.each<[string, OwnedState, string]>([
            ['never written, wanted', { recorded: undefined, current: undefined, wanted: NEXT }, 'create'],
            // ADR-013 write matrix "absent | any → write": a deleted file is written again.
            ['written, since deleted, wanted', { recorded: OURS, current: undefined, wanted: NEXT }, 'create'],
            ['never written, not wanted', { recorded: undefined, current: undefined, wanted: undefined }, 'gone'],
            ['written, since deleted, not wanted', { recorded: OURS, current: undefined, wanted: undefined }, 'gone'],
        ])('%s: %s', (_, state, answer) => {
            expect(decideOwnedChange(state)).toBe(answer);
        });
    });

    describe('it is still as we left it', () => {
        it('is updated when something else is wanted', () => {
            expect(decideOwnedChange({ recorded: OURS, current: OURS, wanted: NEXT })).toBe('update');
        });

        it('is left untouched when it is already what is wanted', () => {
            expect(decideOwnedChange({ recorded: OURS, current: OURS, wanted: OURS })).toBe('unchanged');
        });

        it('is removed when it is no longer wanted', () => {
            expect(decideOwnedChange({ recorded: OURS, current: OURS, wanted: undefined })).toBe('remove');
        });
    });

    describe('someone else changed it since', () => {
        it.each<[string, string | undefined]>([
            ['something else is wanted', NEXT],
            ['it is no longer wanted', undefined],
            // Edited into exactly what we now want is still an edit: it is theirs now.
            ['their edit happens to be what is wanted', THEIRS],
        ])('is left when %s', (_, wanted) => {
            expect(decideOwnedChange({ recorded: OURS, current: THEIRS, wanted })).toBe('leave-edited');
        });
    });

    describe('there is no record that we wrote it', () => {
        it.each<[string, string | undefined]>([
            ['something is wanted', NEXT],
            ['it is not wanted', undefined],
            ['it already holds what is wanted', THEIRS],
        ])('is left as not provably ours when %s', (_, wanted) => {
            expect(decideOwnedChange({ recorded: undefined, current: THEIRS, wanted })).toBe('leave-not-ours');
        });
    });
});
