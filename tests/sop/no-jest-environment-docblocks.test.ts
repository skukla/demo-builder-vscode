/**
 * No test file chooses its own jest environment with a `@jest-environment` docblock.
 *
 * WHY THIS EXISTS. The docblock works for jest and silently defeats mutation testing.
 * Stryker measures per-test coverage through an environment of its own, substituted
 * for the project's `testEnvironment` at run time; a per-file docblock names PLAIN
 * `jsdom` and bypasses that substitution, so the run reports "Missing coverage
 * results" and fails. Found 2026-09-03 when the React layer was first measured: 61
 * test files carried one, and every module they covered failed inside Stryker, one
 * after another, with a stack trace that named none of this.
 *
 * Forty-three of the 61 were redundant — the file was already in the jsdom project by
 * `testMatch`. The other eighteen were load-bearing: feature hook suites named
 * `use*.test.ts`, which the extension rule handed to node. Those are now placed by a
 * rule in `jest.config.js`, which is where the decision belongs: made once, read by
 * jest AND by `scripts/mutationScope.mjs` through jest's own matcher, so the two
 * cannot disagree.
 *
 * WHAT THIS CANNOT DO: it cannot tell you a file is in the WRONG project. A React
 * suite matched by the node project fails at run time on `document is not defined`,
 * which is loud; this suite exists for the failure that is quiet.
 */
import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(__dirname, '..', '..');
const TESTS = join(ROOT, 'tests');
// A real docblock line: comment leader, the tag, an environment name. Anchored so
// that MENTIONING the tag in prose — as this file's own header does — is not a hit.
const DOCBLOCK = /^\s*\*\s*@jest-environment\s+\S+/m;

function testFiles(dir: string): string[] {
    const out: string[] = [];
    // See the note in no-credential-shaped-fixtures: one syscall instead of two, so a
    // probe directory another suite deletes mid-walk cannot fail this run. It did fail
    // one, on 2026-09-06 — a concurrent session's tests/tmp-probe went between the
    // readdir and the stat, and the pre-push gate refused a push for it.
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch {
        return out;
    }
    for (const entry of entries) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...testFiles(p));
        else if (/\.test\.tsx?$/.test(entry.name)) out.push(p);
    }
    return out;
}

describe('no test file chooses its own jest environment', () => {
    const files = testFiles(TESTS);

    it('CONTROL: the walk finds the suite tree', () => {
        // An empty list would pass the check below vacuously.
        expect(files.length).toBeGreaterThan(500);
        expect(files.some((f) => f.endsWith('useActivateOnKey.test.ts'))).toBe(true);
    });

    it('CONTROL: the pattern matches the docblock it bans', () => {
        expect(DOCBLOCK.test(' * @jest-environment jsdom')).toBe(true);
        expect(DOCBLOCK.test(' * jest environment: jsdom')).toBe(false);
    });

    it('no @jest-environment docblock anywhere under tests/', () => {
        const offenders = files
            .filter((f) => DOCBLOCK.test(readFileSync(f, 'utf8')))
            .map((f) => relative(ROOT, f));
        // If one is genuinely needed, place the file by a rule in jest.config.js instead
        // — see the node project's testMatch exclusions for the pattern.
        expect(offenders).toEqual([]);
    });
});
