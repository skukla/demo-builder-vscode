/**
 * A test may not assert emptiness with `toEqual`.
 *
 * `toEqual` treats an ABSENT value and a PRESENT-but-empty one as the same
 * thing, in lists and in objects alike. `toStrictEqual` does not:
 *
 *     toEqual([undefined], [])          PASSES
 *     toEqual([], [undefined])          PASSES
 *     toEqual({ a: undefined }, {})     PASSES
 *     toStrictEqual([undefined], [])    fails
 *
 * So `expect(result).toEqual([])` is satisfied by a list holding one empty
 * entry, and `expect(result).toEqual({})` by an object whose every key is unset.
 *
 * PL-43: a goal session working `installHandler` found a real mutant surviving
 * behind exactly that — an assertion that a list came back empty, passing
 * against a list that held one empty entry.
 *
 * WHY THE WHOLE FORM IS BANNED RATHER THAN LEDGERED. `toStrictEqual` against an
 * empty literal is strictly stronger and never wrong: there is no case where a
 * test WANTS "empty, or holding one undefined". 834 assertions were switched on
 * 2026-09-07 and all 1,555 suites passed unchanged, so the stricter form costs
 * nothing. The suite had 3,150 lenient comparisons against 54 strict ones when
 * the defect was found; nothing but this rule stops that ratio returning.
 *
 * WHAT THE SWITCH DID NOT FIND, recorded so nobody re-runs it hoping for more:
 * no test failed, and the three densest-changed modules plus the three carrying
 * the most ledgered mutants all re-measured identically. Most of these compare
 * values that cannot contain an empty entry in the first place. The rule is
 * worth having because the failure is silent when it does happen, not because
 * it is happening everywhere.
 *
 * NON-EMPTY comparisons are untouched. `toEqual([1, 2])` is a normal deep
 * comparison and this rule says nothing about it.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const TESTS = join(ROOT, 'tests');
const SELF = 'tests/sop/no-lenient-emptiness.test.ts';

/** `.toEqual([])` and `.toEqual({})`, tolerating whitespace and line breaks. */
const LENIENT_EMPTY = /\.toEqual\(\s*(?:\[\s*\]|\{\s*\})\s*\)/g;

/**
 * Walk the test tree, tolerating entries that vanish mid-walk.
 *
 * Suites create and remove temporary directories under `tests/` while this runs,
 * so an entry listed by readdirSync can be gone by the statSync a line later —
 * which failed this enforcer on 2026-09-07 with an ENOENT for `tests/tmp-probe`.
 * A rule that fails because another suite was mid-cleanup is the exact flake
 * PL-41 exists to prevent, so a vanished entry is skipped rather than thrown on.
 */
function testFiles(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        let isDir: boolean;
        try {
            isDir = statSync(p).isDirectory();
        } catch {
            continue; // gone between the listing and the stat
        }
        if (isDir) out.push(...testFiles(p));
        else if (/\.test\.tsx?$/.test(name)) out.push(p);
    }
    return out;
}

function offenders(): { file: string; count: number }[] {
    const hits: { file: string; count: number }[] = [];
    for (const file of testFiles(TESTS)) {
        const rel = file.slice(ROOT.length + 1);
        if (rel === SELF) continue; // this file quotes the form it bans
        const n = readFileSync(file, 'utf8').match(LENIENT_EMPTY)?.length ?? 0;
        if (n) hits.push({ file: rel, count: n });
    }
    return hits.sort((a, b) => b.count - a.count);
}

describe('emptiness is asserted strictly', () => {
    it('CONTROL: jest really does treat the two forms differently', () => {
        // The premise of the whole rule, asserted rather than assumed.
        expect([undefined]).toEqual([]);
        expect({ a: undefined }).toEqual({});
        expect(() => expect([undefined]).toStrictEqual([])).toThrow();
    });

    it('CONTROL: the detector fires on both lenient forms', () => {
        expect('expect(x).toEqual([]);'.match(LENIENT_EMPTY)).toHaveLength(1);
        expect('expect(x).toEqual({});'.match(LENIENT_EMPTY)).toHaveLength(1);
    });

    it('CONTROL: it does not fire on the strict form or on a non-empty literal', () => {
        expect('expect(x).toStrictEqual([]);'.match(LENIENT_EMPTY)).toBeNull();
        expect('expect(x).toEqual([1, 2]);'.match(LENIENT_EMPTY)).toBeNull();
        expect('expect(x).toEqual({ a: 1 });'.match(LENIENT_EMPTY)).toBeNull();
    });

    it('no test asserts emptiness with toEqual', () => {
        expect(offenders()).toStrictEqual([]);
    });
});
