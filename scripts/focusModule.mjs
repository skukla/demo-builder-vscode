#!/usr/bin/env node
/**
 * Point the FOCUSED mutation run at one module, or at several together.
 *
 *   node scripts/focusModule.mjs src/features/eds/services/siteTools.ts
 *   node scripts/focusModule.mjs src/a.ts src/b.ts src/c.ts   # one measurement, three modules
 *   node scripts/focusModule.mjs --check      # the two configs still agree with each other
 *
 * SEVERAL AT ONCE, and why. A module pays a fixed toll — one measurement, a re-measure,
 * the scoped check, a commit — whatever its size. Measured over 61 modules on 2026-09-05:
 * modules with 1-5 open gaps closed 1.0 gaps per minute against 13.7 for those with 100+,
 * while the median time barely moved. The tail is 93 modules holding 3% of the remaining
 * gaps and costing 11% of the time, nearly all of it that toll. Grouping them shares one
 * measurement across several. The report is already per-module (Stryker keys results by
 * file and `checkMutationBaseline` writes a row for each), so nothing downstream changes.
 *
 * WHY. The focused run is described by two hand-maintained files that must agree:
 * `mutate` in stryker.focus.config.json and `testMatch` in jest.focus.config.js. The
 * note in the second one said, in as many words, that moving to the next module means
 * editing both together — which is a rule you follow until the night you do not. On
 * 2026-09-02 a new suite went into the focused config and not the sample one, and only
 * an enforcer caught it.
 *
 * When they disagree the failure does not look like a failure: a run where they DID
 * disagree reported 0% for seven modules and finished in 19 seconds, which reads as a
 * devastating result and was a run that never executed the tests. So this refuses to
 * write anything when it finds no suites, rather than producing a config that would
 * report a confident zero.
 *
 * Suites are found by this repo's mirror convention: a module under src is tested by the
 * same path under tests, plus any suite split from it with a hyphenated suffix. When that
 * finds NOTHING, and only then, jest's own inverse dependency graph answers instead —
 * see `relatedSuites` below for why that order and not the other one.
 */
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, rmSync, realpathSync } from 'fs';
import { dirname, basename, join, relative } from 'path';

import { isReactSuite } from './mutationScope.mjs';

const STRYKER = 'stryker.focus.config.json';
const JEST = 'jest.focus.config.js';
const SAMPLE_STRYKER = 'stryker.pl22.config.json';
const SAMPLE_JEST = 'jest.pl22.config.js';
const INCREMENTAL = 'reports/mutation/focus-incremental.json';

/**
 * The suites a focused run measures `modulePath` against.
 *
 * MIRROR FIRST, jest's import graph only as a FALLBACK. Keying everything on jest's
 * graph is the more obviously correct rule and it was measured on 2026-09-08 against
 * this one: on the two modules run under both, it bought nothing — identical score and
 * identical open gaps for 7.9x and 40.9x the wall time (`addonUpdateChecker` 72.86%/0
 * gaps, `configSyncService` 71.30%/0 gaps under each) — and across all 629 baseline
 * modules it multiplies the sweep's work 24.5x, turning a measured 4.8-hour sweep into
 * about 76. The filename rule's only real defect is OMISSION: Stryker already narrows
 * whatever this returns to the module's actual importers (`enableFindRelatedTests`), so
 * a suite named for a module it never imports costs nothing, while a suite that covers
 * the module and is not selected reports its mutants as uncovered.
 *
 * So the fallback fires exactly where the omission bites — a module with no suite of its
 * own name, tested only through a consumer's suite. 165 of the 180 modules this
 * instrument refuses today become measurable; the other 15 have no related suite at all
 * and are still refused, now for the honest reason.
 *
 * The ORDER is what keeps the 629 pinned rows byte-identical: for any module with a
 * mirroring suite the answer is unchanged, so no existing measurement changes meaning.
 * `scripts/checkAttributionEquality.mjs` is the check that proves it.
 *
 * Full reasoning and the four Stryker runs behind it:
 * `.rptc/plans/unmeasured-fifth/attribution-design.md`.
 */
export function suitesFor(modulePath) {
    const mirrored = mirroringSuites(modulePath);
    return mirrored.length ? mirrored : relatedSuites(modulePath);
}

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
    return [...mirrored, ...strayedSuites(modulePath, stem, dir, isSuiteFor)].sort();
}

/**
 * Suites named for the module that live OUTSIDE its mirror directory — but only where
 * no other module of the same name could own them.
 *
 * The strict mirror is right for a same-named neighbour: twelve basenames under src/
 * name two different modules, and `tests/features/app-builder/services/
 * appBuilderComponentMigration.test.ts` tests the app-builder one, not core/state's.
 * It is wrong for a suite that simply lives in the wrong folder: the four
 * `useSelectionStep-*.test.tsx` under `tests/features/authentication/ui/hooks` test
 * `core/ui/hooks/useSelectionStep.ts` — there is no authentication module of that
 * name — and the hook was measured without them (2026-09-03). The rule that separates
 * the two: a stray suite counts when its own mirror source directory has NO module of
 * that stem.
 */
function strayedSuites(modulePath, stem, mirrorDir, isSuiteFor) {
    const out = [];
    const walk = (d) => {
        for (const name of readdirSync(d, { withFileTypes: true })) {
            const p = join(d, name.name);
            if (name.isDirectory()) walk(p);
            else if (isSuiteFor(name.name) && dirname(p) !== mirrorDir) {
                const ownSrcDir = join('src', dirname(p).slice('tests/'.length));
                const ownModule = ['.ts', '.tsx'].some((ext) => existsSync(join(ownSrcDir, stem + ext)));
                if (!ownModule && dirname(p).startsWith('tests/') && !dirname(p).startsWith('tests/sop')) out.push(p);
            }
        }
    };
    walk('tests');
    return out;
}

/**
 * Every suite that REACHES `modulePath` through jest's own inverse dependency graph.
 *
 * This is the same question Stryker already asks on every run: `enableFindRelatedTests`
 * hands the mutated file to `jest --findRelatedTests`, which walks `resolveInverse`
 * transitively over the whole file set and filters by `isTestFilePath`. Asking it here
 * too costs about half a second per module and is the only rule in this file that can
 * see an import — `mirroringSuites` above reads filenames, and the header note at the
 * bottom of `main()` records two text heuristics that tried to see imports and were both
 * wrong.
 *
 * `tests/sop/` is EXCLUDED. An enforcer measures the repository, not a module's
 * behaviour, and several of them shell out to `git` or to jest itself — inside Stryker's
 * sandbox copy that either fails or re-enters the runner. The same directory is excluded
 * from `strayedSuites` above, for the same reason.
 *
 * Returns [] rather than throwing when jest cannot answer: the caller's job is to refuse
 * a barren module, and a refusal it can explain beats a stack trace here.
 */
export function relatedSuites(modulePath) {
    let stdout;
    try {
        stdout = execFileSync(
            process.execPath,
            ['node_modules/.bin/jest', '--listTests', '--findRelatedTests', modulePath],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 32 * 1024 * 1024 }
        );
    } catch {
        return [];
    }
    return stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((abs) => relative(process.cwd(), abs))
        .filter((p) => p.startsWith('tests/') && !p.startsWith('tests/sop/'))
        .sort();
}

function renderJest(suites) {
    const header = readFileSync(JEST, 'utf8').split('const base = require')[0];
    const glob = (list) => list.map((s) => `        '**/${s}',`).join('\n');

    const reactSuites = suites.filter(isReactSuite);
    const nodeSuites = suites.filter((s) => !isReactSuite(s));

    // ONE project when every suite runs in the same environment, which is the case for
    // all but six modules — and, for a group, when no member drags in the other kind. `enableFindRelatedTests` and Stryker's per-test coverage both
    // behave predictably against a single project; the multi-project form below is the
    // exception, not the default.
    if (!reactSuites.length || !nodeSuites.length) {
        const which = reactSuites.length ? 'react' : 'node';
        return `${header}const base = require('./jest.config.js');

const project = base.projects.find((p) => p.displayName === '${which}');

module.exports = {
    ...project,
    displayName: 'stryker-focus',
    // LISTED, not globbed: \`mutation-config-pairing\` verifies each named path
    // exists, and a glob is not a path it can check.
    // GENERATED by scripts/focusModule.mjs — re-run it rather than editing by hand.
    // Environment: ${which === 'react' ? 'jsdom — every suite in this focus is a React suite' : 'node'}
    testMatch: [
${glob(which === 'react' ? reactSuites : nodeSuites)}
    ],
};
`;
    }

    // BOTH environments, in ONE project. Stryker's jest runner IGNORES a `projects`
    // array — it collapses to a single default environment and every React suite dies
    // on `ReferenceError: document is not defined` (measured 2026-09-03). So the two
    // sets run together under jsdom, which is a superset of what the node suites need.
    // Running only the React half instead would silently measure against a fraction of
    // the tests, which is the defect that reported installHandler at 49% on 12 of its
    // 13 suites.
    // The react project alone is NOT enough for the node suites: it has no `.md`
    // transformer and no `@/commands` / `@/mcp-server` alias, so a node suite that
    // reaches a skill template dies before the run starts — "Invalid left-hand side
    // expression in prefix operation", which reads like a syntax error in the source
    // and is a missing transformer (2026-09-06, a five-module group). Take the react
    // rules for anything TypeScript and the node project's for everything else.
    return `${header}const base = require('./jest.config.js');

const react = base.projects.find((p) => p.displayName === 'react');
const node = base.projects.find((p) => p.displayName === 'node');

// A transform entry the react project does not already cover: its key does not
// match a .ts or .tsx filename, so taking it cannot displace the tsx-aware one.
const isNonTypeScript = ([pattern]) =>
    !new RegExp(pattern).test('x.ts') && !new RegExp(pattern).test('x.tsx');

module.exports = {
    ...react,
    displayName: 'stryker-focus',
    // GENERATED by scripts/focusModule.mjs — re-run it rather than editing by hand.
    // Environment: jsdom for BOTH sets — this focus has suites in each, and Stryker
    // cannot run two jest projects in one measurement.
    transform: {
        ...react.transform,
        ...Object.fromEntries(Object.entries(node.transform).filter(isNonTypeScript)),
    },
    moduleFileExtensions: [
        ...new Set([...react.moduleFileExtensions, ...node.moduleFileExtensions]),
    ],
    // React's entries win where both name the same specifier; node's add the
    // aliases (@/commands, @/mcp-server) the react project never needed.
    moduleNameMapper: { ...node.moduleNameMapper, ...react.moduleNameMapper },
    transformIgnorePatterns: node.transformIgnorePatterns,
    testMatch: [
${glob([...nodeSuites, ...reactSuites])}
    ],
};
`;
}

/**
 * Add any MISSING suite to the SAMPLE config's list. Never removes.
 *
 * The sample covers twelve modules and its suite list is hand-maintained, so adding a
 * test file for any of them silently leaves it out. That happened TWICE on 2026-09-02,
 * both times caught by an enforcer rather than by anyone noticing.
 *
 * ADD-ONLY is not timidity, it is correctness. The mirror convention finds most suites
 * and not all of them — the webview tree, for one, does not mirror `src/` path for path.
 * A rewrite that dropped what it could not derive would remove EIGHT working entries
 * (measured, the first time this ran) and hand each of those modules a run with no tests,
 * which reports 0% and reads like a catastrophe. Entries it cannot account for are
 * REPORTED, so a genuinely stale one is still visible to a human.
 */
function syncSample() {
    const stryker = JSON.parse(readFileSync(SAMPLE_STRYKER, 'utf8'));
    const derived = [...new Set(stryker.mutate.flatMap((m) => suitesFor(m)))].sort();

    const src = readFileSync(SAMPLE_JEST, 'utf8');
    const listed = [...src.matchAll(/'\*\*\/([^']+)'/g)].map((m) => m[1]);
    const missing = derived.filter((s2) => !listed.includes(s2));
    const unexplained = listed.filter((s2) => !derived.includes(s2));

    if (missing.length) {
        const insertion = missing.map((s2) => `        '**/${s2}',`).join('\n');
        const anchor = `        '**/${listed[0]}',`;
        if (!src.includes(anchor)) {
            console.error(`Could not find an anchor entry in ${SAMPLE_JEST} to insert beside.`);
            process.exit(1);
        }
        writeFileSync(SAMPLE_JEST, src.replace(anchor, `${insertion}\n${anchor}`));
    }

    console.log(`${SAMPLE_JEST}: ${listed.length} listed, ${derived.length} derived from ${stryker.mutate.length} module(s).`);
    for (const a of missing) console.log(`  + ${a}`);
    for (const u of unexplained) console.log(`  ? ${u}   (listed but not derivable — left alone)`);
    if (!missing.length) console.log('  nothing missing.');
}

function main() {
    const arg = process.argv[2];

    if (arg === '--sync-sample') {
        syncSample();
        return;
    }
    const stryker = JSON.parse(readFileSync(STRYKER, 'utf8'));

    if (arg === '--check') {
        const current = stryker.mutate;
        const expected = [...new Set(current.flatMap((m) => suitesFor(m)))].sort();
        const actual = [...readFileSync(JEST, 'utf8').matchAll(/'\*\*\/([^']+)'/g)].map((m) => m[1]);
        const missing = expected.filter((s) => !actual.includes(s));
        const extra = actual.filter((s) => !expected.includes(s));
        if (missing.length || extra.length) {
            console.error(`The focused configs disagree for ${current.join(', ')}:`);
            for (const s of missing) console.error(`  missing from ${JEST}: ${s}`);
            for (const s of extra) console.error(`  named in ${JEST} but not a suite for it: ${s}`);
            console.error(`\nRegenerate: node scripts/focusModule.mjs ${current.join(' ')}`);
            process.exit(1);
        }
        console.log(`Focused configs agree: ${current.length} module(s) <- ${expected.length} suite(s).`);
        return;
    }

    const paths = process.argv.slice(2).filter((a) => !a.startsWith('--'));
    if (!paths.length) {
        console.error(
            'Usage: node scripts/focusModule.mjs <src/path/to/module.ts> [more modules...] | --check | --sync-sample'
        );
        process.exit(1);
    }
    const missingPaths = paths.filter((m) => !existsSync(m));
    if (missingPaths.length) {
        for (const m of missingPaths) console.error(`No such module: ${m}`);
        process.exit(1);
    }

    // Every module must contribute suites. Checked for ALL of them before anything is
    // written, so a group naming one untested module refuses outright rather than
    // measuring the rest and reporting that module a confident zero.
    const perModule = paths.map((m) => [m, suitesFor(m)]);
    const barren = perModule.filter(([, ss]) => ss.length === 0).map(([m]) => m);
    if (barren.length) {
        // Refusing is the whole point: a focused run with no suites reports 0% in
        // seconds and reads exactly like a catastrophic result.
        for (const m of barren) {
            console.error(`No test suite mirrors ${m}, and none imports it either.`);
        }
        console.error('Refusing to write a config that would report a confident zero.');
        process.exit(1);
    }
    const suites = [...new Set(perModule.flatMap(([, ss]) => ss))].sort();
    // NO check here for whether the suites actually EXERCISE the module. Two were tried
    // on 2026-09-03 and both were wrong: "does the suite import it by path" would have
    // refused 34 modules that measure fine, and "does the suite mention its name at all"
    // would still have refused three — suites reach their subject through `.testUtils`
    // re-exports and feature barrels, and no text heuristic sees an import graph.
    // Stryker does. A suite that matches by name and never touches the module makes
    // Stryker report "No tests were executed", and `mutationSweep.mjs` files that as a
    // skip rather than a failure. That is the one place the answer is reliable.
    //
    // `relatedSuites` asks jest the import question directly, but it is a FALLBACK, not
    // a filter: it only supplies suites where the mirror rule found none. It is not used
    // to prune a mirroring suite, because pruning is what Stryker already does for free.

    const previous = stryker.mutate ?? [];
    const changed = previous.length !== paths.length || previous.some((m, i) => m !== paths[i]);
    stryker.mutate = paths;
    writeFileSync(STRYKER, JSON.stringify(stryker, null, 4) + '\n');
    writeFileSync(JEST, renderJest(suites));

    // The incremental cache belongs to the focus it was built for.
    if (changed && existsSync(INCREMENTAL)) rmSync(INCREMENTAL);

    console.log(`Focused on ${paths.join(', ')}`);
    for (const s of suites) console.log(`  ${s}`);
    if (changed) console.log(`\nWas: ${previous.join(', ') || '(nothing)'}. Incremental cache cleared — the next run is cold.`);

    // GROUP BY ENVIRONMENT. A mixed group runs every suite under jsdom, and jsdom is
    // not a superset of node: it has no `globalThis.fetch`, so a node suite that spies
    // on fetch fails outright (`Property 'fetch' does not exist in the provided object`
    // — eleven tests of componentManager-install-git-clone, 2026-09-06). Nothing here
    // can fix that, so say it rather than let a red run look like a bad score.
    const react = suites.filter(isReactSuite);
    const node = suites.filter((s) => !isReactSuite(s));
    if (react.length && node.length) {
        console.log(
            `\nWARNING: this group mixes ${node.length} node suite(s) with ${react.length} React one(s), ` +
            `so all of them run under jsdom. Split it into two groups if any node suite ` +
            `touches a node-only global (fetch, Buffer streams).`
        );
    }
}

/**
 * Only run the CLI when this file IS the command, not when another script imports it.
 * Without this, importing `suitesFor` executes main() against the IMPORTER's argv — the sweep
 * runner's `--minutes 480` was read as a module path and exited 1 before doing anything.
 */
const isEntryPoint =
    !!process.argv[1] &&
    existsSync(process.argv[1]) &&
    realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isEntryPoint) main();
