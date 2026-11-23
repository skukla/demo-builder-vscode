/**
 * Which test suites are a module's own: the one rule every mutation script reads (PL-116).
 *
 * Until 2026-11-23 there were two. `focusModule.mjs` used the mirror directory plus the
 * strayed-suite rule below, while `mutationScope.mjs` matched the module's stem anywhere in
 * `tests/`, so the scope profile and a focused run could measure one module against
 * different suites: a same-named module's suite counted for both modules in the profile.
 *
 * This is the FILENAME rule only. `focusModule.suitesFor` adds jest's import graph as a
 * fallback for a module with no suite of its own name; that asks jest once per module
 * (about half a second each), too slow for the profile's pass over every module, which
 * reports the "tested only through a consumer" case separately (`testMentions`).
 *
 * @module scripts/moduleSuites
 */
import { existsSync, readdirSync } from 'fs';
import { basename, dirname, join } from 'path';

/** Every suite that mirrors `modulePath`, sorted, as repo-relative paths. */
export function mirroringSuites(modulePath) {
    if (!modulePath.startsWith('src/')) {
        throw new Error(`Expected a path under src/, got: ${modulePath}`);
    }
    const stem = basename(modulePath).replace(/\.tsx?$/, '');
    const dir = join('tests', dirname(modulePath).slice('src/'.length));
    if (!existsSync(dir)) return [];
    // A split suite is `<stem>-<topic>` or `<stem>.<topic>` — BOTH separators are in use
    // (`stateManager.disposal.test.ts` against `stateManager-projects.test.ts`), and
    // matching only the hyphen silently left one suite out of a run on 2026-09-02, which
    // understates the score for a module rather than failing.
    //
    // The separator is required: without it `stateManagerFake.test.ts` would be swept in
    // as though it tested the same subject.
    const isSplitSuite = (f) =>
        (f.startsWith(`${stem}-`) || f.startsWith(`${stem}.`)) && /\.test\.tsx?$/.test(f);
    const isSuiteFor = (f) => f === `${stem}.test.ts` || f === `${stem}.test.tsx` || isSplitSuite(f);
    const mirrored = readdirSync(dir).filter(isSuiteFor).map((f) => join(dir, f));
    return [...mirrored, ...strayedSuites(stem, dir, isSuiteFor)].sort();
}

/**
 * Suites named for the module that live OUTSIDE its mirror directory — but only where
 * no other module of the same name could own them.
 *
 * The strict mirror is right for a same-named neighbour: twelve basenames under src/
 * name two different modules, and `tests/features/app-builder/services/
 * appBuilderComponentMigration.test.ts` tested the app-builder one, not core/state's
 * (until the app-builder module was renamed on 2026-11-15).
 * It is wrong for a suite that simply lives in the wrong folder: the four
 * `useSelectionStep-*.test.tsx` under `tests/features/authentication/ui/hooks` test
 * `core/ui/hooks/useSelectionStep.ts` — there is no authentication module of that
 * name — and the hook was measured without them (2026-09-03). The rule that separates
 * the two: a stray suite counts when its own mirror source directory has NO module of
 * that stem.
 */
function strayedSuites(stem, mirrorDir, isSuiteFor) {
    return testFiles()
        .filter((p) => isSuiteFor(basename(p)) && dirname(p) !== mirrorDir)
        .filter((p) => {
            const ownSrcDir = join('src', dirname(p).slice('tests/'.length));
            const ownModule = ['.ts', '.tsx'].some((ext) => existsSync(join(ownSrcDir, stem + ext)));
            // Under a tests/ subfolder only: a suite directly in tests/ mirrors no source folder.
            return !ownModule && dirname(p).startsWith('tests/') && !dirname(p).startsWith('tests/sop');
        });
}

let files;

/**
 * Every file under tests/, read once per process: the profile asks for every module in
 * turn, and walking the tree each time was one walk per module.
 */
function testFiles() {
    if (files) return files;
    files = [];
    const walk = (d) => {
        for (const entry of readdirSync(d, { withFileTypes: true })) {
            const p = join(d, entry.name);
            if (entry.isDirectory()) walk(p);
            else files.push(p);
        }
    };
    walk('tests');
    return files;
}
