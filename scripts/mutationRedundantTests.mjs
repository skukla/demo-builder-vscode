#!/usr/bin/env node
/**
 * Which tests earn their keep — read from a Stryker report.
 *
 *   node scripts/mutationRedundantTests.mjs [reports/mutation/focus.json]
 *
 * THE QUESTION. Mutation testing answers "would a test catch this defect". It does
 * not, by itself, answer the owner's follow-up (2026-09-03): "how do we know the
 * tests we have are NEEDED?" This reads the same report for the other direction —
 * per TEST, which mutants it killed — and reports the tests that killed nothing.
 *
 * WHAT IT CAN AND CANNOT SAY, and why the distinction is in the output. Stryker
 * records `killedBy` per mutant. With the focused config's `perTest` coverage it
 * stops at the FIRST test that kills a mutant, so `killedBy` usually names one test
 * even when several would have caught it. That makes two very different claims:
 *
 *   killed nothing  — EXACT. No mutant in this run died in this test. Either it
 *                     asserts nothing the mutants can reach, or everything it
 *                     checks is also checked earlier by another test. Both are worth
 *                     a look; neither is proof of redundancy on its own.
 *   unique kills    — a LOWER BOUND on how much a test is worth, not a measure of
 *                     redundancy, for the bail reason above. Run Stryker with
 *                     `disableBail: true` for a report where every killing test is
 *                     recorded; then "kills nothing that another test does not also
 *                     kill" becomes an exact statement.
 */
import { readFileSync } from 'fs';

const REPORT = process.argv[2] ?? 'reports/mutation/focus.json';
const report = JSON.parse(readFileSync(REPORT, 'utf8'));

// Stryker names tests at the top level, keyed by id, grouped under the file that
// declares them.
const testName = new Map();
for (const [file, entry] of Object.entries(report.testFiles ?? {})) {
    for (const t of entry.tests ?? []) testName.set(t.id, `${file.split('/').slice(-2).join('/')} › ${t.name}`);
}

const kills = new Map([...testName.keys()].map((id) => [id, 0]));
const covers = new Map([...testName.keys()].map((id) => [id, 0]));
let mutants = 0;
let bailed = 0;
for (const file of Object.values(report.files)) {
    for (const m of file.mutants) {
        mutants += 1;
        for (const id of m.coveredBy ?? []) covers.set(id, (covers.get(id) ?? 0) + 1);
        for (const id of m.killedBy ?? []) kills.set(id, (kills.get(id) ?? 0) + 1);
        if (m.status === 'Killed' && (m.killedBy?.length ?? 0) === 1 && (m.coveredBy?.length ?? 0) > 1) bailed += 1;
    }
}

const rows = [...testName.keys()].map((id) => ({ id, name: testName.get(id), kills: kills.get(id) ?? 0, covers: covers.get(id) ?? 0 }));
const killedNothing = rows.filter((r) => r.kills === 0).sort((a, b) => b.covers - a.covers);

console.log(`${REPORT}: ${mutants} mutants, ${rows.length} tests\n`);
console.log(`Tests that killed NOTHING in this run: ${killedNothing.length} of ${rows.length}`);
for (const r of killedNothing) {
    console.log(`  covers ${String(r.covers).padStart(3)} mutants, kills 0   ${r.name}`);
}
console.log();
if (bailed) {
    console.log(
        `${bailed} killed mutants were covered by several tests but credited to one (bail). ` +
            `"Killed nothing" above is exact; redundancy is not measurable from this report — ` +
            `re-run with \`disableBail: true\` for that.`
    );
}
