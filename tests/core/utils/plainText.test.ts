/**
 * plainText — the one door failure text takes to a person (PL-102). Unknown text never passes
 * through `plainFailure`; `notYetPlain` is the named debt that does, translating what it knows.
 */

import {
    COULDNT_TELL,
    knownPlain,
    notYetPlain,
    plain,
    PlainError,
    plainFailure,
    plainLine,
    plainName,
    plainOf,
} from '@/core/utils/plainText';

const BLOB = 'repository lacks the necessary blob to perform 3-way merge';
const MERGE_LINE = "Couldn't merge the changes: the versions of the files the changes were made from aren't available.";

describe('plainFailure', () => {
    it('says a known cause in plain words', () => {
        expect(plainFailure(BLOB)).toBe(MERGE_LINE);
        expect(plainFailure(new Error('connect ETIMEDOUT 10.0.0.1:443'))).toBe('No answer came in time.');
    });

    it("never passes unknown text through: it says it couldn't tell (owner decision 2)", () => {
        expect(plainFailure('Request failed with status code 418')).toBe(COULDNT_TELL);
        expect(plainFailure(undefined)).toBe("Demo Builder couldn't tell what went wrong.");
    });

    it("prefers a PlainError's own sentence", () => {
        const error = new PlainError(plain("Couldn't find the storefront's repository."), 'GET /repos 404');
        expect(plainFailure(error)).toBe("Couldn't find the storefront's repository.");
        expect(error.message).toBe('GET /repos 404');
        expect(plainOf(new Error('x'))).toBeUndefined();
    });
});

describe('notYetPlain (the debt)', () => {
    it('translates what it knows and passes the rest through as it was', () => {
        expect(notYetPlain(BLOB)).toBe(MERGE_LINE);
        expect(notYetPlain('This list of updates is out of date.')).toBe('This list of updates is out of date.');
    });
});

describe('building plain sentences', () => {
    it('puts plain pieces into a written sentence', () => {
        expect(plainLine`Couldn't open ${plainName('Scratch 1028')}.`).toBe("Couldn't open Scratch 1028.");
    });

    it('knows nothing it was not taught', () => {
        expect(knownPlain('some new failure')).toBeUndefined();
    });
});
