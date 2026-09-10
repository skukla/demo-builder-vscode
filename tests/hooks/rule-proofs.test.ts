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

describe('shell writes reach the path-keyed rules', () => {
    /**
     * `writtenPaths.probe.py` proves the other half of the routing surface: a rule
     * keyed on a file path fires when the file is written through the SHELL, not
     * only through Write/Edit. It exists because that half was silent — for most of
     * 2026-09-10 an agent editing via heredoc'd python triggered none of the fifteen
     * path rules, including the god-file one on a 910-line handler.
     *
     * Run here for the same reason every `.proof.sh` is: a proof nobody runs is
     * documentation. This makes it a test.
     */
    it('passes its own cases, firing and silent', () => {
        const probe = path.join(__dirname, '../../.claude/hooks/writtenPaths.probe.py');
        expect(fs.existsSync(probe)).toBe(true);

        const out = execFileSync('python3', [probe], {
            encoding: 'utf8',
            cwd: path.resolve(__dirname, '../..'),
            timeout: 60_000,
        });

        const wrong = out.split('\n').filter((l) => l.includes('*** WRONG ***'));
        const cases = out.split('\n').filter((l) => /expect=\S+\s+got=/.test(l));
        expect({ wrong, exercised: cases.length > 0 }).toEqual({ wrong: [], exercised: true });
    });
});

describe('EVERY rule has a proof', () => {
    /**
     * This used to exempt the skill-nudge rules — `reuse-first`, `webview-test`,
     * `adobe-docs` — on the reasoning that they fire once per session and are
     * covered by `router.test.ts`, so only the mechanical rules' exact match shape
     * mattered.
     *
     * That reasoning does not survive contact with what the nudge rules are FOR.
     * They are the tier that stops an agent rebuilding something the repo already
     * has, and whether the guidance arrives is decided entirely by a path pattern.
     * Reachability is not shape coverage: rule 13's `grep -c` arm and rule 20's
     * `sk-ant-` arm were both unreachable at the router's pre-filter while their
     * rules looked healthy and their reachability probes stayed green.
     *
     * And the failure mode is worse here than for a mechanical rule. A dead
     * jest-pipe guard shows up the next time someone pipes jest. A dead nudge rule
     * shows up as a session that quietly reinvented something — indistinguishable
     * from a session where nobody did. On 2026-09-10 a splitter was written for
     * test files while the splitting playbook sat unread; nothing was broken, and
     * nothing reported anything.
     *
     * So: every rule, no exemptions. Writing the three missing proofs immediately
     * found three bugs — in the PROOFS, not the rules — each of which would have
     * made a healthy rule look dead: a reused `session_id` spending the once-per-
     * session marker, a relative path that cannot match a leading-slash-anchored pattern, and
     * an exit-code check that cannot say WHICH of twelve rules answered.
     */
    const RULES_DIR_ENTRIES = fs.readdirSync(RULES_DIR);
    const allRules = RULES_DIR_ENTRIES.filter((f) => f.endsWith('.rule')).map((f) =>
        f.replace(/\.rule$/, '')
    );

    it('CONTROL: the rules directory is not empty', () => {
        expect(allRules.length).toBeGreaterThan(5);
    });

    it.each(allRules)('%s has a proof harness', (rule) => {
        expect(fs.existsSync(path.join(RULES_DIR, `${rule}.proof.sh`))).toBe(true);
    });
});
