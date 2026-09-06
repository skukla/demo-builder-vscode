/**
 * meshHelpers — the balanced-bracket JSON scanner, and what decides which
 * bracket it scans for.
 *
 * `aio api-mesh:describe` prints JSON with CLI chatter around it, so this scanner
 * is what stands between real output and "no mesh found". The sibling suite covers
 * the ordinary shapes; this one covers the decisions inside the scan that a
 * well-formed line never exercises — a `[` that lives INSIDE the object, brackets
 * and quotes inside a string value, a backslash escape, nesting, and an array that
 * never closes. Each is a case where getting it wrong produces `null`, which every
 * caller reads as "there is no mesh".
 */

import { extractAndParseJSON, getMeshStatusCategory } from '@/features/mesh/utils/meshHelpers';

describe('getMeshStatusCategory — surrounding whitespace', () => {
    it('categorises a status the CLI padded with spaces and newlines', () => {
        expect(getMeshStatusCategory('  ACTIVE \n')).toBe('deployed');
        expect(getMeshStatusCategory('\tfailed  ')).toBe('error');
    });
});

describe('extractAndParseJSON — choosing between the array and the object', () => {
    it('reads the object when its own value happens to be an array', () => {
        expect(extractAndParseJSON('{"a":[1,2]}')).toEqual({ a: [1, 2] });
    });

    it('reads an array that starts after leading CLI output', () => {
        expect(extractAndParseJSON(' [1, 2]')).toEqual([1, 2]);
    });

    it('reads an object that starts after leading CLI output', () => {
        expect(extractAndParseJSON(' {"a":1}')).toEqual({ a: 1 });
    });

    it('falls through to the object when the array ahead of it never closes', () => {
        expect(extractAndParseJSON('[1,2 {"a":1}')).toEqual({ a: 1 });
    });

    /**
     * Not a string the CLI is typed to produce — but every caller passes the
     * `stdout` of a command result straight in, and this is the guard that makes a
     * command which produced no output read as "no mesh" instead of throwing.
     */
    it('returns null when there is no stdout at all', () => {
        expect(extractAndParseJSON(undefined as unknown as string)).toBeNull();
    });
});

describe('extractAndParseJSON — the balanced scan', () => {
    it('ignores a closing brace that lives inside a string value', () => {
        expect(extractAndParseJSON('{"a":"}"}')).toEqual({ a: '}' });
    });

    it('ignores an escaped quote, so the string it opens keeps running', () => {
        // The value is  x"}  — the escaped quote must NOT end the string, or the
        // brace behind it closes the object early and the parse fails.
        expect(extractAndParseJSON('{"a":"x\\"}","b":2}')).toEqual({ a: 'x"}', b: 2 });
    });

    it('returns the outermost object when objects nest', () => {
        expect(extractAndParseJSON('{"a":{"b":1}}')).toEqual({ a: { b: 1 } });
    });
});
