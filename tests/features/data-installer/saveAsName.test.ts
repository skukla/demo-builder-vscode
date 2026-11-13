/**
 * The save question's name when the held datapack is not the SC's (step 03, S6; the owner's Q1
 * choice, following J7-2): it starts "My <Datapack>", or "My <Datapack> 2" when that is taken, and
 * an empty or taken name is refused with the house problem line.
 */

import { freeName, longestNameProblem, nameProblem } from '@/features/data-installer/saveAsName';

describe('freeName', () => {
    it('starts "My <Datapack>"', () => {
        expect(freeName('Bodea', [])).toBe('My Bodea');
    });

    it('counts on when that is taken, whatever its capitals', () => {
        expect(freeName('Bodea', ['my bodea'])).toBe('My Bodea 2');
        expect(freeName('Bodea', ['My Bodea', 'My Bodea 2'])).toBe('My Bodea 3');
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
