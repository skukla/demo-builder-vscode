/**
 * SOP Compliance Test: a per-test timeout must not undercut the file's budget
 *
 * A per-test argument — `it('...', async () => {...}, 10000)` — OVERRIDES a
 * file-level `jest.setTimeout(N)` even when it is LOWER. Nothing about that is
 * visible at either site: the `jest.setTimeout` line reads as authoritative and
 * the argument reads as a local raise.
 *
 * That cost a real failure. `processCleanup.timeout.test.ts` carried
 * `jest.setTimeout(30_000)` and a comment explaining why 10s was not enough,
 * while four `}, 10000)` / `}, 15000)` arguments underneath kept the actual
 * budget at 10s. The suite does 9.6s of real child-process work, so it ran with
 * 0.4s of headroom and timed out under full-suite load on 2026-08-10 while
 * passing in isolation.
 *
 * The rule is deliberately narrow: only a per-test value BELOW the file budget
 * is a violation. Raising above it is a legitimate local exception, and a file
 * with no `jest.setTimeout` has nothing to contradict.
 *
 * Sibling of no-bare-sleep.test.ts and magic-timeouts.test.ts. Note what this
 * rule is NOT: it does not push jest budgets towards the `TIMEOUTS` constants.
 * A `TIMEOUTS` value states how long the extension waits; a jest budget states
 * how long a loaded machine may take to run a test. They change for unrelated
 * reasons, which is why the other two SOP tests scan `src/` and this one scans
 * `tests/`.
 */

import * as fs from 'fs';
import * as path from 'path';

const TESTS = path.resolve(__dirname, '..');

/**
 * `jest.setTimeout(30_000)` as a STATEMENT — numeric separators allowed.
 *
 * Anchored to the start of the line, which is where a real budget always sits.
 * Unanchored, the pattern also matched the string literals in this file's own
 * fixtures (`findFileBudget(['jest.setTimeout(30_000);'])`) and attributed a
 * phantom 30s budget to the file testing the rule.
 */
const FILE_BUDGET = /^\s*jest\.setTimeout\((\d[\d_]*)\)/;

/**
 * A comment line, so prose ABOUT a budget is not mistaken for one.
 *
 * This file's own docblock names `jest.setTimeout(30_000)` while the file sets
 * no budget at all, and a perf sweep duly attributed a 30s budget to it. Left
 * unfixed, any file discussing the rule would inherit a phantom budget and have
 * its legitimate per-test values flagged against it.
 */
const COMMENT_LINE = /^\s*(\/\/|\/\*|\*)/;

/**
 * The file's jest budget, or undefined when it sets none.
 *
 * @param lines - the file's lines
 * @returns the budget in ms
 */
function findFileBudget(lines: string[]): number | undefined {
    for (const line of lines) {
        if (COMMENT_LINE.test(line)) continue;
        const hit = FILE_BUDGET.exec(line);
        if (hit) return Number(hit[1].replace(/_/g, ''));
    }
    return undefined;
}

/** A line closing a call with a trailing numeric argument: `}, 10000);`. */
const CLOSING_ARG = /^(\s*)\}, (\d+)\);/;

/** `it(`, `test(`, `it.each(...)(`, and the `.only` / `.skip` variants. */
const TEST_OPENER = /^(\s*)(it|test)(\.\w+)?(\([^)]*\))?\s*[(`]/;

interface Violation {
    file: string;
    line: number;
    perTest: number;
    fileBudget: number;
}

/**
 * Find per-test timeout arguments in one file's lines.
 *
 * A closing `}, N);` is only a per-test argument when it belongs to an
 * `it`/`test` call, so this walks back for the nearest opener at the SAME
 * indentation. Without that anchor a `setTimeout(fn, 100)` callback closing on
 * its own line looks identical — `progressUnifier/configDriven.test.ts` has
 * seventeen of those and not one real per-test argument.
 *
 * @param lines - the file's lines
 * @returns line number (1-indexed) and value for each per-test argument
 */
function findPerTestTimeouts(lines: string[]): Array<{ line: number; value: number }> {
    const found: Array<{ line: number; value: number }> = [];

    lines.forEach((line, i) => {
        const close = CLOSING_ARG.exec(line);
        if (!close) return;
        const indent = close[1];

        for (let j = i - 1; j >= 0; j--) {
            const candidate = lines[j];
            const open = TEST_OPENER.exec(candidate);
            if (open && open[1] === indent) {
                found.push({ line: i + 1, value: Number(close[2]) });
                return;
            }
            // Dedented past the block we are closing — this is not our opener.
            const width = candidate.length - candidate.trimStart().length;
            if (candidate.trim() && width < indent.length) return;
        }
    });

    return found;
}

function walk(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) return walk(full);
        return /\.test\.tsx?$/.test(e.name) ? [full] : [];
    });
}

describe('SOP: no per-test timeout below the file budget', () => {
    const files = walk(TESTS);

    it('finds no per-test timeout that undercuts its file', () => {
        const violations: Violation[] = [];

        for (const file of files) {
            const lines = fs.readFileSync(file, 'utf-8').split('\n');
            const fileBudget = findFileBudget(lines);
            if (fileBudget === undefined) continue;

            for (const hit of findPerTestTimeouts(lines)) {
                if (hit.value < fileBudget) {
                    violations.push({
                        file: path.relative(TESTS, file),
                        line: hit.line,
                        perTest: hit.value,
                        fileBudget,
                    });
                }
            }
        }

        expect(violations).toEqual([]);
    });

    it('scans a corpus big enough to be worth scanning', () => {
        // A walk that silently returned nothing would make the check above
        // vacuously pass — the failure mode this whole file exists to prevent.
        expect(files.length).toBeGreaterThan(500);
    });

    it('still recognises the pattern it is meant to catch', () => {
        // The exact shape from processCleanup.timeout.test.ts before the fix.
        const planted = [
            "    describe('Graceful Timeout', () => {",
            "        it('should kill process that ignores SIGTERM', async () => {",
            '            expect(() => process.kill(pid, 0)).toThrow();',
            '        }, 10000);',
            '    });',
        ];

        expect(findPerTestTimeouts(planted)).toEqual([{ line: 4, value: 10000 }]);
    });

    it('does not mistake a setTimeout callback for a per-test timeout', () => {
        // The false-positive class: a deferral closing on its own line, deeper
        // than any `it(`. Flagging these would make the rule unusable.
        const callback = [
            "        it('debounces', async () => {",
            '            const timer = setTimeout(() => {',
            '                run();',
            '            }, 100);',
            '            await flush();',
            '        });',
        ];

        expect(findPerTestTimeouts(callback)).toEqual([]);
    });

    it('reads a budget from code but not from prose', () => {
        // This very file names jest.setTimeout(30_000) in its docblock and sets
        // no budget. A whole-source regex attributed 30s to it, which would make
        // any legitimate per-test value here a violation.
        expect(
            findFileBudget([' * carried `jest.setTimeout(30_000)` and a comment'])
        ).toBeUndefined();
        expect(findFileBudget(['// jest.setTimeout(5000);'])).toBeUndefined();
        expect(findFileBudget(['jest.setTimeout(30_000);'])).toBe(30_000);
        expect(findFileBudget(['jest.setTimeout(5000);'])).toBe(5000);
    });

    it('reads a budget from a statement but not from a string literal', () => {
        // The fixtures above are themselves lines containing the pattern. An
        // unanchored match read them as budgets, so this file — which sets none
        // — reported a 30s one.
        expect(
            findFileBudget(["expect(findFileBudget(['jest.setTimeout(30_000);']))"])
        ).toBeUndefined();
        expect(findFileBudget(fs.readFileSync(__filename, 'utf-8').split('\n'))).toBeUndefined();
    });

    it('leaves a per-test timeout that RAISES the budget alone', () => {
        // A local exception above the file budget is legitimate; only undercuts
        // are violations. Asserted through the same comparison the scan uses.
        const hits = findPerTestTimeouts([
            "    it('slow one', async () => {",
            '        await realWork();',
            '    }, 60000);',
        ]);

        expect(hits).toEqual([{ line: 3, value: 60000 }]);
        expect(hits.filter((h) => h.value < 30_000)).toEqual([]);
    });
});
