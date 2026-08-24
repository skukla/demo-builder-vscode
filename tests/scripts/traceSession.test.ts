/**
 * CI guard for `scripts/trace-session.mjs`.
 *
 * The script and its modules are plain ESM `.mjs`, which this repo's jest
 * transform does not parse (`SyntaxError: Cannot use import statement outside a
 * module`) — the sibling precedent for testing an `.mjs` here is a `.test.mjs`
 * run by node, not a jest config change. So the 21 controls live in
 * `scripts/trace/selfTest.mjs` next to the parser, and this suite EXECUTES the
 * real entry point as a subprocess.
 *
 * That is deliberately stronger than importing the functions would be: it proves
 * the script actually runs — argument handling, module wiring, exit codes — not
 * merely that its parser works in isolation. The same reasoning the repo applies
 * to hooks, which are pinned by execution rather than by grepping their source
 * after one shipped doing nothing on every project ever generated.
 */

import { execFileSync } from 'child_process';
import * as path from 'path';

const SCRIPT = path.resolve(__dirname, '../../scripts/trace-session.mjs');

function run(args: string[]): { code: number; stdout: string; stderr: string } {
    try {
        const stdout = execFileSync(process.execPath, [SCRIPT, ...args], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        return { code: 0, stdout, stderr: '' };
    } catch (err) {
        const e = err as { status?: number; stdout?: string; stderr?: string };
        return { code: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
    }
}

describe('trace-session.mjs', () => {
    describe('--self-test (the parser controls)', () => {
        const result = run(['--self-test']);

        it('exits 0 with every control passing', () => {
            expect(result.stdout).not.toMatch(/\bFAIL\b/);
            expect(result.code).toBe(0);
        });

        it('runs a meaningful number of controls — a shrunken list passes vacuously', () => {
            const passes = (result.stdout.match(/PASS/g) ?? []).length;
            expect(passes).toBeGreaterThanOrEqual(21);
        });

        it('asserts the two PRIVACY properties by name', () => {
            // These are the checks that stop the reader retaining prompt
            // content, file paths or result bodies from transcripts that span
            // every project on the machine. Naming them here means deleting one
            // from the control list breaks CI rather than going unnoticed.
            expect(result.stdout).toContain('PRIVACY: no argument VALUE retained');
            expect(result.stdout).toContain('PRIVACY: no result BODY retained');
        });
    });

    describe('argument handling', () => {
        it('exits non-zero with usage when given no scope', () => {
            const r = run([]);
            expect(r.code).not.toBe(0);
            expect(r.stderr).toMatch(/Usage:/);
        });

        it('aborts on an unparseable --since rather than silently reading everything', () => {
            const r = run(['--all', '--since', 'not-a-date']);
            expect(r.code).not.toBe(0);
            expect(r.stderr).toMatch(/ABORT/);
        });

        it('aborts on a missing transcript rather than reporting a tidy zero', () => {
            // The `|| echo "none"` failure this repo's CLAUDE.md names: a broken
            // step must abort, not print a clean-looking empty result.
            const r = run([path.join(__dirname, 'does-not-exist.jsonl')]);
            expect(r.code).not.toBe(0);
            expect(r.stderr).toMatch(/ABORT/);
        });
    });
});
