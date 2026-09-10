#!/usr/bin/env node
/**
 * The convergence program's impact meter (owner-ordered 2026-08-28).
 *
 * Gathers every statistic the program moves, into one dated snapshot.
 * Impact = the diff between any two snapshots — never a narrative. Fast
 * metrics are measured live; expensive ones (coverage, run noise) are read
 * from their most recent artifacts WITH the artifact's own timestamp, so
 * staleness is visible, never hidden.
 *
 *   node program-metrics.mjs                # print + write snapshot
 *   node program-metrics.mjs --label before # name the snapshot file
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';

const HARNESS = new URL('.', import.meta.url).pathname;
const ROOT = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const sh = (cmd) => execSync(cmd, { encoding: 'utf8', cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).trim();
const labelIdx = process.argv.indexOf('--label');
const label = labelIdx > -1 ? process.argv[labelIdx + 1] : new Date().toISOString().slice(0, 10);

const m = { label, commit: sh('git rev-parse --short HEAD'), takenAt: new Date().toISOString() };

// ── Size (code removed shows here) ──────────────────────────────────────────
m.srcFiles = Number(sh(`git ls-files 'src/*.ts' 'src/*.tsx' 'src/**/*.ts' 'src/**/*.tsx' | wc -l`));
m.srcLines = Number(sh(`git ls-files 'src/*.ts' 'src/*.tsx' 'src/**/*.ts' 'src/**/*.tsx' | xargs wc -l | tail -1 | awk '{print $1}'`));
m.testFiles = Number(sh(`git ls-files 'tests/**/*.ts' 'tests/**/*.tsx' | wc -l`));
m.testLines = Number(sh(`git ls-files 'tests/**/*.ts' 'tests/**/*.tsx' | xargs wc -l | tail -1 | awk '{print $1}'`));

// ── Architecture debt (the program's primary target) ────────────────────────
// TWO ledgers since 2026-08-29: ADR-015 rules the extension host, ADR-017 the
// webviews, and the split moved `hookRefs` from the first to the second
// (cf49e8fbd). This file kept reading `arch.hookRefs` and crashed on undefined
// — for as long as it took someone to run it, which was days, because nothing
// did. Registered in tests/sop/toolingRegistry.ts now so that cannot recur.
const arch = JSON.parse(readFileSync(`${ROOT}/tests/sop/architecture-rules.exemptions.json`, 'utf8'));
const web = JSON.parse(
    readFileSync(`${ROOT}/tests/sop/webview-architecture-rules.exemptions.json`, 'utf8'),
);
/** Fail loudly on a key that moved again, rather than silently scoring it 0. */
const rows = (ledger, key) => {
    const bucket = ledger[key];
    if (!bucket) throw new Error(`exemption ledger has no "${key}" — did it move between ADRs?`);
    return Object.keys(bucket).length;
};
m.archExemptions = {
    fetchBoundary: rows(arch, 'fetchBoundary'),
    constructionBoundary: rows(arch, 'constructionBoundary'),
    commandBase: rows(arch, 'commandBase'),
    typesPurity: rows(arch, 'typesPurity'),
    hookRefs: rows(web, 'hookRefs'),
    sendMessageCeiling: arch.patternBSendMessageCeiling,
};
m.archExemptionTotal = Object.values(m.archExemptions).reduce((a, b) => a + (typeof b === 'number' && b < 1000 ? b : 0), 0) - m.archExemptions.sendMessageCeiling + 0;
m.archExemptionRows =
    m.archExemptions.fetchBoundary + m.archExemptions.constructionBoundary +
    m.archExemptions.commandBase + m.archExemptions.typesPurity + m.archExemptions.hookRefs;

// ── Test-double styles + craft flags (from the craft census, re-run live) ───
sh(`node ${HARNESS}/craft-census.mjs > /dev/null 2>&1 || true`);
const craft = JSON.parse(readFileSync(`${HARNESS}/craft-census.json`, 'utf8'));
m.suites = craft.rows.length;
m.doubleStyles = craft.rows.reduce((a, r) => ((a[r.doubleStyle] = (a[r.doubleStyle] ?? 0) + 1), a), {});
m.craftFlags = craft.rows.reduce((a, r) => { for (const f of r.flags) a[f] = (a[f] ?? 0) + 1; return a; }, {});

// ── Duplication (live jscpd, tests tree) ────────────────────────────────────
try {
    const out = sh(`npx jscpd tests --min-lines 20 --min-tokens 140 --reporters console --silent 2>&1 | head -3`);
    const mm = out.match(/Found .?\[?1?m?(\d+).? exact clones with .*?\((\d+\.?\d*)%\)/) ??
        out.replace(/\x1b\[[0-9;]*m/g, '').match(/Found (\d+) exact clones with \d+\((\d+\.?\d*)%\)/);
    if (mm) { m.testClones = Number(mm[1]); m.testClonePct = Number(mm[2]); }
} catch { m.testClones = null; }

// ── Coverage + noise: read from freshest artifacts, stamped ─────────────────
if (existsSync(`${ROOT}/coverage/coverage-summary.json`)) {
    const cov = JSON.parse(readFileSync(`${ROOT}/coverage/coverage-summary.json`, 'utf8')).total;
    m.coverage = {
        lines: cov.lines.pct, branches: cov.branches.pct, functions: cov.functions.pct,
        artifactAge: statSync(`${ROOT}/coverage/coverage-summary.json`).mtime.toISOString(),
    };
}
// Noise comes from the latest full-run log if the caller names one via env.
if (process.env.RUN_LOG && existsSync(process.env.RUN_LOG)) {
    const log = readFileSync(process.env.RUN_LOG, 'utf8');
    m.noise = {
        actWarnings: (log.match(/not wrapped in act/g) ?? []).length,
        propWarnings: (log.match(/Warning: React does not recognize|Warning: Unknown event handler/g) ?? []).length,
        consoleErrorLines: (log.match(/console\.error/g) ?? []).length,
        consoleWarnLines: (log.match(/console\.warn/g) ?? []).length,
        artifact: process.env.RUN_LOG,
    };
}

const file = `${HARNESS}/metrics-${label}.json`;
writeFileSync(file, JSON.stringify(m, null, 1));
console.log(JSON.stringify(m, null, 1));
console.log(`\nsnapshot: ${file}`);
