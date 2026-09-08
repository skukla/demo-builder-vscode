/**
 * A Stryker config's `mutate` list and its jest config's `testMatch` must agree.
 *
 * WHY THIS EXISTS, from a wrong answer it would have prevented. Stryker mutates the
 * files in `mutate` and runs the tests its jest config selects. Those are two hand-
 * maintained lists, and `jest.stryker.config.js` says so in its own header —
 * "keep testMatch in step with mutate … tooling-registry.test.ts does not police
 * this pair".
 *
 * On 2026-08-30 the PL-22 sample was run against that config. Seven of the eight
 * mutated files had no test selected, so every mutant landed in the NO COVERAGE
 * column: the report showed 0% for seven modules, 100% for the one pilot file that
 * happened to be in both lists, and finished in 19 seconds. Read as a result it
 * says the codebase has almost no real coverage. It actually says the run never
 * executed those tests.
 *
 * That is the worst shape a measurement can have — not an error, a plausible
 * number. The control (a known-good pilot file) PASSED, which is the standing
 * lesson here: a control proves the tool works, not that you aimed it right.
 *
 * WHAT THIS CANNOT DO: it proves a test file naming the module is selected, not
 * that the test meaningfully exercises it. A file can be selected and still assert
 * nothing about the mutated code.
 */
import { execSync } from 'child_process';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { basename, dirname, join } from 'path';

const ROOT = join(__dirname, '..', '..');

/**
 * Every suite on disk that tests `modulePath`: the mirror directory under tests/,
 * the same stem, and either separator this repo uses for a split family
 * (`stateManager-projects`, `stateManager.disposal`). The SAME rule
 * `scripts/focusModule.mjs` generates the focus config from — a suite in another
 * directory with the same basename tests a different module of the same name.
 */
function siblingSuites(
    modulePath: string,
    onDisk: string[],
    sourceExists: (p: string) => boolean = (p) => existsSync(join(ROOT, p))
): string[] {
    const stem = basename(modulePath).replace(/\.tsx?$/, '');
    const mirrorDir = join('tests', dirname(modulePath).replace(/^src\//, ''));
    const isSuiteFor = (file: string) =>
        file === `${stem}.test.ts` ||
        file === `${stem}.test.tsx` ||
        ((file.startsWith(`${stem}-`) || file.startsWith(`${stem}.`)) &&
            /\.test\.tsx?$/.test(file));
    return onDisk.filter((t) => {
        if (!isSuiteFor(basename(t))) return false;
        if (dirname(t) === mirrorDir) return true;
        // A STRAYED suite — named for this module, living elsewhere — counts only when
        // its own mirror source directory has no module of that stem to claim it. That
        // is what separates the four `useSelectionStep-*` suites under
        // features/authentication (which test core/ui/hooks/useSelectionStep.ts) from
        // the app-builder `appBuilderComponentMigration` suite (which tests the
        // app-builder module of that name, not core/state's). Same rule as
        // `strayedSuites` in scripts/focusModule.mjs.
        if (dirname(t).startsWith('tests/sop')) return false;
        const ownSrcDir = join('src', dirname(t).replace(/^tests\/?/, ''));
        return !['.ts', '.tsx'].some((ext) => sourceExists(join(ownSrcDir, stem + ext)));
    });
}

/**
 * Every Stryker config in the repo, paired with the jest config it names.
 *
 * DISCOVERED, not listed. This was a hand-written array of two until 2026-09-02, and
 * a hand-written list of the things a check covers is a check that silently narrows:
 * adding `stryker.focus.config.json` would have left the newest config — the one
 * being actively edited — as the only one nobody verified.
 */
const CONFIGS = readdirSync(ROOT)
    .filter((f) => /^stryker(\..+)?\.config\.json$/.test(f))
    .sort();

interface Pairing {
    strykerConfig: string;
    jestConfig: string;
    mutate: string[];
    testFiles: string[];
}

function load(strykerConfig: string): Pairing {
    const cfg = JSON.parse(readFileSync(join(ROOT, strykerConfig), 'utf8'));
    const jestConfig: string = cfg.jest.configFile;
    const js = readFileSync(join(ROOT, jestConfig), 'utf8');

    // testMatch entries are globs anchored with `**/`; strip it to get a repo path.
    const testFiles = [...js.matchAll(/'\*\*\/(tests\/[^']+)'/g)].map((m) => m[1]);
    return { strykerConfig, jestConfig, mutate: cfg.mutate, testFiles };
}

/**
 * Every suite that reaches `module` through jest's inverse dependency graph — the same
 * question `relatedSuites` in scripts/focusModule.mjs asks, and the same one Stryker
 * asks on every run via `enableFindRelatedTests`. Cached: the answer costs a jest spawn
 * (~0.5s) and several configs can name the same module.
 *
 * `--maxWorkers=1` keeps the nested run from starting haste-map crawler workers inside
 * a jest worker. It does not change the answer — the same 13 suites come back for
 * TimelineChildren either way, checked 2026-09-08.
 *
 * It is NOT a fix for "A worker process has failed to exit gracefully". That line shows
 * up in a full run on the unchanged tree too (2 of 3 runs, 2026-09-08) and shows up with
 * this whole suite excluded (3 of 3). Written down because the first reading of it here
 * was that this spawn caused it, and running the suite-excluded control is what said
 * otherwise.
 */
const relatedCache = new Map<string, string[]>();
function relatedSuites(module: string): string[] {
    const hit = relatedCache.get(module);
    if (hit) return hit;
    let out: string[] = [];
    try {
        out = execSync(
            `node node_modules/.bin/jest --listTests --maxWorkers=1 --findRelatedTests ${JSON.stringify(module)}`,
            { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
        )
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
            .map((abs) => abs.slice(ROOT.length + 1));
    } catch {
        out = [];
    }
    relatedCache.set(module, out);
    return out;
}

/**
 * Does any selected test file cover this module?
 *
 * TEXT FIRST, IMPORT GRAPH SECOND, because they answer different halves. Naming the
 * module's stem is how a mirroring suite declares its subject, and it is cheap. But
 * `suitesFor` now falls back to jest's import graph for a module NO suite is named
 * after, and for 81 of the 165 modules that fallback reaches, no related suite mentions
 * the stem at all — measured 2026-09-08. Those are exactly the modules tested only
 * through a consumer, which is the shape the fallback exists to measure, so a stem grep
 * would fail this enforcer the first time the focus config targets one.
 *
 * Asking jest is not a second heuristic: it is the same resolver Stryker uses to decide
 * which tests run against the mutant, so a suite it names is a suite that really imports
 * the module.
 */
function covered(p: Pairing, module: string): boolean {
    const stem = basename(module).replace(/\.tsx?$/, '');
    const named = p.testFiles.some((t) => {
        const full = join(ROOT, t);
        if (!existsSync(full)) return false;
        const body = readFileSync(full, 'utf8');
        return body.includes(`/${stem}`) || body.includes(`'${stem}'`);
    });
    if (named) return true;
    // Nothing selected, or nothing to select against: no spawn can change the answer.
    if (!p.testFiles.length || !existsSync(join(ROOT, module))) return false;
    const related = relatedSuites(module);
    return p.testFiles.some((t) => related.includes(t));
}

describe('every mutated module has a test selected to cover it', () => {
    it('CONTROL: the configs are found and both lists are non-empty', () => {
        // Without this, an unreadable config yields two empty lists that agree
        // perfectly — the vacuous pass this whole suite is about.
        for (const c of CONFIGS) {
            const p = load(c);
            expect({
                config: c,
                mutate: p.mutate.length > 0,
                tests: p.testFiles.length > 0,
            }).toEqual({ config: c, mutate: true, tests: true });
        }
    });

    it('every test path named by a jest config exists', () => {
        const missing: string[] = [];
        for (const c of CONFIGS) {
            const p = load(c);
            for (const t of p.testFiles) {
                if (!existsSync(join(ROOT, t))) missing.push(`${p.jestConfig}  ${t}`);
            }
        }
        expect(missing).toStrictEqual([]);
    });

    it.each(CONFIGS)('%s: no mutated module is left with no test selected', (c) => {
        const p = load(c);
        const uncovered = p.mutate.filter((m) => !covered(p, m));
        // A module here would report 0% and read as a coverage catastrophe.
        expect(uncovered).toStrictEqual([]);
    });

    it.each(CONFIGS)('%s: EVERY suite for a mutated module is selected, not just one', (c) => {
        // The check above asks whether a module has AT LEAST ONE test selected. That is
        // not enough, and the gap is not theoretical: on 2026-08-31 installHandler had 12
        // of its 13 suites wired and integrationCardModel had 1 of its 5. Both passed the
        // at-least-one check and both reported a score built on a fraction of their tests
        // — installHandler at 49.17% with 112 "uncovered" mutants, integrationCardModel at
        // 42.96%. Neither number described the tests that exist; they described the tests
        // the runner happened to load, and both were read as findings about test quality.
        const p = load(c);
        // `--cached --others --exclude-standard` = tracked PLUS untracked-not-ignored.
        // Tracked-only makes this check blind to a test file that has not been committed
        // yet, which is exactly when it matters: on 2026-09-02 a new suite passed the
        // local gate and failed CI the instant it was committed, because the gate ran
        // while the file was still untracked. A check that cannot see new work is a
        // check that reports on the previous commit. `architectureScan.ts` already does
        // it this way.
        const onDisk = execSync(
            'git ls-files --cached --others --exclude-standard "tests/**/*.test.ts" "tests/**/*.test.tsx"',
            {
                cwd: ROOT,
                encoding: 'utf8',
            }
        )
            .trim()
            .split('\n');

        const gaps: string[] = [];
        for (const m of p.mutate) {
            const absent = siblingSuites(m, onDisk).filter(
                (t) => !p.testFiles.some((sel) => sel.endsWith(t))
            );
            for (const a of absent) gaps.push(`${m}  <-  ${a}`);
        }
        expect(gaps).toStrictEqual([]);
    });

    it('CONTROL: a STRAYED suite counts only when no same-named module could own it', () => {
        // The four useSelectionStep suites live under features/authentication and test
        // core/ui/hooks/useSelectionStep.ts; no authentication module has that name, so
        // they are this module's. The app-builder migration suite is NOT core/state's,
        // because src/features/app-builder/services has its own module of that name.
        const onDisk = [
            'tests/core/ui/hooks/useSelectionStep.test.ts',
            'tests/features/authentication/ui/hooks/useSelectionStep-basic.test.tsx',
            'tests/core/state/appBuilderComponentMigration.test.ts',
            'tests/features/app-builder/services/appBuilderComponentMigration.test.ts',
        ];
        const sourceExists = (p: string) =>
            p === 'src/features/app-builder/services/appBuilderComponentMigration.ts';
        expect(
            siblingSuites('src/core/ui/hooks/useSelectionStep.ts', onDisk, sourceExists)
        ).toEqual([
            'tests/core/ui/hooks/useSelectionStep.test.ts',
            'tests/features/authentication/ui/hooks/useSelectionStep-basic.test.tsx',
        ]);
        expect(
            siblingSuites('src/core/state/appBuilderComponentMigration.ts', onDisk, sourceExists)
        ).toEqual(['tests/core/state/appBuilderComponentMigration.test.ts']);
    });

    it('CONTROL: sibling suites are found by MIRROR PATH, not by basename alone', () => {
        // Twelve basenames under src/ name two different modules
        // (`appBuilderComponentMigration.ts` lives in core/state AND in
        // features/app-builder/services). Matching on the name alone told the
        // 2026-09-03 focus run that the feature module's suite belonged to the
        // core one, and the only way to satisfy it would have been to wire a
        // suite that never touches the mutated file.
        const onDisk = [
            'tests/core/state/appBuilderComponentMigration.test.ts',
            'tests/features/app-builder/services/appBuilderComponentMigration.test.ts',
            'tests/core/state/stateManager.test.ts',
            'tests/core/state/stateManager-projects.test.ts',
            'tests/core/state/stateManager.disposal.test.ts',
            'tests/core/state/stateManagerFake.test.ts',
        ];
        expect(siblingSuites('src/core/state/appBuilderComponentMigration.ts', onDisk)).toEqual([
            'tests/core/state/appBuilderComponentMigration.test.ts',
        ]);
        // Positive control: both split separators are siblings; a longer stem is not.
        expect(siblingSuites('src/core/state/stateManager.ts', onDisk)).toEqual([
            'tests/core/state/stateManager.test.ts',
            'tests/core/state/stateManager-projects.test.ts',
            'tests/core/state/stateManager.disposal.test.ts',
        ]);
    });

    it('CONTROL: the every-suite check can actually fail', () => {
        // Same reasoning as the control below: a check that cannot fail reports a clean
        // config and a broken one identically. A module with a real suite on disk and an
        // empty selection must come back uncovered.
        const nothingSelected: Pairing = {
            strykerConfig: 'x',
            jestConfig: 'y',
            mutate: ['src/features/updates/services/envMerge.ts'],
            testFiles: [],
        };
        expect(covered(nothingSelected, nothingSelected.mutate[0])).toBe(false);
    });

    it('CONTROL: the coverage check can actually fail', () => {
        // Proves the zeros above mean "all covered", not "the matcher never matches".
        //
        // The negative probe reads a DIFFERENT file on purpose. Pointing it at this
        // one made it pass-as-covered on the first run: the module name written here
        // as a literal is itself text in the file being searched, so the check found
        // its own control. A negative control that names its subject cannot search
        // the file it is written in.
        const elsewhere: Pairing = {
            strykerConfig: 'x',
            jestConfig: 'y',
            mutate: [],
            testFiles: ['tests/sop/no-bare-sleep.test.ts'],
        };
        expect(covered(elsewhere, 'src/features/nothing/atAll.ts')).toBe(false);

        const here: Pairing = {
            ...elsewhere,
            testFiles: ['tests/sop/mutation-config-pairing.test.ts'],
        };
        expect(covered(here, 'src/anywhere/mutation-config-pairing.ts')).toBe(true);
    });

    it('CONTROL: a suite that IMPORTS the module counts even when it never names it', () => {
        // The half the stem grep cannot answer, and the whole reason `suitesFor` gained
        // its import-graph fallback: TimelineNav-interaction imports TimelineNav, which
        // imports TimelineChildren, and the suite never writes the word
        // "TimelineChildren" anywhere. 81 of the 165 modules the fallback reaches look
        // like this (measured 2026-09-08) — without the import-graph half, this enforcer
        // goes red the first time the focus config targets one of them.
        const module = 'src/core/ui/components/TimelineChildren.tsx';
        const selected: Pairing = {
            strykerConfig: 'x',
            jestConfig: 'y',
            mutate: [module],
            testFiles: ['tests/core/ui/components/TimelineNav-interaction.test.tsx'],
        };
        // The grep half really does miss it — otherwise this control proves nothing.
        expect(readFileSync(join(ROOT, selected.testFiles[0]), 'utf8')).not.toContain(
            'TimelineChildren'
        );
        expect(covered(selected, module)).toBe(true);

        // NEGATIVE: an unrelated suite is still not coverage. Without this, an
        // implementation that returned true whenever anything was selected would pass.
        const unrelated: Pairing = { ...selected, testFiles: ['tests/sop/no-bare-sleep.test.ts'] };
        expect(covered(unrelated, module)).toBe(false);
    });
});

describe('the mutation baseline covers what the config mutates', () => {
    /**
     * The per-build half of the mutation ratchet. The comparison itself only runs
     * when Stryker runs (minutes to hours), so what CAN be checked every build is
     * that a module in `mutate` has a baseline row — without one it is measured
     * against nothing — and that every row is still REPRODUCIBLE.
     *
     * THIS USED TO BE A BOTH-DIRECTIONS CHECK, and the second direction was
     * "a baseline row for a module the sample does not mutate is a number nobody
     * can reproduce". That was true while the ~16-minute sample run was the only way
     * to measure anything. It stopped being true when the focused runner landed: any
     * single module reproduces in under a minute via `scripts/focusModule.mjs`, and
     * `scripts/mutationSweep.mjs` baselines the whole 507-module included set that
     * way. Requiring every row to be in a 16-module sample config would cap the
     * baseline at 16 rows forever — which is the 3.2% coverage the sweep exists to fix.
     *
     * So the direction that still means something is kept, in the form that is now
     * true: a row must name a file that exists AND has a mirrored suite, because
     * either one missing is a number that cannot be produced again.
     */
    const BASELINE = join(ROOT, 'reports/mutation/baseline.json');

    it('CONTROL: the baseline exists and is non-empty', () => {
        expect(existsSync(BASELINE)).toBe(true);
        const modules = JSON.parse(readFileSync(BASELINE, 'utf8')).modules;
        expect(Object.keys(modules).length).toBeGreaterThan(3);
    });

    it('every module the sample mutates has a baseline row', () => {
        const modules: Record<string, unknown> = JSON.parse(readFileSync(BASELINE, 'utf8')).modules;
        const mutate: string[] = JSON.parse(
            readFileSync(join(ROOT, 'stryker.pl22.config.json'), 'utf8')
        ).mutate;
        expect(mutate.filter((m) => !(m in modules))).toStrictEqual([]);
    });

    it('every baseline row names a module that can still be re-measured', () => {
        const modules: Record<string, unknown> = JSON.parse(readFileSync(BASELINE, 'utf8')).modules;
        const unreproducible = Object.keys(modules).filter((m) => {
            if (!existsSync(join(ROOT, m))) return true;
            // The same mirror convention focusModule.mjs uses to select suites. No
            // suite means a re-run would report a confident zero rather than fail.
            const stem = basename(m).replace(/\.tsx?$/, '');
            const dir = join(ROOT, 'tests', dirname(m).slice('src/'.length));
            if (!existsSync(dir)) return true;
            return !readdirSync(dir).some(
                (f) =>
                    f === `${stem}.test.ts` ||
                    f === `${stem}.test.tsx` ||
                    ((f.startsWith(`${stem}-`) || f.startsWith(`${stem}.`)) &&
                        /\.test\.tsx?$/.test(f))
            );
        });
        expect(unreproducible).toStrictEqual([]);
    });

    it('every baseline row carries the fields the ratchet compares', () => {
        // A row missing `highValueSurvivors` would silently disable the anti-gaming
        // half of the check while the score half kept passing.
        const modules: Record<string, Record<string, unknown>> = JSON.parse(
            readFileSync(BASELINE, 'utf8')
        ).modules;
        const incomplete = Object.entries(modules)
            .filter(
                ([, r]) =>
                    typeof r.score !== 'number' ||
                    typeof r.noCoverage !== 'number' ||
                    typeof r.highValueSurvivors !== 'number'
            )
            .map(([p]) => p);
        expect(incomplete).toStrictEqual([]);
    });
});
