#!/usr/bin/env node
/**
 * Gate a fresh mutation run against the pinned baseline.
 *
 *   node scripts/checkMutationBaseline.mjs                 # check
 *   node scripts/checkMutationBaseline.mjs --write "note"  # accept as the new baseline
 *
 * Exit 1 on any regression. `--write` is deliberately a separate, explicit act:
 * accepting a worse baseline should take a decision, not a rerun.
 */
import { existsSync } from 'fs';
import { compare, writeBaseline } from './mutationBaseline.mjs';

const REPORT = 'reports/mutation/pl22.json';
const BASELINE = 'reports/mutation/baseline.json';

const write = process.argv.includes('--write');
const note = process.argv[process.argv.indexOf('--write') + 1] ?? '';

if (!existsSync(REPORT)) {
    console.error(`No report at ${REPORT}. Run \`npm run test:mutation:sample\` first.`);
    process.exit(1);
}

if (write || !existsSync(BASELINE)) {
    const modules = writeBaseline(REPORT, BASELINE, note);
    const n = Object.keys(modules).length;
    console.log(`${existsSync(BASELINE) ? 'Wrote' : 'Created'} ${BASELINE} — ${n} modules.`);
    for (const [p, r] of Object.entries(modules)) {
        console.log(
            `  ${r.score.toFixed(2).padStart(6)}%  ${String(r.highValueSurvivors).padStart(3)} branch/block` +
                `  ${String(r.noCoverage).padStart(3)} uncovered  ${p.split('/').pop()}`
        );
    }
    process.exit(0);
}

const { problems, now, base } = compare(REPORT, BASELINE);

console.log('module                          baseline    now   branch/block   uncovered');
for (const [p, b] of Object.entries(base)) {
    const n = now[p];
    if (!n) continue;
    const name = p.split('/').pop().padEnd(30);
    const arrow = n.score > b.score ? '↑' : n.score < b.score ? '↓' : ' ';
    console.log(
        `${name} ${b.score.toFixed(2).padStart(7)}% ${n.score.toFixed(2).padStart(6)}%${arrow}` +
            `   ${String(b.highValueSurvivors).padStart(3)} -> ${String(n.highValueSurvivors).padEnd(3)}` +
            `   ${String(b.noCoverage).padStart(3)} -> ${n.noCoverage}`
    );
}

if (problems.length === 0) {
    console.log('\nRatchet held.');
    process.exit(0);
}

console.error(`\n${problems.length} regression(s):\n`);
for (const p of problems) console.error(`  - ${p}`);
console.error(
    '\nIf these numbers are genuinely better, accept them explicitly:\n' +
        '  node scripts/checkMutationBaseline.mjs --write "why this is an improvement"'
);
process.exit(1);
