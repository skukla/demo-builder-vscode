/**
 * The type-aware lint config WORKS — proved by planting a cast it must find.
 *
 * `eslint.casts.mjs` is an instrument, and this repo has learned three times in one
 * day what happens to an instrument nothing runs: a hook rule dead at the router's
 * pre-filter, a blocking rule with no proof harness at all, and a bracket
 * expression that had silently stopped matching. All three looked fine.
 *
 * This config is more fragile than most, because everything it depends on lives
 * outside it: the rule name could be renamed by typescript-eslint, `tsconfig.test.json`
 * could stop covering the tests, and `recommendedTypeChecked` could drop the rule
 * from its preset. Any of those turns the config into a command that exits 0 and
 * finds nothing — which reads exactly like clean code.
 *
 * So: plant an unnecessary assertion, run the real config, and require it to be
 * found. Then remove the file and require the finding to go away, so a config that
 * flags EVERYTHING would fail too.
 *
 * WHY IT IS NOT IN `npm run lint`. Type-aware linting builds a TypeScript program.
 * The main config is deliberately `recommended` — "Basic TS rules, not
 * type-checked" — so the per-push gate stays fast. This suite pays that cost once,
 * over a single temporary file, rather than over 1,200.
 *
 * @see docs/development/toolchain.md — which tool answers which question
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../..');
const CONFIG = 'eslint.casts.mjs';
const RULE = '@typescript-eslint/no-unnecessary-type-assertion';

/**
 * Lint a snippet by writing a probe FILE and linting it.
 *
 * `--stdin` was tried first and is a dead end here: eslint IGNORED the piped
 * content entirely and linted the `--stdin-filename` file from disk. The proof is
 * that the only filename which "worked" was one that already contains two
 * unnecessary assertions of its own — the findings were its, at lines 394 and 405,
 * not the snippet's. Every neutral filename returned nothing.
 *
 * So a real file it is. The probe lives under `tests/tmp-probe/` rather than
 * `tests/sop/`: jest runs suites in parallel, and the first version planted the file
 * in a directory other scanners walk, which raced and blew one of them up with
 * ENOENT. The scanners now tolerate a file vanishing mid-walk — a latent bug this
 * surfaced — but not planting it in their path is the actual fix.
 */
function lintSnippet(code: string): Array<{ ruleId: string | null }> {
    const dir = path.join(repoRoot, 'tests/tmp-probe');
    const probe = path.join(dir, 'probe.ts');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(probe, code);
    try {
        let out = '';
        try {
            out = execFileSync(
                'npx',
                ['eslint', '--config', CONFIG, '--no-ignore', '-f', 'json', 'tests/tmp-probe/probe.ts'],
                { cwd: repoRoot, encoding: 'utf8', timeout: 180_000 }
            );
        } catch (e) {
            // eslint exits non-zero when it finds problems — the report is stdout.
            out = (e as { stdout?: string }).stdout ?? '';
        }
        if (!out.trim()) return [];
        const report = JSON.parse(out) as Array<{ messages: Array<{ ruleId: string | null }> }>;
        return report.flatMap((f) => f.messages);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

describe('the type-aware lint config can still see a pointless cast', () => {
    it('the config exists and names the rule it is for', () => {
        const body = fs.readFileSync(path.join(repoRoot, CONFIG), 'utf8');
        expect(body).toContain(RULE);
        // `projectService` is ~150x slower here than an explicit project (measured
        // 2026-09-01: 4s vs >600s, killed). If someone "modernises" it back, the
        // config still works but becomes unusable, so pin the choice.
        expect(body).toContain("project: './tsconfig.test.json'");
        expect(body).not.toMatch(/^\s*projectService:\s*true/m);
    });

    it('finds an unnecessary assertion that is really there', () => {
        // NOTE the explicit annotation. Written first as `const s = "x"`, which
        // TypeScript infers as the LITERAL type `"x"` — there `as string` genuinely
        // widens and the rule is right to stay silent. That test failed while the
        // config was fine: the fixture was wrong, not the tool.
        const ids = lintSnippet('const s: string = "x";\nexport const t = s as string;\n').map(
            (m) => m.ruleId
        );
        expect(ids).toContain(RULE);
    });

    it('CONTROL: stays quiet on a cast that is doing work', () => {
        // Here the assertion narrows `unknown`, so removing it would not compile.
        // A config that flagged this would be worse than useless.
        const ids = lintSnippet(
            'const u: unknown = "x";\nexport const v = (u as string).length;\n'
        ).map((m) => m.ruleId);
        expect(ids).not.toContain(RULE);
    });
});
