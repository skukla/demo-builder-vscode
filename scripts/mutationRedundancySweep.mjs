#!/usr/bin/env node
/**
 * Measure test REDUNDANCY across every finished module — bail off, one report each.
 *
 *   node scripts/mutationRedundancySweep.mjs --minutes 240
 *   node scripts/mutationRedundancySweep.mjs --only <file-of-modules>
 *   node scripts/mutationRedundancySweep.mjs --all        # every pinned module, not just finished
 *
 * WHY A SEPARATE SWEEP. The burn-down measures with bail ON: Stryker stops at the
 * first test that kills a mutant, which is what makes a module measurable in a
 * minute. But it also means `killedBy` names one test even when five would have
 * caught it, so "this test killed nothing" mostly says "this test ran late". The
 * owner's question — are the tests we have NEEDED — needs bail OFF, every killing
 * test recorded, and then "kills nothing that another test does not also kill" is
 * an exact statement. That is several times slower per module, so it is its own
 * pass, over modules whose gaps are already closed.
 *
 * ISOLATION. Writes its own Stryker and jest configs per module under
 * reports/mutation/redundancy/ and never touches stryker.focus.config.json, so it
 * cannot collide with a focused measurement the way two runs sharing those files
 * did on 2026-09-03. Run it alone anyway: two Stryker runs starve each other.
 *
 * RESUMABLE. A module with a report on disk is skipped. Delete the report to redo it.
 */
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, rmSync } from 'fs';
import { basename, join, resolve } from 'path';

import { suitesFor } from './focusModule.mjs';
import { isReactSuite } from './mutationScope.mjs';
import { analyse } from './mutationRedundantTests.mjs';

const ROOT = process.cwd();
const BASELINE = 'reports/mutation/baseline.json';
const DIR = 'reports/mutation/redundancy';
const SUMMARY = join(DIR, 'summary.jsonl');
// The generated CONFIGS live here, at the tree root, because `reports/` is in
// Stryker's ignorePatterns and is never copied into the sandbox — a config left
// there makes jest run against the REAL tree while Stryker mutates the copy, and
// reports "No tests were executed" (2026-09-03, three times). Gitignored.


const arg = (name, fallback) => {
    const i = process.argv.indexOf(name);
    return i === -1 ? fallback : process.argv[i + 1];
};
const MINUTES = Number(arg('--minutes', '240'));
const PER_MODULE_MIN = Number(arg('--timeout-min', '15'));
const ONLY = arg('--only', '');
const ALL = process.argv.includes('--all');

function configsFor(mod) {
    const stem = basename(mod).replace(/\.tsx?$/, '');
    const suites = suitesFor(mod);
    const react = suites.some(isReactSuite);
    // The JEST config must sit at the tree root: jest resolves everything relative
    // to the config file, and only a root-level config finds the suites inside
    // Stryker's sandbox copy (bisected 2026-09-03: bail-off alone worked, a config in
    // a subdirectory alone did not). One file, rewritten per module — the sweep runs
    // alone. Gitignored.
    const jestPath = resolve('jest.redundancy.config.js');
    // Both configs at the ROOT with RELATIVE paths, exactly as the working focus
    // setup does. An ABSOLUTE jest.configFile is passed through untouched, so jest
    // loads the real tree's config while Stryker mutates the sandbox — "No tests
    // were executed", four times on 2026-09-03 before this was bisected.
    const strykerPath = resolve('stryker.redundancy.config.json');
    const reportPath = resolve(DIR, `${stem}.json`);
    writeFileSync(
        jestPath,
        `// GENERATED per module by scripts/mutationRedundancySweep.mjs — do not edit.\n` +
            `const base = require('./jest.config.js');\n` +
            `const project = base.projects.find((p) => p.displayName === '${react ? 'react' : 'node'}');\n` +
            `module.exports = { ...project, displayName: 'redundancy', testMatch: [\n` +
            suites.map((s) => `    '**/${s}',`).join('\n') +
            `\n] };\n`
    );
    const base = JSON.parse(readFileSync('stryker.focus.config.json', 'utf8'));
    const cfg = {
        ...base,
        mutate: [mod],
        jest: { configFile: 'jest.redundancy.config.js', enableFindRelatedTests: true },
        jsonReporter: { fileName: `${DIR}/${stem}.json` },
        reporters: ['json'],
        tempDirName: '.stryker-tmp-redundancy',
        incremental: false,
        disableBail: true,
    };
    delete cfg.incrementalFile;
    writeFileSync(strykerPath, JSON.stringify(cfg, null, 2));
    return { strykerPath, reportPath, suites: suites.length };
}

function main() {
    if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
    const rows = JSON.parse(readFileSync(BASELINE, 'utf8')).modules;
    let mods = Object.entries(rows)
        .filter(([, r]) => ALL || r.openGaps === 0)
        .map(([m]) => m);
    if (ONLY) {
        const want = new Set(readFileSync(ONLY, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean));
        mods = mods.filter((m) => want.has(m));
    }
    const pending = mods.filter((m) => !existsSync(resolve(DIR, `${basename(m).replace(/\.tsx?$/, '')}.json`)));
    console.log(`candidates: ${mods.length}   already measured: ${mods.length - pending.length}   to run: ${pending.length}`);
    const deadline = Date.now() + MINUTES * 60_000;
    let n = 0;
    for (const mod of pending) {
        if (Date.now() > deadline) { console.log('\nbudget reached — re-run to continue'); break; }
        n += 1;
        const label = `[${n}/${pending.length}] ${mod}`;
        const { strykerPath, reportPath, suites } = configsFor(mod);
        if (!suites) { console.log(`${label}\n    SKIP no suites`); continue; }
        const started = Date.now();
        if (existsSync('.stryker-tmp-redundancy')) rmSync('.stryker-tmp-redundancy', { recursive: true, force: true });
        const r = spawnSync('npx', ['stryker', 'run', strykerPath], { encoding: 'utf8', timeout: PER_MODULE_MIN * 60_000, maxBuffer: 64 * 1024 * 1024 });
        const mins = ((Date.now() - started) / 60_000).toFixed(1);
        if (r.status !== 0 || !existsSync(reportPath)) {
            const first = `${r.stdout ?? ''}${r.stderr ?? ''}`.split('\n').find((l) => /ERROR|Error:/.test(l)) ?? '';
            console.log(`${label}\n    FAIL ${mins} min  ${first.replace(/\x1b\[[0-9;]*m/g, '').slice(0, 140)}`);
            appendFileSync(SUMMARY, JSON.stringify({ mod, outcome: 'fail', minutes: Number(mins) }) + '\n');
            continue;
        }
        const a = analyse(reportPath);
        const line = { mod, outcome: 'measured', minutes: Number(mins), tests: a.tests, mutants: a.mutants, killedNothing: a.killedNothing.length, redundant: a.redundant.length, pulling: a.pulling, cover: a.cover, droppable: a.droppable.length };
        appendFileSync(SUMMARY, JSON.stringify(line) + '\n');
        console.log(`${label}\n    tests ${a.tests}  cover ${a.cover}  droppable ${a.droppable.length}  redundant ${a.redundant.length}  killed-nothing ${a.killedNothing.length}   ${mins} min`);
    }
    console.log(`\nsummary: ${SUMMARY}`);
}

main();
