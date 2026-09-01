/**
 * Every `*.proof.sh` beside a hook rule RUNS, and every case in it is correct.
 *
 * WHY THIS EXISTS, and it is the sharpest lesson of 2026-09-01.
 *
 * `router.test.ts` proves one payload per RULE reaches its rule. That is not the
 * same as proving every SHAPE a rule matches reaches it, and the gap is not
 * theoretical: rule 13 already had a passing probe (its `| wc` case) while an
 * entire new arm of the same rule — `grep -c` — was unreachable at the router's
 * pre-filter. The reachability test stayed green over a guard that could never
 * fire.
 *
 * The `.proof.sh` files DO cover per-shape behaviour, in both directions. They
 * were just never run by anything. So three separate guards were written, proved
 * by hand, and found dead later:
 *
 *   - 12-unquoted-glob's `--exclude-dir` case (2026-08-13)
 *   - 13-piped-exit-code, written and proved dead by its own harness (2026-08-30)
 *   - 16-unsplit-var, 3 of 4 blocking cases dead at the gate (2026-09-01), plus
 *     rule 13's grep arm the same day
 *
 * A proof nobody runs is documentation. This makes it a test.
 *
 * It also caught a bug in a rule that had been shipping for two days: the span
 * `[^|\n]` is, to BSD grep, a bracket expression holding a backslash and the
 * LETTER n — so the pattern stopped at the first "n" in any argument. Control:
 * `grep -oE 'a[^|\n]*'` on `abcnxyz|end` returns `abc`.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const RULES_DIR = path.resolve(__dirname, '../../.claude/hooks/rules');

const proofs = fs
    .readdirSync(RULES_DIR)
    .filter((f) => f.endsWith('.proof.sh'))
    .sort();

/** The rule id a proof belongs to: `13-piped-exit-code.proof.sh` -> `13-piped-exit-code`. */
const ruleOf = (proof: string) => proof.replace(/\.proof\.sh$/, '');

describe('every hook rule proof runs, and passes', () => {
    it('CONTROL: proofs were actually found', () => {
        // A zero here would make every assertion below vacuous — the exact shape
        // of failure these proofs exist to catch.
        expect(proofs.length).toBeGreaterThanOrEqual(3);
    });

    it.each(proofs)('%s', (proof) => {
        const out = execFileSync('bash', [path.join(RULES_DIR, proof)], {
            encoding: 'utf8',
            cwd: path.resolve(__dirname, '../..'),
            timeout: 60_000,
        });

        // Each harness prints one line per case and marks a mismatch loudly.
        const wrong = out
            .split('\n')
            .filter((l) => l.includes('*** WRONG ***'))
            .map((l) => l.trim());

        // And it must have actually EXERCISED something: a harness that printed
        // nothing would pass the check above trivially.
        const cases = out.split('\n').filter((l) => /expect=\S+\s+got=/.test(l));

        expect({ proof: ruleOf(proof), wrong, caseCount: cases.length > 0 }).toEqual({
            proof: ruleOf(proof),
            wrong: [],
            caseCount: true,
        });
    });
});

describe('a rule that can block has a proof', () => {
    /**
     * Not every rule needs one — the skill-nudge rules (`reuse-first`,
     * `webview-test`, `adobe-docs`) fire once per session and are covered by
     * router.test.ts. The rules that BLOCK a mechanical mistake every time are the
     * ones whose exact match shape matters, and those carry a proof.
     */
    const MECHANICAL = ['12-unquoted-glob', '13-piped-exit-code', '16-unsplit-var'];

    it.each(MECHANICAL)('%s has a proof harness', (rule) => {
        expect(fs.existsSync(path.join(RULES_DIR, `${rule}.proof.sh`))).toBe(true);
    });
});
