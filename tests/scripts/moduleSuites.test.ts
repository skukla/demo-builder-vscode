/**
 * One rule decides which suites are a module's own, in every mutation script (PL-116).
 *
 * `mutationScope.mjs` (the profile and its include/block verdicts) and `focusModule.mjs`
 * (the focused Stryker run) used to disagree: the profile matched a module's stem anywhere
 * in tests/, so two same-named modules each got the other's suites. Both now read
 * `scripts/moduleSuites.mjs`. This suite asks both scripts about the two cases that
 * separated them and requires the same answer.
 *
 * The scripts are ESM `.mjs`, which this repo's jest transform does not parse, so they are
 * asked from a node child process, as `focusModule.test.ts` does.
 */

import { execFileSync } from 'child_process';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../..');

interface Answer {
    profile: number;
    focus: string[];
    shared: string[];
}

/** What each script says about these modules. */
function ask(modules: string[]): Record<string, Answer> {
    const script = `
        import { profile } from './scripts/mutationScope.mjs';
        import { suitesFor } from './scripts/focusModule.mjs';
        import { mirroringSuites } from './scripts/moduleSuites.mjs';
        const out = {};
        for (const m of ${JSON.stringify(modules)}) {
            const shared = mirroringSuites(m);
            // The focus tool only asks jest's import graph when the shared rule finds nothing.
            out[m] = { profile: profile(m).suites, focus: shared.length ? suitesFor(m) : [], shared };
        }
        console.log(JSON.stringify(out));
    `;
    const stdout = execFileSync('node', ['--input-type=module', '-e', script], {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 120_000,
    });
    return JSON.parse(stdout) as Record<string, Answer>;
}

describe('the mutation scripts agree on which suites are a module own', () => {
    // Asked once: each call starts node and reads the scripts' config.
    let answers: Record<string, Answer>;
    beforeAll(() => {
        answers = ask([
            'src/core/releases/componentRelease.ts',
            'src/core/shell/orgContextEnv.ts',
            'src/features/authentication/services/orgContextEnv.ts',
        ]);
    }, 120_000);

    it('counts a suite kept outside the mirror folder the same in both scripts', () => {
        const { profile, focus, shared } = answers['src/core/releases/componentRelease.ts'];

        expect(shared).toContain('tests/scripts/componentRelease.test.ts');
        expect(focus).toStrictEqual(shared);
        expect(profile).toBe(shared.length);
    });

    it("gives each of two same-named modules only its own suite, in both scripts", () => {
        const shell = answers['src/core/shell/orgContextEnv.ts'];
        const auth = answers['src/features/authentication/services/orgContextEnv.ts'];

        // The suite in tests/features/authentication/services/ is the authentication module's.
        expect(auth.shared).toStrictEqual(['tests/features/authentication/services/orgContextEnv.test.ts']);
        expect(auth.profile).toBe(1);
        expect(shell.shared).toStrictEqual([]);
        expect(shell.profile).toBe(0);
    });
});
