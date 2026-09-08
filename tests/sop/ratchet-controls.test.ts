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
import { expectCeiling, expectFloor } from './architectureScan';

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

/**
 * The two ratchet HELPERS, exercised directly.
 *
 * `expectCeiling` has been the spine of a dozen enforcers since 2026-08 and
 * nothing has ever tested it. A ratchet that silently stops failing is the same
 * defect class as a scan that reports clean while seeing nothing, and it is
 * invisible for exactly the same reason: every suite using it goes green.
 *
 * Both must fail in BOTH directions. A one-sided ratchet lets you bank a
 * regression as easily as an improvement.
 */
describe('the ratchet helpers fail in both directions', () => {
    const ledger = { ceiling: 10, floor: 10 } as unknown as Parameters<typeof expectCeiling>[0];

    describe('expectCeiling — a value that may only fall', () => {
        it('passes when the count is AT the pin', () => {
            expect(() => expectCeiling(ledger, 'ceiling', 10)).not.toThrow();
        });

        it('fails when the count GREW above the pin', () => {
            expect(() => expectCeiling(ledger, 'ceiling', 11)).toThrow(/GREW_ABOVE_CEILING/);
        });

        it('fails when the count FELL, demanding the improvement be pinned', () => {
            // The arm that makes it a ratchet rather than a limit: you cannot bank
            // progress without editing the ledger, and that edit is a reviewed diff.
            expect(() => expectCeiling(ledger, 'ceiling', 9)).toThrow(/LOWER_THE_PIN/);
        });
    });

    describe('expectFloor — a value that may only rise', () => {
        it('passes when the count is AT the pin', () => {
            expect(() => expectFloor(ledger, 'floor', 10)).not.toThrow();
        });

        it('fails when the instrument got BLUNTER', () => {
            expect(() => expectFloor(ledger, 'floor', 9)).toThrow(/FELL_BELOW_FLOOR/);
        });

        it('fails when it got sharper, demanding the gain be pinned', () => {
            expect(() => expectFloor(ledger, 'floor', 11)).toThrow(/RAISE_THE_PIN/);
        });
    });

    it('CONTROL: the two helpers are not the same function', () => {
        // They differ only in the direction of two comparisons, so a copy-paste that
        // left one pointing at the other would pass every test above except this one.
        expect(() => expectCeiling(ledger, 'ceiling', 11)).toThrow(/GREW_ABOVE_CEILING/);
        expect(() => expectFloor(ledger, 'floor', 11)).toThrow(/RAISE_THE_PIN/);
    });

    it('CONTROL: a missing ledger key fails rather than passing vacuously', () => {
        expect(() => expectCeiling(ledger, 'nope', 1)).toThrow();
        expect(() => expectFloor(ledger, 'nope', 1)).toThrow();
    });
});

/**
 * The CSS migration mover's controls.
 *
 * `scripts/cssMigrationCycle.mjs` edits stylesheets unattended — it lifts a whole
 * feature family out of a 6,223-line file — so a defect in it corrupts CSS rather
 * than reporting a wrong number. Its controls plant the defects it could plausibly
 * have and are run here so they cannot rot unnoticed.
 */
describe('the CSS migration mover still reads rules correctly', () => {
    const script = join(__dirname, '../../scripts/cssMigrationCycle.mjs');

    it('passes its own controls', () => {
        const out = execFileSync('node', [script, '--selftest'], { encoding: 'utf8' });
        expect(out).toContain('ALL CONTROLS PASSED');
        expect(out).not.toContain('FAIL');
    });

    it('CONTROL: the controls really ran, and each is named', () => {
        const out = execFileSync('node', [script, '--selftest'], { encoding: 'utf8' });
        // Named individually so a stubbed or emptied self-test cannot satisfy the
        // assertion above by printing nothing.
        expect(out).toContain('A-comment-text-is-not-a-rule');
        expect(out).toContain('B-spans-end-at-the-rule');
        expect(out).toContain('C-utility-vs-feature');
        expect(out).toContain('D-control-must-detect-a-wrong-answer');
    });
});
