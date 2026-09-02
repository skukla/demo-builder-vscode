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
import { basename, join } from 'path';

const ROOT = join(__dirname, '..', '..');

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

/** Does any selected test file reference this module? */
function covered(p: Pairing, module: string): boolean {
    const stem = basename(module).replace(/\.tsx?$/, '');
    return p.testFiles.some((t) => {
        const full = join(ROOT, t);
        if (!existsSync(full)) return false;
        const body = readFileSync(full, 'utf8');
        return body.includes(`/${stem}`) || body.includes(`'${stem}'`);
    });
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
        expect(missing).toEqual([]);
    });

    it.each(CONFIGS)('%s: no mutated module is left with no test selected', (c) => {
        const p = load(c);
        const uncovered = p.mutate.filter((m) => !covered(p, m));
        // A module here would report 0% and read as a coverage catastrophe.
        expect(uncovered).toEqual([]);
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
        const onDisk = execSync('git ls-files "tests/**/*.test.ts" "tests/**/*.test.tsx"', {
            cwd: ROOT,
            encoding: 'utf8',
        })
            .trim()
            .split('\n');

        const gaps: string[] = [];
        for (const m of p.mutate) {
            const subject = basename(m).replace(/\.tsx?$/, '');
            // A suite belongs to a module when its filename before `.test.` matches the
            // module, allowing the `-slice` split this repo uses for large families.
            const siblings = onDisk.filter(
                (t) => basename(t).split('.test.')[0].split('-')[0] === subject,
            );
            const absent = siblings.filter((t) => !p.testFiles.some((sel) => sel.endsWith(t)));
            for (const a of absent) gaps.push(`${m}  <-  ${a}`);
        }
        expect(gaps).toEqual([]);
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
});

describe('the mutation baseline covers what the config mutates', () => {
    /**
     * The per-build half of the mutation ratchet. The comparison itself only runs
     * when Stryker runs (minutes to hours), so what CAN be checked every build is
     * that the two lists still line up: a module added to `mutate` without a
     * baseline row would be measured against nothing, and a baseline row for a
     * module no longer mutated is a number nobody can reproduce.
     *
     * Same both-directions contract as every other ledger here.
     */
    const BASELINE = join(ROOT, 'reports/mutation/baseline.json');

    it('CONTROL: the baseline exists and is non-empty', () => {
        expect(existsSync(BASELINE)).toBe(true);
        const modules = JSON.parse(readFileSync(BASELINE, 'utf8')).modules;
        expect(Object.keys(modules).length).toBeGreaterThan(3);
    });

    it('the baseline and the sample config agree, in both directions', () => {
        const modules: Record<string, unknown> = JSON.parse(
            readFileSync(BASELINE, 'utf8')
        ).modules;
        const mutate: string[] = JSON.parse(
            readFileSync(join(ROOT, 'stryker.pl22.config.json'), 'utf8')
        ).mutate;

        expect({
            mutatedWithNoBaseline: mutate.filter((m) => !(m in modules)),
            baselineForNothingMutated: Object.keys(modules).filter((m) => !mutate.includes(m)),
        }).toEqual({ mutatedWithNoBaseline: [], baselineForNothingMutated: [] });
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
        expect(incomplete).toEqual([]);
    });
});
