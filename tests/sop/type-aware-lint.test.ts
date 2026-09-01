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
const PROBE = 'tests/sop/__type-aware-probe.ts';

/** Run the real config over one file; returns eslint's JSON report. */
function lintProbe(): Array<{ ruleId: string | null }> {
    let out = '';
    try {
        out = execFileSync(
            'npx',
            ['eslint', '--config', CONFIG, '--no-ignore', '-f', 'json', PROBE],
            { cwd: repoRoot, encoding: 'utf8', timeout: 180_000 }
        );
    } catch (e) {
        // eslint exits non-zero when it finds problems — the report is still on stdout.
        out = (e as { stdout?: string }).stdout ?? '';
    }
    if (!out.trim()) return [];
    const report = JSON.parse(out) as Array<{ messages: Array<{ ruleId: string | null }> }>;
    return report.flatMap((f) => f.messages);
}

describe('the type-aware lint config can still see a pointless cast', () => {
    const probePath = path.join(repoRoot, PROBE);

    afterEach(() => {
        if (fs.existsSync(probePath)) fs.unlinkSync(probePath);
    });

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
        // widens and the rule is right to stay silent. The test failed and the
        // config was fine, which is the fixture being wrong rather than the tool.
        fs.writeFileSync(probePath, 'const s: string = "x";\nexport const t = s as string;\n');
        const ruleIds = lintProbe().map((m) => m.ruleId);
        expect(ruleIds).toContain(RULE);
    });

    it('CONTROL: stays quiet on a cast that is doing work', () => {
        // Here the assertion narrows `unknown`, so removing it would not compile.
        // A config that flagged this would be worse than useless.
        fs.writeFileSync(
            probePath,
            'const u: unknown = "x";\nexport const v = (u as string).length;\n'
        );
        const ruleIds = lintProbe().map((m) => m.ruleId);
        expect(ruleIds).not.toContain(RULE);
    });
});
