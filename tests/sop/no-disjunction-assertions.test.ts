/**
 * An assertion may not be a disjunction: `expect(a || b).toBe(true)`.
 *
 * It passes when EITHER side holds, so it cannot say which happened — and a
 * change that flips the outcome from one side to the other keeps it green.
 *
 * PL-48 found three of these by reading five test files, and two of the three
 * were hiding something:
 *
 *   - `expect(result.timedOut || result.cancelled || result.result).toBeTruthy()`
 *     sat above a comment explaining that `withTimeout` ignores an AbortSignal
 *     that is already aborted. It documented a REAL DEFECT rather than failing
 *     on it, and that defect reached a thirty-minute timeout on project
 *     creation: a build the user had cancelled reported a timeout instead.
 *   - `expect(hasResolving || hasFetching).toBe(true)` claimed milestone
 *     percentages were matched while accepting either one. Both are emitted by
 *     the test's own mock, so a matcher that stopped after the first pattern
 *     passed. Replaced with the exact list, which passed first time — the code
 *     was always doing more than the test asked.
 *   - `expect(result.timedOut || result.result === undefined).toBe(true)` for a
 *     zero timeout, under a comment reading "accept either result".
 *
 * WHEN THE EITHER/OR IS REAL, COLLECT AND ASSERT EMPTY. The fourth case was a
 * genuine property — every write belongs under the root OR under `<root>/.claude`
 * — and the disjunction was still the wrong shape, because per-item it fails
 * with "expected true, got false" and never names the item. Filtering to the
 * strays and asserting `toStrictEqual([])` proves the same thing and prints the
 * path that broke it. That form is used throughout `tests/sop/`.
 *
 * NARROW ON PURPOSE. Only a disjunction whose result is asserted true is banned.
 * `expect(a && b)`, a disjunction inside a `.filter()`, and a disjunction
 * computed into a named variable that is then asserted about something else are
 * all untouched — this rule is about an assertion that cannot fail, not about
 * the `||` operator.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const TESTS = join(ROOT, 'tests');
const SELF = 'tests/sop/no-disjunction-assertions.test.ts';

/** `expect( … || … ).toBe(true)` or `.toBeTruthy()` */
const DISJUNCTION = /expect\([^)]*\|\|[^)]*\)\s*\.\s*(?:toBe\(\s*true\s*\)|toBeTruthy\(\))/;

function testFiles(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) out.push(...testFiles(p));
        else if (/\.test\.tsx?$/.test(name)) out.push(p);
    }
    return out;
}

function offenders(): { file: string; line: number; text: string }[] {
    const hits: { file: string; line: number; text: string }[] = [];
    for (const file of testFiles(TESTS)) {
        const rel = file.slice(ROOT.length + 1);
        if (rel === SELF) continue; // this file quotes the shape it bans
        readFileSync(file, 'utf8')
            .split('\n')
            .forEach((text, i) => {
                if (DISJUNCTION.test(text))
                    hits.push({ file: rel, line: i + 1, text: text.trim() });
            });
    }
    return hits;
}

describe('no disjunction assertions', () => {
    it('CONTROL: the detector fires on both forms', () => {
        expect(DISJUNCTION.test('expect(a || b).toBe(true);')).toBe(true);
        expect(DISJUNCTION.test('expect(x.timedOut || x.cancelled).toBeTruthy();')).toBe(true);
    });

    it('CONTROL: it leaves a conjunction and a plain assertion alone', () => {
        expect(DISJUNCTION.test('expect(a && b).toBe(true);')).toBe(false);
        expect(DISJUNCTION.test('expect(result.cancelled).toBe(true);')).toBe(false);
    });

    it('CONTROL: it leaves a disjunction that is NOT the assertion alone', () => {
        // The operator is fine; asserting its result true is what cannot fail.
        expect(DISJUNCTION.test('const stray = items.filter((d) => a || b);')).toBe(false);
        expect(DISJUNCTION.test('expect(a || b).toBe(false);')).toBe(false);
    });

    it('no assertion accepts either of two outcomes', () => {
        expect(offenders()).toStrictEqual([]);
    });
});
