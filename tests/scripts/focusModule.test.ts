/**
 * The focus tool's WIDENING rule keeps its own controls.
 *
 * `scripts/focusModule.mjs --widen` adds the suites that import a module, but only
 * for a module whose mirror-only run left mutants uncovered. That is a rule with two
 * ways to go wrong, and neither shows up as an error: add nothing, and a module whose
 * tests live in a consumer's suite reads as untested; add always, and a sweep costs
 * 24.5x what it did for the same numbers.
 *
 * The controls live in a plain script (the scripts are ESM `.mjs`, which this repo's
 * jest transform does not parse; the precedent is `ratchet-controls.test.ts`), so they
 * can be run by hand while changing the rule. This makes sure they run with the suite.
 */

import { execFileSync } from 'child_process';
import * as path from 'path';

const SELFTEST = path.resolve(__dirname, '../../scripts/focusModule.selftest.mjs');

describe('the focus tool widens only where a run proved a gap', () => {
    it('passes its own controls', () => {
        // Throws on a non-zero exit; the script's output names the control that broke.
        const out = execFileSync('node', [SELFTEST], { encoding: 'utf8' });

        expect(out).toContain('ALL CONTROLS PASSED');
        expect(out).not.toContain('FAIL');
    });

    it('CONTROL: the script really ran every named control', () => {
        // A script that printed nothing, or was replaced by a no-op, would satisfy
        // "does not contain FAIL". Each control is named so an empty run cannot pass.
        const out = execFileSync('node', [SELFTEST], { encoding: 'utf8' });

        expect(out).toContain('PASS  A-uncovered-module-gets-its-importers');
        expect(out).toContain('PASS  B-covered-module-is-never-widened');
        expect(out).toContain('PASS  C-no-other-importer-adds-nothing');
        expect(out).toContain('PASS  D-group-widens-only-the-uncovered-member');
        expect(out).toContain('PASS  E-only-NoCoverage-counts-as-uncovered');
    });
});
