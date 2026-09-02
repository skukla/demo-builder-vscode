/**
 * SOP Compliance Test: sleeps route through `sleep()`
 *
 * A bare `await new Promise(resolve => setTimeout(resolve, ms))` is unmockable. The
 * node jest project runs on REAL timers, so every one of them is waited through for
 * real — and the historical response was to raise `jest.setTimeout` rather than to
 * stop sleeping. On 2026-08-05 that cost 72s of a 58s suite across seven files, and
 * the same one-line helper had been privately redefined five times.
 *
 * Routing every sleep through `@/core/utils/sleep` makes the whole class mockable in
 * one line (`jest.mock('@/core/utils/sleep')`), which is what took the full run from
 * 58.4s to 17.3s. This test is what keeps it that way — the ratchet, not the cleanup.
 *
 * Sibling of magic-timeouts.test.ts: that one governs the VALUE of a delay (use a
 * TIMEOUTS constant, not a literal), this one governs the MECHANISM (use sleep(), not
 * a hand-rolled Promise). A line can violate either independently.
 *
 * @see src/core/utils/sleep.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '../../src');

/**
 * The sleep idiom: a Promise whose sole job is to resolve on a timer.
 *
 * Deliberately anchored on `setTimeout(<param>` where the param is the promise's own
 * resolve — a plain deferral like `setTimeout(() => doThing(), 100)` is NOT a sleep
 * and is none of this rule's business.
 */
const BARE_SLEEP = /new\s+Promise\s*\(\s*\(?\s*\w+\s*\)?\s*=>\s*\n?\s*setTimeout\(/;

/**
 * The single legitimate home of the idiom. Anything else added here needs a reason
 * that survives the question "why can this not be mocked?".
 *
 * Note what is NOT exempt: `processCleanup` genuinely needs real timers, but it gets
 * them by spawning real child processes and measuring real elapsed time — it never
 * hand-rolls a sleep, so it does not need an exemption.
 */
const ALLOWED = [path.join(SRC, 'core', 'utils', 'sleep.ts')];

function walk(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) return walk(full);
        return /\.tsx?$/.test(e.name) ? [full] : [];
    });
}

/**
 * SCOPE: `src/` ONLY, and that is a stated hole rather than an oversight.
 *
 * Measured 2026-09-02: 23 files under `tests/` contain a bare sleep. Most are
 * legitimate — fake-timer helpers, deliberate delays inside a mock, a polling
 * interval — so turning this on wholesale would be a project, not a fix.
 *
 * THE FOUR THAT MATTER ARE KNOWN, and all four are now fixed. Triaged by asking
 * which files sleep while holding a REAL resource — a spawned process, a bound
 * socket — with no fake timers to make the wait instant:
 *
 *   inExtensionMcpServer.test.ts              2 waits, now poll for a refused connection
 *   inExtensionMcpServer.socketOwnership.ts   1 wait, now polls for the successor answering
 *   processCleanup.error.test.ts              2 waits, now await the child's exit event
 *   processCleanup.test.ts                    1 wait, the parent now announces readiness
 *
 * Both suites that failed a full run that day were on that list, which is what
 * makes the triage worth repeating rather than the count worth watching: a bare
 * sleep beside a fake timer is free, and a bare sleep beside a real process is a
 * flake waiting for a busy afternoon.
 *
 * But the hole has a cost, and it was paid the same day: a flat
 * `setTimeout(50)` between disposing an MCP server and binding its successor
 * failed two full-suite runs while passing 8/8 in isolation, and nothing here
 * could see it because it lived in a test. It is now a poll for a refused
 * connection. If you are extending this check, that file is the worked example
 * of the difference between a guess and a signal.
 */
describe('SOP: sleeps route through the shared sleep()', () => {
    const files = walk(SRC).filter((f) => !ALLOWED.includes(f));

    it('finds no hand-rolled sleep in src/', () => {
        const violations: string[] = [];

        for (const file of files) {
            const lines = fs.readFileSync(file, 'utf-8').split('\n');
            lines.forEach((line, i) => {
                // Join with the next line so a wrapped call is still caught, but only
                // report the line the idiom STARTS on — otherwise the preceding line
                // gets blamed too and the reported line number sends you to the wrong
                // place, which is worse than not reporting it.
                if (!line.includes('new Promise')) return;
                const window = `${line}\n${lines[i + 1] ?? ''}`;
                if (BARE_SLEEP.test(window)) {
                    violations.push(`${path.relative(SRC, file)}:${i + 1}  ${line.trim()}`);
                }
            });
        }

        expect(violations).toEqual([]);
    });

    it('CONTROL: still recognises the idiom it is meant to catch', () => {
        // Without this, a broken regex would make the check above vacuously pass —
        // which is exactly how a guard rots into decoration.
        expect(BARE_SLEEP.test('await new Promise(resolve => setTimeout(resolve, 100));')).toBe(
            true
        );
        expect(BARE_SLEEP.test('await new Promise((r) => setTimeout(r, ms));')).toBe(true);
        expect(
            BARE_SLEEP.test('await new Promise((resolve) =>\n    setTimeout(resolve, ms),\n);')
        ).toBe(true);
    });

    it('leaves plain deferrals alone', () => {
        // A fire-and-forget setTimeout is not a sleep and must not be flagged.
        expect(BARE_SLEEP.test('setTimeout(() => refresh(), 100);')).toBe(false);
        expect(BARE_SLEEP.test('const t = setTimeout(onIdle, TIMEOUTS.UI.IDLE);')).toBe(false);
        // withTimeout races a rejection — also not a sleep.
        expect(
            BARE_SLEEP.test(
                'new Promise((_, reject) => { timer = setTimeout(() => reject(e), ms); })'
            )
        ).toBe(false);
    });

    it('exempts only sleep.ts itself', () => {
        expect(ALLOWED).toHaveLength(1);
        expect(fs.existsSync(ALLOWED[0])).toBe(true);
    });
});
