#!/usr/bin/env node
/**
 * The audit's DONE-GATE. Reads ledger.json + denominators, and exits non-zero
 * unless every unit is accounted for. An audit that has not filled the ledger
 * CANNOT claim finished — "done" is this gate green, never a sentence.
 *
 *   node check-ledger.mjs            # reconcile
 *   node check-ledger.mjs --selftest # prove the gate can FAIL (planted holes)
 *
 * Ledger row: { unit, pattern, verdict: conforming|deviating|exempt, evidence }
 * — every `exempt` MUST carry evidence (the named-floor rule: an exemption
 * without a reason is an IOU, not a verdict).
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const HARNESS = new URL('.', import.meta.url).pathname;
const selftest = process.argv.includes('--selftest');

const denomOut = execSync(`bash ${HARNESS}/denominators.sh`, { encoding: 'utf8' });
const denominators = Object.fromEntries(
    denomOut.split('\n').filter((l) => l.includes('=')).map((l) => l.split('=')),
);

let ledger;
try {
    ledger = JSON.parse(readFileSync(`${HARNESS}/ledger.json`, 'utf8'));
} catch {
    console.error('NOT DONE: no ledger.json — nothing has been classified.');
    process.exit(1);
}

if (selftest) {
    // Plant a hole: drop one row per pattern and require the gate to catch it.
    for (const pattern of new Set(ledger.rows.map((r) => r.pattern))) {
        const idx = ledger.rows.findIndex((r) => r.pattern === pattern);
        const removed = ledger.rows.splice(idx, 1)[0];
        console.log(`selftest: removed ${pattern} row for ${removed.unit}`);
    }
}

const problems = [];
const VERDICTS = new Set(['conforming', 'deviating', 'exempt']);
for (const row of ledger.rows) {
    if (!VERDICTS.has(row.verdict)) problems.push(`${row.unit}: invalid verdict "${row.verdict}"`);
    if (row.verdict === 'exempt' && !row.evidence)
        problems.push(`${row.unit}: exempt without evidence — an IOU, not a verdict`);
}

// Per-pattern reconciliation: rows must equal the pattern's declared universe.
for (const [pattern, denomKey] of Object.entries(ledger.universes)) {
    const expected = Number(denominators[denomKey]);
    const got = ledger.rows.filter((r) => r.pattern === pattern).length;
    if (!Number.isFinite(expected)) problems.push(`${pattern}: unknown denominator "${denomKey}"`);
    else if (got !== expected)
        problems.push(`${pattern}: ${got} rows vs ${expected} ${denomKey} — ${expected - got} unit(s) unaccounted`);
}

if (problems.length) {
    console.error(`NOT DONE (${problems.length}):`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(selftest ? 0 : 1); // selftest EXPECTS the failure
}
if (selftest) {
    console.error('SELFTEST FAILED: planted holes were not detected');
    process.exit(2);
}
console.log(`DONE-GATE GREEN: ${ledger.rows.length} rows reconcile against every universe.`);
