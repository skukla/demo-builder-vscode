#!/usr/bin/env node
/**
 * Witness census (PL-13 pre-flight, owner-ordered 2026-08-28): for every file
 * in the ADR-015 convergence queue, find its test suites and classify them —
 * can they actually OBJECT to a bad refactor, or would they pass regardless?
 *
 *   WITNESS — asserts how collaborators are CALLED (toHaveBeenCalledWith /
 *             mock.calls inspection). Can vouch for a behavior-preserving
 *             refactor.
 *   BLIND   — mocks exist but assertions never inspect collaborator calls.
 *             Passes whether or not the refactor broke the call shapes.
 *   UNTESTED — no suite imports the module at all. The worst bucket.
 *
 * Same ledger discipline as everything else: every queue file gets a row;
 * a missing row means the census is not done.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const HARNESS = new URL('.', import.meta.url).pathname;
const ROOT = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const ledger = JSON.parse(readFileSync(`${ROOT}/tests/sop/architecture-rules.exemptions.json`, 'utf8'));
const queue = [...new Set([
    ...Object.keys(ledger.fetchBoundary),
    ...Object.keys(ledger.constructionBoundary),
])];

const testFiles = execSync(`git ls-files 'tests/**/*.ts' 'tests/**/*.tsx'`, { encoding: 'utf8', cwd: ROOT })
    .trim().split('\n');
const testSrc = new Map(testFiles.map((f) => [f, readFileSync(`${ROOT}/${f}`, 'utf8')]));

/** Import specifiers that would pull in this src module. */
function specifiersFor(srcFile) {
    const noExt = srcFile.replace(/\.tsx?$/, '');
    const alias = noExt.replace(/^src\//, '@/');
    const base = noExt.split('/').pop();
    return { alias, base };
}

const rows = [];
for (const f of queue) {
    const { alias, base } = specifiersFor(f);
    const suites = testFiles.filter((t) => {
        const s = testSrc.get(t);
        return s.includes(`'${alias}'`) || s.includes(`"${alias}"`) ||
            new RegExp(`from ['"][./]+.*\\b${base}['"]`).test(s);
    });
    if (suites.length === 0) {
        rows.push({ unit: f, verdict: 'UNTESTED', suites: [] });
        continue;
    }
    let witness = false;
    for (const t of suites) {
        const s = testSrc.get(t);
        if (/toHaveBeenCalledWith\(/.test(s) || /\.mock\.calls\b/.test(s)) { witness = true; break; }
    }
    rows.push({ unit: f, verdict: witness ? 'WITNESS' : 'BLIND', suites });
}

// Reconciliation — the census's own done-gate.
if (rows.length !== queue.length) {
    console.error(`NOT DONE: ${rows.length} rows for ${queue.length} queue files`);
    process.exit(1);
}
writeFileSync(`${HARNESS}/test-census.json`, JSON.stringify({ rows }, null, 1));
const counts = rows.reduce((a, r) => ((a[r.verdict] = (a[r.verdict] ?? 0) + 1), a), {});
console.log(`census: ${rows.length}/${queue.length} queue files classified`, counts);
for (const r of rows.filter((x) => x.verdict === 'UNTESTED')) console.log('  UNTESTED:', r.unit);
for (const r of rows.filter((x) => x.verdict === 'BLIND')) console.log('  BLIND:', r.unit, `(${r.suites.length} suite(s))`);
