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

/**
 * WHICH REPORT. Defaults to the sample; `--report <path>` points it at another.
 *
 * The focused run (`npm run test:mutation:focus`) writes `focus.json` and covers ONE
 * module. Without this flag it had no ratchet at all: a focus-driven change could make
 * a module worse and nothing would notice until the next ~16-minute sample run. That
 * is the wrong safety net for the loop that uses focus as its measurement.
 *
 * `--write` with `--report` MERGES: the measured module's row is replaced and the
 * rest are kept, so a focused run can raise the floor it just cleared.
 *
 * The baseline is shared on purpose. A module's row is a module's row whichever report
 * produced it, so a focus run checks the same pinned numbers the sample pinned — and
 * `compare` only looks at modules present in BOTH, so a focus report naturally checks
 * exactly its own module and ignores the other eleven.
 */
const reportFlag = process.argv.indexOf('--report');
const REPORT = reportFlag !== -1 ? process.argv[reportFlag + 1] : 'reports/mutation/pl22.json';
const BASELINE = 'reports/mutation/baseline.json';

const write = process.argv.includes('--write');
const note = process.argv[process.argv.indexOf('--write') + 1] ?? '';

if (!existsSync(REPORT)) {
    console.error(
        `No report at ${REPORT}. Run \`npm run test:mutation:sample\` (or ` +
            `\`npm run test:mutation:focus\` for a single module) first.`
    );
    process.exit(1);
}

// A partial report is MERGED, never written wholesale: it holds real numbers for the
// module it measured and knows nothing about the other eleven, so overwriting with it
// would switch the ratchet off for everything it did not look at.
const partial = reportFlag !== -1;

if (write || !existsSync(BASELINE)) {
    const modules = writeBaseline(REPORT, BASELINE, note, partial);
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

const { problems, now, base } = compare(REPORT, BASELINE, partial);

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
