#!/usr/bin/env node
/**
 * Which tests earn their keep — read from a Stryker report.
 *
 *   node scripts/mutationRedundantTests.mjs [reports/mutation/focus.json]
 *
 * THE QUESTION. Mutation testing answers "would a test catch this defect". It does
 * not, by itself, answer the owner's follow-up (2026-09-03): "how do we know the
 * tests we have are NEEDED?" This reads the same report for the other direction —
 * per TEST, which mutants it killed and whether any other test killed them too.
 *
 * WHAT IT CAN AND CANNOT SAY, and why the distinction is in the output. With the
 * focused config's bail ON, Stryker stops at the FIRST test that kills a mutant, so
 * `killedBy` names one test even when several would have caught it, and "killed
 * nothing" mostly means "ran after the test that got the credit" — measured on
 * edsResetUI: eight tests with real argument assertions all read as 0. With
 * `disableBail: true` every killing test is recorded and "kills nothing that another
 * test does not also kill" is exact. `scripts/mutationRedundancySweep.mjs` runs it
 * that way over every finished module.
 */
import { fileURLToPath } from 'url';
import { existsSync, readFileSync, realpathSync } from 'fs';

/** Per-test kill accounting for one Stryker JSON report. */
export function analyse(reportPath) {
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    const testName = new Map();
    for (const [file, entry] of Object.entries(report.testFiles ?? {})) {
        for (const t of entry.tests ?? []) testName.set(t.id, `${file.split('/').slice(-2).join('/')} › ${t.name}`);
    }
    const kills = new Map();
    const covers = new Map();
    const unique = new Map();
    let mutants = 0;
    let bailed = 0;
    for (const file of Object.values(report.files)) {
        for (const m of file.mutants) {
            mutants += 1;
            for (const id of m.coveredBy ?? []) covers.set(id, (covers.get(id) ?? 0) + 1);
            for (const id of m.killedBy ?? []) kills.set(id, (kills.get(id) ?? 0) + 1);
            if ((m.killedBy?.length ?? 0) === 1) unique.set(m.killedBy[0], (unique.get(m.killedBy[0]) ?? 0) + 1);
            if (m.status === 'Killed' && (m.killedBy?.length ?? 0) === 1 && (m.coveredBy?.length ?? 0) > 1) bailed += 1;
        }
    }
    const rows = [...testName.keys()].map((id) => ({
        id,
        name: testName.get(id),
        kills: kills.get(id) ?? 0,
        unique: unique.get(id) ?? 0,
        covers: covers.get(id) ?? 0,
    }));
    // A MINIMAL COVER: the smallest set of tests (greedy) that still kills every mutant
    // any test killed. Tests outside it are droppable TOGETHER — which "no unique
    // kills" alone cannot say, because two tests can cover each other and removing
    // both loses the kill. Greedy is not guaranteed optimal; it is honest about that.
    const killedByTest = new Map([...testName.keys()].map((id) => [id, new Set()]));
    for (const file of Object.values(report.files)) {
        for (const m of file.mutants) for (const id of m.killedBy ?? []) killedByTest.get(id)?.add(m.id);
    }
    const uncovered = new Set([...killedByTest.values()].flatMap((s) => [...s]));
    const cover = new Set();
    while (uncovered.size) {
        let best = null;
        let bestGain = 0;
        for (const [id, set] of killedByTest) {
            if (cover.has(id)) continue;
            const gain = [...set].filter((m) => uncovered.has(m)).length;
            if (gain > bestGain) { best = id; bestGain = gain; }
        }
        if (!best) break;
        cover.add(best);
        for (const m of killedByTest.get(best)) uncovered.delete(m);
    }
    const droppable = [...testName.keys()].filter((id) => !cover.has(id) && (kills.get(id) ?? 0) > 0);

    return {
        mutants,
        tests: rows.length,
        cover: cover.size,
        droppable: droppable.map((id) => testName.get(id)),
        // Heuristic: with bail on, a killed mutant covered by several tests is credited
        // to exactly one. With bail off that pattern still occurs for genuinely unique
        // kills, so "bailOff" is only a strong hint; the sweep sets it explicitly.
        bailed,
        rows,
        killedNothing: rows.filter((r) => r.kills === 0).sort((a, b) => b.covers - a.covers),
        redundant: rows.filter((r) => r.kills > 0 && r.unique === 0).sort((a, b) => b.kills - a.kills),
        pulling: rows.filter((r) => r.unique > 0).length,
    };
}

function main() {
    const reportPath = process.argv[2] ?? 'reports/mutation/focus.json';
    const a = analyse(reportPath);
    const bailOff = process.argv.includes('--bail-off');
    console.log(`${reportPath}: ${a.mutants} mutants, ${a.tests} tests  (${bailOff ? 'bail OFF — redundancy is exact' : 'bail ON assumed — unique kills are a lower bound; pass --bail-off for a disableBail report'})\n`);
    console.log(`Tests that killed NOTHING: ${a.killedNothing.length} of ${a.tests}`);
    for (const r of a.killedNothing) console.log(`  covers ${String(r.covers).padStart(3)}, kills   0             ${r.name}`);
    console.log();
    console.log(`Tests whose every kill is ALSO made by another test${bailOff ? '' : ' (lower bound)'}: ${a.redundant.length} of ${a.tests}`);
    for (const r of a.redundant) console.log(`  covers ${String(r.covers).padStart(3)}, kills ${String(r.kills).padStart(3)}, unique 0   ${r.name}`);
    console.log();
    console.log(`${a.pulling} of ${a.tests} tests make at least one kill nobody else makes.`);
    console.log(`Minimal cover (greedy): ${a.cover} tests keep every kill. Droppable TOGETHER without losing a kill: ${a.droppable.length}`);
    for (const n of a.droppable) console.log(`  - ${n}`);
}

const isEntryPoint =
    !!process.argv[1] &&
    existsSync(process.argv[1]) &&
    realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isEntryPoint) main();
