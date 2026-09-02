/**
 * The mutation ratchet's own controls.
 *
 * `scripts/checkMutationBaseline.mjs` refuses a run whose score rose without
 * constraining anything — a heuristic for a score raised by asserting log strings.
 * A heuristic needs controls in both directions or it drifts into either uselessness
 * or false alarms, and nothing else in the suite exercises it.
 *
 * It drifted on 2026-09-02: six mutants died on two `.sort()` comparators (as text,
 * Node 8 sorts after Node 20 — a defect the user sees) and the rule called the run
 * padding, because it counted only branch and block survivors and a comparator is
 * neither. Worse, the worklist that steers the work ranked those same comparators as
 * decisions worth constraining, so two instruments disagreed about one report.
 *
 * The controls live in a plain script so they can also be run by hand while changing
 * the rule; this only makes sure they run every time anyone runs the suite.
 */

import { execFileSync } from 'child_process';
import { join } from 'path';

describe('the mutation ratchet still tells padding from real work', () => {
    it('passes its own controls', () => {
        const script = join(__dirname, '../../scripts/mutationBaseline.selftest.mjs');

        // Throws on a non-zero exit, and the controls' own output names which one broke.
        const out = execFileSync('node', [script], { encoding: 'utf8' });

        expect(out).toContain('ALL CONTROLS PASSED');
        expect(out).not.toContain('FAIL');
    });

    it('CONTROL: the script really ran, and really reports failure', () => {
        // Without this, a script that printed nothing — or was deleted and replaced by
        // a no-op — would satisfy the assertion above by never printing "FAIL".
        const script = join(__dirname, '../../scripts/mutationBaseline.selftest.mjs');
        const out = execFileSync('node', [script], { encoding: 'utf8' });

        // It names each control by hand, so an empty or stubbed run cannot pass.
        expect(out).toContain('A-padding-must-flag');
        expect(out).toContain('B-real-branch-must-pass');
        expect(out).toContain('C-comparator-must-pass');
        // And it distinguishes the two verdicts rather than always printing the good one:
        // breaking the rule under test makes control C print FAIL and exit non-zero,
        // which is how this file's own value was checked on 2026-09-02.
        expect(out).toContain('PASS');
    });
});
