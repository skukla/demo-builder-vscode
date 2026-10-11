#!/usr/bin/env node
/**
 * Combine the redundancy sweep's per-module reports into ONE cross-module answer.
 *
 *   node scripts/mutationRedundancyCombine.mjs            # reads reports/mutation/redundancy
 *   node scripts/mutationRedundancyCombine.mjs --json     # the full lists, for a review pass
 *   node scripts/mutationRedundancyCombine.mjs --dir <reports dir>
 *
 * WHY. The sweep's summary counts per MODULE, and a per-module count cannot be acted
 * on: a test that kills nothing for one module can be the only test holding another.
 * On 2026-10-10 the summary read "833 tests killed nothing" at the halfway mark, and
 * the largest group was 88 of 93 tests in timeoutConfig.test.ts, measured against
 * modules that merely import a constant. This reads every report and judges each test
 * ONCE, across every module it ran for.
 *
 * A test is one (test file, test name). Three groups come out:
 *   cover     — a greedy smallest set of tests that still kills every killed mutant
 *   overlap   — kills something, but only things the cover also kills
 *   idle      — ran in at least one measurement and killed nothing in any of them
 *
 * WHAT "IDLE" CAN AND CANNOT SAY. The sweep measures the modules in the baseline, not
 * every source file. A suite whose OWN module was never measured looks idle because
 * its subject was never mutated, so idle tests are split by whether their file mirrors
 * a measured module (the same `mirroringSuites` rule the focused run uses). Only the
 * `judged` half is a lead; the rest says nothing either way. And a lead is not a
 * verdict: a module of constants gives Stryker almost nothing to mutate, and a suite
 * that pins structure rather than behaviour kills no mutant by design. Read the test
 * before removing it.
 */
import { existsSync, readdirSync, readFileSync, realpathSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

import { mirroringSuites } from './focusModule.mjs';

/**
 * The report file a module's measurement is written to. The whole path, not the
 * basename: two modules named consoleApiHandlers.ts wrote the same file on 2026-10-10
 * and the second measurement replaced the first.
 */
export function reportNameFor(modulePath) {
    return `${modulePath.replace(/^src\//, '').replace(/\.tsx?$/, '').replaceAll('/', '__')}.json`;
}

const keyOf = (file, name) => `${file}\u0000${name}`;

/** Every report in `dir`: which tests ran, and which tests killed each mutant. */
function readReports(dir) {
    const seen = new Map(); // test key -> { file, name }
    const killers = new Map(); // mutant key -> Set of test keys
    const measured = new Set();
    for (const entry of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
        const report = JSON.parse(readFileSync(join(dir, entry), 'utf8'));
        if (!report.files) continue;
        const idToKey = new Map();
        for (const [file, suite] of Object.entries(report.testFiles ?? {})) {
            for (const test of suite.tests ?? []) {
                const key = keyOf(file, test.name);
                idToKey.set(test.id, key);
                seen.set(key, { file, name: test.name });
            }
        }
        for (const [modulePath, source] of Object.entries(report.files)) {
            measured.add(modulePath);
            for (const mutant of source.mutants ?? []) {
                const by = (mutant.killedBy ?? []).map((id) => idToKey.get(id)).filter(Boolean);
                if (by.length) killers.set(`${modulePath}\u0000${mutant.id}`, new Set(by));
            }
        }
    }
    return { seen, killers, measured };
}

/**
 * Greedy cover over every killed mutant: take the test that kills the most mutants
 * nothing chosen so far kills, until none are left. Not guaranteed smallest.
 */
function greedyCover(killers) {
    const kills = new Map(); // test key -> mutant keys
    for (const [mutant, tests] of killers) {
        for (const test of tests) {
            if (!kills.has(test)) kills.set(test, []);
            kills.get(test).push(mutant);
        }
    }
    const gain = new Map([...kills].map(([test, mutants]) => [test, mutants.length]));
    const uncovered = new Set(killers.keys());
    const cover = new Set();
    while (uncovered.size) {
        let best = null;
        for (const [test, n] of gain) if (n > 0 && (best === null || n > gain.get(best))) best = test;
        if (best === null) break;
        cover.add(best);
        for (const mutant of kills.get(best)) {
            if (!uncovered.delete(mutant)) continue;
            for (const test of killers.get(mutant)) gain.set(test, gain.get(test) - 1);
        }
    }
    return { cover, kills };
}

export function combine(dir) {
    const { seen, killers, measured } = readReports(dir);
    const { cover, kills } = greedyCover(killers);
    const judgedFiles = new Set([...measured].flatMap((modulePath) => mirroringSuites(modulePath)));
    const groups = { overlap: [], idleJudged: [], idleUnjudged: [] };
    const testsByFile = {};
    for (const [key, test] of seen) {
        testsByFile[test.file] = (testsByFile[test.file] ?? 0) + 1;
        if (cover.has(key)) continue;
        if (kills.has(key)) groups.overlap.push(test);
        else if (judgedFiles.has(test.file)) groups.idleJudged.push(test);
        else groups.idleUnjudged.push(test);
    }
    return {
        modules: measured.size,
        tests: seen.size,
        killedMutants: killers.size,
        cover: cover.size,
        testsByFile,
        overlap: groups.overlap,
        idle: { judged: groups.idleJudged, unjudged: groups.idleUnjudged },
    };
}

/** Test files with the most judged-idle tests, as `{ file, idle, tests }`. */
function idleByFile(result) {
    const idle = new Map();
    for (const test of result.idle.judged) idle.set(test.file, (idle.get(test.file) ?? 0) + 1);
    return [...idle]
        .map(([file, n]) => ({ file, idle: n, tests: result.testsByFile[file] }))
        .sort((a, b) => b.idle - a.idle);
}

function main() {
    const at = process.argv.indexOf('--dir');
    const dir = at === -1 ? 'reports/mutation/redundancy' : process.argv[at + 1];
    if (!existsSync(dir)) {
        console.error(`no reports at ${dir} — run scripts/mutationRedundancySweep.mjs first`);
        process.exit(2);
    }
    const result = combine(dir);
    if (process.argv.includes('--json')) {
        console.log(JSON.stringify(result, null, 1));
        return;
    }
    console.log(`${result.modules} modules, ${result.tests} tests, ${result.killedMutants} killed mutants`);
    console.log(`  cover (keeps every kill):                 ${result.cover}`);
    console.log(`  overlap (kills only what the cover does): ${result.overlap.length}`);
    console.log(`  idle, own module measured (the leads):    ${result.idle.judged.length}`);
    console.log(`  idle, own module NOT measured (unknown):  ${result.idle.unjudged.length}`);
    console.log('\nMost judged-idle tests, by file:');
    for (const row of idleByFile(result).slice(0, 25)) {
        console.log(`  ${String(row.idle).padStart(4)} of ${String(row.tests).padStart(4)}  ${row.file}`);
    }
}

const isEntryPoint =
    !!process.argv[1] &&
    existsSync(process.argv[1]) &&
    realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isEntryPoint) main();
