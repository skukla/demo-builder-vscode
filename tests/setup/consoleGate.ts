/**
 * The console gate (ADR-016) — a green run comes to MEAN a clean run.
 *
 * Measured 2026-08-28: a fully passing suite emitted 355 `act()` warnings, 72
 * React prop warnings and 700+ console error/warn lines. All of it invisible
 * to CI, because passing tests are allowed to shout. This gate fails any test
 * that writes to `console.error`/`console.warn` unless its SUITE is named in
 * `console-allowlist.json` — the burn-down ledger for PL-15, which may only
 * shrink.
 *
 * Two modes:
 *   normal            — an unlisted suite emitting output FAILS the test
 *   CONSOLE_GATE=collect — records offenders to `console-gate-offenders.txt`
 *                     instead of failing (how the allowlist was seeded, and
 *                     how it is re-seeded after a big change)
 *
 * Deliberate design notes:
 * - Allowlisting is per SUITE FILE, not per test: the ledger stays readable
 *   and a cleaned suite leaves in one line.
 * - A suite that installs its OWN console spy replaces this wrapper, so the gate
 *   sees nothing — deliberate: a suite accounting for its own logging has
 *   absorbed it. BUT THE HOOK MATTERS, and the original wording did not say so:
 *   this gate wraps console in a `beforeEach` registered by the setup file,
 *   which therefore runs FIRST. A spy installed in `beforeEach` replaces the
 *   gate's wrapper and is invisible to it, as intended — but one installed in
 *   `beforeAll` runs EARLIER, so the gate wraps the SPY and still counts every
 *   call. Two error-boundary suites suppressed console for years and were on the
 *   allowlist anyway; moving the spy to `beforeEach` was the whole fix.
 * - `console.log` is NOT gated. Tests legitimately print (the file-size suite
 *   prints its own report); it is errors and warnings that indicate a defect.
 */

import { appendFileSync, readFileSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(__dirname, '..', '..');
const OFFENDERS = join(ROOT, 'tests', 'setup', 'console-gate-offenders.txt');

const allowlist: Set<string> = (() => {
    try {
        const raw = readFileSync(join(__dirname, 'console-allowlist.json'), 'utf8');
        return new Set((JSON.parse(raw) as { suites: string[] }).suites);
    } catch {
        // No ledger yet (first seeding run) — allow everything, record nothing.
        return new Set<string>();
    }
})();

const collecting = process.env.CONSOLE_GATE === 'collect';

/** The suite's repo-relative path, the allowlist's key. */
function currentSuite(): string {
    const state = expect.getState();
    return state.testPath ? relative(ROOT, state.testPath) : '<unknown>';
}

let captured: string[] = [];
let originalError: typeof console.error;
let originalWarn: typeof console.warn;

beforeEach(() => {
    captured = [];
    originalError = console.error;
    originalWarn = console.warn;
    const capture =
        (original: (...args: unknown[]) => void) =>
        (...args: unknown[]): void => {
            captured.push(String(args[0] ?? '').slice(0, 200));
            original(...args);
        };
    console.error = capture(originalError) as typeof console.error;
    console.warn = capture(originalWarn) as typeof console.warn;
});

afterEach(() => {
    // Restore FIRST, so a failure below prints normally.
    console.error = originalError;
    console.warn = originalWarn;

    if (captured.length === 0) return;
    const suite = currentSuite();

    if (collecting) {
        try {
            appendFileSync(OFFENDERS, `${suite}\n`);
        } catch {
            /* seeding is best-effort; a lost line just means one more pass */
        }
        return;
    }

    if (allowlist.has(suite)) return;

    const sample = captured.slice(0, 3).join('\n  ');
    throw new Error(
        `Console output in a test that should be silent (ADR-016).\n` +
            `  suite: ${suite}\n  ${sample}\n` +
            `Fix the cause (await the update, stop spreading non-DOM props, or ` +
            `assert-and-absorb an expected error). Adding this suite to ` +
            `tests/setup/console-allowlist.json is only for pre-existing noise — ` +
            `that ledger may only shrink.`
    );
});
