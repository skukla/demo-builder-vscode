#!/usr/bin/env node
/**
 * Run the periodic tier of quality instruments — the layer that had no
 * automation and no index until 2026-08-29.
 *
 * The list comes from `tests/sop/toolingRegistry.ts`, never from this file. That
 * is the whole point: `tooling-registry.test.ts` fails the build when the
 * registry and the disk disagree, so a scan cannot exist without appearing here,
 * and this runner cannot silently omit one. A hardcoded list here would rot in
 * exactly the way the audit found.
 *
 * READING THE RESULT. A non-zero exit from a scan means "read this" — it does
 * not distinguish "found something" from "could not run", because most of these
 * tools do not distinguish those either. The one thing this runner does
 * distinguish is a command that never started (missing file, bad shell) from one
 * that ran and reported: the first is a broken instrument, the second is a
 * finding. Conflating them is how `docs:check` stayed broken for months.
 *
 * Findings are LEADS. Same rule as everywhere else in this repo: open both
 * implementations before calling anything duplication.
 */

import { execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY_TS = join(REPO_ROOT, 'tests', 'sop', 'toolingRegistry.ts');

/**
 * Load the registry by compiling it, rather than by re-declaring it.
 *
 * esbuild is already a dependency (it builds the extension). Compiling the real
 * typed module is what keeps this runner honest — there is no second copy of the
 * list to drift.
 */
function loadRegistry() {
    const dir = mkdtempSync(join(tmpdir(), 'sweep-'));
    try {
        const out = join(dir, 'registry.cjs');
        execSync(
            `npx esbuild "${REGISTRY_TS}" --bundle --platform=node --format=cjs --outfile="${out}"`,
            { cwd: REPO_ROOT, stdio: 'pipe' },
        );
        return require(out);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);

const { INSTRUMENTS, sweepable } = loadRegistry();
const toRun = sweepable();

const BAR = '─'.repeat(72);
console.log(`\n${BAR}\nSweep — ${toRun.length} scripted checks, from the registry\n${BAR}`);

const results = [];
for (const inst of toRun) {
    process.stdout.write(`  ${inst.id.padEnd(28)} `);
    const started = Date.now();
    const r = spawnSync(inst.runs, { cwd: REPO_ROOT, shell: true, encoding: 'utf8' });
    const secs = ((Date.now() - started) / 1000).toFixed(1);

    // A command that never started is a BROKEN INSTRUMENT, not a finding.
    const broken = r.error != null || r.status === 127;

    // A `report` always exits 0, so its exit code is not evidence of anything.
    // Calling it "clean" is how this runner printed a green line over a scan
    // that had just measured a 34% gap. Its output is the result; show it.
    const isReport = inst.resultKind === 'report';
    const status = broken
        ? 'COULD NOT RUN'
        : isReport
          ? 'reported'
          : r.status === 0
            ? 'clean'
            : 'READ THIS';
    console.log(`${status.padEnd(14)} ${secs}s`);
    results.push({
        ...inst,
        status,
        broken,
        isReport,
        code: r.status,
        output: (r.stdout || '') + (r.stderr || ''),
    });
}

const broken = results.filter((r) => r.broken);
const flagged = results.filter((r) => !r.broken && (r.isReport || r.code !== 0));

for (const r of [...broken, ...flagged]) {
    console.log(`\n${BAR}\n${r.id} — ${r.status}\n  ${r.what}\n  $ ${r.runs}\n${BAR}`);
    console.log(r.output.trim().split('\n').slice(-40).join('\n'));
}

// The instruments a script cannot run. Naming them is the point — a silent
// omission reads as "everything was swept".
const judgement = INSTRUMENTS.filter((i) => i.cadence === 'periodic' && i.runs === null);
console.log(`\n${BAR}\nNOT run here — ${judgement.length} guided reviews needing a person\n${BAR}`);
for (const i of judgement) console.log(`  ${i.id.padEnd(30)} ${i.unwiredReason}`);

console.log(`\n${BAR}`);
const reported = flagged.filter((r) => r.isReport).length;
console.log(
    `clean(gates): ${results.length - broken.length - flagged.length}   ` +
        `reported: ${reported}   failing gates: ${flagged.length - reported}   broken: ${broken.length}`,
);
if (broken.length) console.log(`\nA broken instrument is a bug in the tooling, not a finding. Fix or delete it.`);
console.log('');

// Only a broken instrument fails the sweep. Findings are for reading.
process.exit(broken.length ? 1 : 0);
