/**
 * A test may not put an UPPER bound on a wall-clock duration.
 *
 * PL-41: three suites failed `npm run gate` inside the pre-push hook on commits
 * that could not have caused it, including a docs-only one. The root cause was
 * measured on an idle 16-core machine — the full suite passes at every
 * maxWorkers setting, so the worker ratio was never it. The flakes needed two
 * things together: another run overlapping (a goal session's Stryker, or a
 * second gate), AND a test asserting that something finished within N
 * milliseconds. Starved of CPU, the assertion fails while the code is fine.
 *
 * A gate that fails for reasons unrelated to the change teaches people to re-run
 * rather than read, which is how a real failure gets waved through.
 *
 * WHY UPPER BOUNDS ONLY. Load makes things slower, never faster, so a LOWER
 * bound cannot flake under it: `expect(Date.now() - start).toBeGreaterThanOrEqual(20)`
 * on a sleep(20) is asserting real behaviour and stays true on a busy machine.
 * Only `toBeLessThan` on a measured duration is the failure mode.
 *
 * WHAT TO WRITE INSTEAD. Every one of the five assertions removed when this rule
 * landed had a behavioural claim underneath it, and in two cases that claim was
 * already asserted on the next line:
 *
 *   - "resolves immediately for a non-existent PID" -> assert no kill signal was
 *     sent, which is what "immediately" meant
 *   - "cache hit returns instantly" -> assert the hit returns the STORED object
 *     by identity, which is what "no work was redone" meant
 *   - "handles very high rate limits" -> assert all 100 calls resolve
 *   - "generates nonces efficiently" -> assert 1000 nonces are 1000 DISTINCT
 *     nonces, which is the security property; the timing version would have
 *     passed on a constant
 *
 * NOR MAY A MEASURED TIME BE CHECKED ONLY AGAINST ZERO (2026-11-06). `expect(duration)
 * .toBeGreaterThanOrEqual(0)` proves the field is there and nothing about its value, since a
 * difference of two clock readings is never negative. A datapack install reported coupons taking
 * 20.1 s and then 39.2 s, time that belonged to the check and the read-back after it, while
 * `timings.every((seconds) => seconds >= 0)` stayed green. Stub the clock and assert the value
 * (`engine-timings.test.ts`, `commandExecutor-basic-execution.test.ts`). A floor paired with an
 * upper bound on the next line is a different claim, "a duration and not a clock reading", and
 * is left alone.
 *
 * A DEADLINE IS NOT A PERFORMANCE BOUND, and the ledger below is for those. A
 * probe with a 30-second budget asserted to return inside 1 second is proving it
 * took the fast refusal path, not that the machine is quick — the 30x margin is
 * what makes it a deadline. Keep the margin an order of magnitude, and say in a
 * comment what the slow path would have cost.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const TESTS = join(ROOT, 'tests');

/**
 * Deliberate deadline assertions, each with the reason it is not a performance
 * bound. This list may only SHRINK: a new entry means a new way for the gate to
 * fail on a busy machine.
 */
const LEDGER: Record<string, string> = {
    'tests/features/ai/server/mcpSocketDiscovery.test.ts':
        'probeSocket is given a 30,000ms budget and asserted under 1,000ms — a 30x margin ' +
        'proving it took the ECONNREFUSED path instead of waiting the budget out.',
    'tests/features/ai/server/inExtensionMcpServer-callRecording.test.ts':
        'asserts a RECORDED durationMs is a duration and not a clock reading: >= 0 and ' +
        'under 10,000ms. The bound distinguishes the two, it does not time the call.',
};

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

/**
 * `expect(<name>).toBeLessThan(<number>)` where the subject reads like a duration.
 *
 * The bound must be a NUMERIC LITERAL. Comparing one measured value to another —
 * `expect(FIRST.afterMs).toBeLessThan(SECOND.afterMs)` — asserts an ordering
 * between two configured values and cannot flake on a busy machine, so it is not
 * what this rule is about.
 */
const UPPER_BOUND =
    /expect\(\s*([A-Za-z_$][\w$.]*)\s*\)\s*\.\s*toBeLessThan(?:OrEqual)?\(\s*[\d_.]+\s*\)/g;
/** `expect(Date.now() - started).toBeLessThan(...)` — measured inline. */
const INLINE_CLOCK =
    /expect\(\s*(?:Date\.now\(\)|performance\.now\(\))\s*-[^)]*\)\s*\.\s*toBeLessThan(?:OrEqual)?\(\s*[\d_.]+\s*\)/;
const DURATION_NAME = /^(elapsed|duration|took|delta|ms|spent|.*(Elapsed|Duration|Ms|Took))$/;

/** `expect(<x>).toBeGreaterThanOrEqual(0)`, or `.every((s) => s >= 0)`: a floor of zero and nothing else. */
const ZERO_FLOOR = /expect\((.+?)\)\s*\.\s*toBeGreaterThanOrEqual\(\s*0\s*\)|\.every\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*\2\s*>=\s*0\s*\)/;
/** What a measured time is called: the floor matters only on one. */
const TIME_WORD = /(duration|elapsed|seconds|timings|took)|\.at\b/i;

/** A zero floor on a time, with no upper bound beside it to make it a claim. */
function zeroFloorOnTime(lines: readonly string[], i: number): boolean {
    const m = ZERO_FLOOR.exec(lines[i]);
    if (!m || !TIME_WORD.test(m[1] ?? lines[i])) return false;
    return ![lines[i - 1], lines[i + 1]].some((near) => near?.includes('toBeLessThan'));
}

function offenders(): { file: string; line: number; text: string }[] {
    const hits: { file: string; line: number; text: string }[] = [];
    for (const file of testFiles(TESTS)) {
        const rel = file.slice(ROOT.length + 1);
        // This file QUOTES the pattern it bans, in its own documentation.
        if (rel === 'tests/sop/no-wall-clock-bounds.test.ts') continue;
        const lines = readFileSync(file, 'utf8').split('\n');
        lines.forEach((text, i) => {
            let flagged = INLINE_CLOCK.test(text) || zeroFloorOnTime(lines, i);
            for (const m of text.matchAll(UPPER_BOUND)) {
                if (DURATION_NAME.test(m[1])) flagged = true;
            }
            if (flagged && !(rel in LEDGER))
                hits.push({ file: rel, line: i + 1, text: text.trim() });
        });
    }
    return hits;
}

describe('no wall-clock upper bounds, and no floor of zero alone', () => {
    it('CONTROL: the detector fires on a duration assertion', () => {
        const sample = '            expect(duration).toBeLessThan(50);';
        const fired = [...sample.matchAll(UPPER_BOUND)].some((m) => DURATION_NAME.test(m[1]));

        expect(fired).toBe(true);
    });

    it('CONTROL: it does NOT fire on a lower bound, which cannot flake under load', () => {
        const sample = '            expect(Date.now() - start).toBeGreaterThanOrEqual(20);';

        expect(INLINE_CLOCK.test(sample)).toBe(false);
    });

    it('CONTROL: it does NOT fire on an ordinary numeric comparison', () => {
        const sample = '            expect(retries).toBeLessThan(5);';
        const fired = [...sample.matchAll(UPPER_BOUND)].some((m) => DURATION_NAME.test(m[1]));

        expect(fired).toBe(false);
    });

    it('CONTROL: it fires on a time checked only against zero, in both forms', () => {
        expect(zeroFloorOnTime(['expect(result.duration).toBeGreaterThanOrEqual(0);'], 0)).toBe(true);
        expect(zeroFloorOnTime(['expect(Object.values(timings).every((seconds) => seconds >= 0)).toBe(true);'], 0)).toBe(true);
    });

    it('CONTROL: it does NOT fire on a floor paired with a bound, or on an index found', () => {
        const paired = ['expect(duration).toBeGreaterThanOrEqual(0);', 'expect(duration).toBeLessThan(10_000);'];
        expect(zeroFloorOnTime(paired, 0)).toBe(false);
        expect(zeroFloorOnTime(['expect(envIndex).toBeGreaterThanOrEqual(0);'], 0)).toBe(false);
    });

    it('no test bounds a measured duration from above', () => {
        expect(offenders()).toStrictEqual([]);
    });

    it('every ledgered deadline still exists, so the list can only shrink', () => {
        const missing = Object.keys(LEDGER).filter((f) => {
            try {
                return !readFileSync(join(ROOT, f), 'utf8').includes('toBeLessThan');
            } catch {
                return true;
            }
        });

        expect(missing).toStrictEqual([]);
    });
});
