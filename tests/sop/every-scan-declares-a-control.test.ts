/**
 * Every SOP scan declares a control.
 *
 * WHY THIS EXISTS — and why it checks a NAME rather than a property.
 *
 * The rule "pair every 'nothing found' verification with a positive control" is
 * in the root CLAUDE.md, written after two wrong all-clears on 2026-08-07. Every
 * suite in this directory reports "nothing found" for a living; a suite whose
 * scan silently sees zero files passes exactly like a clean repo.
 *
 * Auditing it on 2026-08-29 found **four of sixteen** suites with no control at
 * all — `complex-expressions`, `component-extraction`, `inline-styles` and
 * `magic-timeouts` — each asserting "should not have X" over a walk nothing
 * verified. They have corpus controls now.
 *
 * The other twelve HAD one, phrased five different ways: "still recognises the
 * idiom it is meant to catch", "flags a jest.mock of a config leaf", "scans a
 * corpus big enough to be worth scanning", "the check is pointed somewhere
 * real", "positive control: the detector sees…". All good tests. Collectively
 * uncheckable, because no two agreed on what to call it.
 *
 * THE FIRST ATTEMPT AT THIS CHECK GOT IT WRONG in the exact way the rule warns
 * about: it grepped for the words "POSITIVE CONTROL" and reported seven suites
 * as uncontrolled. Three of those had perfectly good controls under other names.
 * A keyword search for a phrase is not a check for a property — the detector
 * matched vocabulary and I read it as evidence.
 *
 * So this does not try to prove a test IS a control; that is not decidable from
 * source, and pretending otherwise would rebuild the same false confidence.
 * It requires the control to be DECLARED, and a declaration is checkable.
 *
 * When you add a scan here, name its control test `CONTROL: …`. What it asserts
 * is your judgement — that the detector fires on a known-bad input, or simply
 * that the corpus is not empty. Both beat nothing; neither is checkable from
 * outside.
 */

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const SOP_DIR = __dirname;

/** `it('CONTROL: …')` or the older `it('POSITIVE CONTROL: …')`. */
const DECLARES_CONTROL = /it\(\s*['"`](?:CONTROL:|POSITIVE CONTROL)/;

const suites = readdirSync(SOP_DIR)
    .filter((f) => f.endsWith('.test.ts') && f !== 'every-scan-declares-a-control.test.ts')
    .sort();

describe('every SOP scan declares a control', () => {
    it('CONTROL: this check can see the suites it audits', () => {
        // Its own medicine. If the directory listing broke, the assertion below
        // would pass over an empty list and report every scan as compliant.
        expect(suites.length).toBeGreaterThan(10);
        expect(suites).toContain('architecture-rules.test.ts');
    });

    it('names a CONTROL test in every scan suite', () => {
        const undeclared = suites.filter(
            (f) => !DECLARES_CONTROL.test(readFileSync(join(SOP_DIR, f), 'utf8'))
        );
        expect(undeclared).toEqual([]);
    });

    it('CONTROL: a suite without one would be caught', () => {
        // Proves the matcher is not vacuous — the failure that let four suites
        // go uncontrolled for months while every run was green.
        expect(DECLARES_CONTROL.test(`it('finds no violations', () => {});`)).toBe(false);
        expect(DECLARES_CONTROL.test(`it('CONTROL: sees a corpus', () => {});`)).toBe(true);
    });
});
