/**
 * The save question's name when the held datapack is not the SC's (step 03, S6; the owner's Q1
 * choice, following J7-2): it starts "My <Datapack>", or "My <Datapack> 2" when that is taken, and
 * an empty or taken name is refused with the house problem line.
 */

import { copyName, freeName, longestNameProblem, nameProblem } from '@/features/data-installer/saveAsName';

describe('freeName', () => {
    it('starts "My <Datapack>"', () => {
        expect(freeName('Bodea', [])).toBe('My Bodea');
    });

    it('counts on when that is taken, whatever its capitals', () => {
        expect(freeName('Bodea', ['my bodea'])).toBe('My Bodea 2');
        expect(freeName('Bodea', ['My Bodea', 'My Bodea 2'])).toBe('My Bodea 3');
    });
});

// Keep Both (step-07 F1, P4-Q10; decisions "Back on track"): the copy is numbered as J7-2 numbers a
// taken name, "My Luma 2" then "My Luma 3", never "My Luma Copy".
describe('copyName', () => {
    it('counts on from the name past the SC\'s datapacks, starting at 2', () => {
        expect(copyName('My Luma', ['My Luma'])).toBe('My Luma 2');
        expect(copyName('My Luma', ['my luma', 'My Luma 2'])).toBe('My Luma 3');
    });

    it('keeps the name when nobody has it', () => {
        expect(copyName('My Luma', ['My Bodea'])).toBe('My Luma');
    });
});

describe('nameProblem', () => {
    it('refuses an empty name', () => {
        expect(nameProblem('   ', [])).toBe('Give it a name.');
    });

    it('refuses a name the SC already has, whatever its capitals', () => {
        expect(nameProblem(' my luma ', ['My Luma'])).toBe('You already have a datapack named my luma.');
    });

    it('takes any other name', () => {
        expect(nameProblem('My Bodea', ['My Luma'])).toBeUndefined();
    });
});

// The room a name field keeps under it (rule 14): the longest refusal it could show.
describe('longestNameProblem', () => {
    it('is the empty-name line with no names taken, and the longest taken name\'s line otherwise', () => {
        expect(longestNameProblem([])).toBe('Give it a name.');
        expect(longestNameProblem(['Luma', 'Luma Holiday'])).toBe('You already have a datapack named Luma Holiday.');
    });
});
