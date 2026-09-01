/**
 * The ts-morph codemod harness works, and its guards refuse.
 *
 * The assertions live in `scripts/codemod/selftest.mjs` and this runs it — the
 * harness is ESM and jest here is CommonJS, the same reason the hook rules carry
 * `.proof.sh` files and `tests/hooks/rule-proofs.test.ts` executes those.
 *
 * WHY IT IS RUN RATHER THAN TRUSTED. This repo found three dead instruments in one
 * day on 2026-09-01 — a hook rule that never reached its guard, a blocking rule with
 * no proof harness, and a bracket expression that had stopped matching. All three
 * exited 0 and looked fine. A harness that will rewrite hundreds of files is the
 * last place to accept that risk, so its self-test is a build step.
 *
 * The self-test ends with a deliberately false assertion, so a run reporting zero
 * failures means the checker itself is broken. This suite asserts the exact count,
 * not merely a clean exit.
 *
 * @see scripts/codemod/project.mjs
 * @see docs/development/toolchain.md
 */

import { execFileSync } from 'child_process';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../..');

describe('the ts-morph codemod harness', () => {
    it('passes its own self-test, including the negative control', () => {
        const out = execFileSync('node', ['scripts/codemod/selftest.mjs'], {
            cwd: repoRoot,
            encoding: 'utf8',
            timeout: 120_000,
        });

        const unexpected = out
            .split('\n')
            .filter((l) => l.includes('FAIL'))
            .filter((l) => !l.includes('CONTROL'));

        // The corpus of checks must be real: a self-test that ran nothing would
        // print no FAIL lines and no OK lines, and pass the filter above.
        const passed = out.split('\n').filter((l) => l.trim().startsWith('OK')).length;

        expect({ unexpected, ranAtLeast: passed >= 10 }).toEqual({
            unexpected: [],
            ranAtLeast: true,
        });
        expect(out).toContain('1 failure(s); 1 expected from the negative control');
    });

    it('CONTROL: the self-test can actually fail', () => {
        // The harness self-test ends with a deliberately false assertion. If that
        // stopped being reported, every OK above it would be worthless — a checker
        // that cannot fail is not a checker. This asserts the failure is real by
        // requiring the script to NAME it.
        const out = execFileSync('node', ['scripts/codemod/selftest.mjs'], {
            cwd: repoRoot,
            encoding: 'utf8',
            timeout: 120_000,
        });
        expect(out).toContain('FAIL  CONTROL: a deliberately false assertion is reported');
    });

    it('is declared as a dependency, not borrowed transitively', () => {
        // ts-morph sat in node_modules transitively for months before 2026-09-01,
        // used by nothing. A tool a codemod depends on has to be declared, or an
        // unrelated `npm prune` removes it and the harness dies with a resolve error.
        const pkg = require(path.join(repoRoot, 'package.json')) as {
            devDependencies: Record<string, string>;
        };
        expect(pkg.devDependencies['ts-morph']).toBeDefined();
    });
});
