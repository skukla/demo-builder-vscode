#!/usr/bin/env node
/**
 * One reading of codebase health, appended to a history so runs can be compared.
 *
 *   node scripts/healthSnapshot.mjs                  # measure, show the delta
 *   node scripts/healthSnapshot.mjs --write "note"   # ...and append it to the history
 *
 * WHY THIS EXISTS. Every number below was already measured somewhere — a tracked
 * JSON, four shrink-only ledgers, a count pinned by a test, and two ratchets written
 * in PROSE inside a skill. Nothing joined them, so "is the codebase healthier than
 * last week?" had no answer, and the two prose ratchets (160 tests / 66 src) were
 * both stale by the time anyone looked.
 *
 * This file is DERIVED and never authoritative. Each metric is read from its real
 * source; if the two disagree, the source wins and this is the thing that is wrong.
 * The value it adds is a time series and a direction for each number, so a run can
 * be shown to have improved or regressed rather than merely to have happened.
 *
 * NOT A GATE. It reports; the exit code says nothing about the numbers. Deciding
 * whether a rise is drift or a deliberate trade is judgement, and the ratchets that
 * DO gate (the ledgers, the mutation baseline) already exist and are enforced where
 * they belong.
 *
 * PARAMETER-BOUND. The two jscpd invocations reproduce the flags their ratchets were
 * set with, exactly. A different flag set is a different metric, not movement — which
 * is a mistake already made once in this repo, comparing a 163-file scan against a
 * 1,524-file baseline.
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

const REPO = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const HISTORY = join(REPO, 'reports/health/history.json');

/** `lower` = down is better. `higher` = up is better. `flat` = context, not a score. */
const DIRECTION = {
    'dup.src.clones': 'lower',
    'dup.tests.clones': 'lower',
    'dup.tests.duplicatedLines': 'lower',
    'dup.tests.pct': 'lower',
    'dup.tests.pairsWebview': 'lower',
    'dup.tests.pairsService': 'lower',
    'mutation.scoreWeighted': 'higher',
    'mutation.modulesPinned': 'higher',
    'mutation.highValueSurvivors': 'lower',
    'mutation.noCoverage': 'lower',
    'debt.testFamilies': 'lower',
    'debt.loggerFakes': 'lower',
    'debt.consoleNoise': 'lower',
    'debt.archExemptions': 'lower',
    'conventions.total': 'higher',
    'conventions.enforced': 'higher',
    'suite.testFiles': 'flat',
};

function sh(cmd) {
    try {
        return execSync(cmd, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (e) {
        return e.stdout ?? '';
    }
}

/** jscpd's console summary, stripped of colour. Returns null if it did not run. */
function jscpdTotals(cmd) {
    const out = sh(cmd).replace(/\x1b\[[0-9;]*m/g, '');
    // The Total: row — files, lines, tokens, clones, "N (P%)" lines, "N (P%)" tokens.
    const row = /│\s*Total:\s*│[^│]*│[^│]*│[^│]*│\s*(\d+)\s*│\s*(\d+) \(([\d.]+)%\)/.exec(out);
    if (!row) return null;
    return { clones: +row[1], duplicatedLines: +row[2], pct: +row[3] };
}

/** Clone pairs split by whether either side is a webview (.tsx) suite. */
function jscpdPairs() {
    const outDir = join(REPO, 'reports/health/.jscpd-tests');
    sh(`npx jscpd tests --min-lines 20 --min-tokens 140 --reporters json --output ${outDir}`);
    const f = join(outDir, 'jscpd-report.json');
    if (!existsSync(f)) return null;
    const dups = JSON.parse(readFileSync(f, 'utf8')).duplicates ?? [];
    let webview = 0;
    let service = 0;
    for (const c of dups) {
        const tsx = c.firstFile.name.endsWith('.tsx') || c.secondFile.name.endsWith('.tsx');
        if (tsx) webview++;
        else service++;
    }
    return { webview, service };
}

function readJson(rel, fallback = null) {
    const p = join(REPO, rel);
    return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback;
}

function measure() {
    const m = {};
    const missing = [];

    // ---- duplication, on the exact commands the ratchets were set with ----
    const src = jscpdTotals('bash .claude/skills/code-duplication-scan/scan.sh src');
    if (src) m['dup.src.clones'] = src.clones;
    else missing.push('dup.src.* (jscpd over src did not report a Total row)');

    const tests = jscpdTotals('npx jscpd tests --min-lines 20 --min-tokens 140 --reporters console');
    if (tests) {
        m['dup.tests.clones'] = tests.clones;
        m['dup.tests.duplicatedLines'] = tests.duplicatedLines;
        m['dup.tests.pct'] = tests.pct;
    } else missing.push('dup.tests.* (jscpd over tests did not report a Total row)');

    const pairs = jscpdPairs();
    if (pairs) {
        m['dup.tests.pairsWebview'] = pairs.webview;
        m['dup.tests.pairsService'] = pairs.service;
    } else missing.push('dup.tests.pairs* (no jscpd json report)');

    // ---- mutation, READ from the pinned baseline, never re-measured here ----
    // Re-measuring is `npm run test:mutation:sample`; that run is 16 minutes for
    // eight modules and accepting a new baseline is a deliberate, separate act.
    const base = readJson('reports/mutation/baseline.json');
    if (base?.modules) {
        const mods = Object.values(base.modules);
        // Weighted by mutants, not a mean of percentages: a 40-mutant module and a
        // 400-mutant one are not equal evidence, and averaging them says they are.
        const killed = mods.reduce((n, r) => n + (r.killed ?? 0), 0);
        const total = mods.reduce(
            (n, r) => n + (r.killed ?? 0) + (r.survived ?? 0) + (r.noCoverage ?? 0) + (r.timeout ?? 0),
            0,
        );
        m['mutation.scoreWeighted'] = total ? +((killed / total) * 100).toFixed(2) : 0;
        m['mutation.modulesPinned'] = mods.length;
        m['mutation.highValueSurvivors'] = mods.reduce((n, r) => n + (r.highValueSurvivors ?? 0), 0);
        m['mutation.noCoverage'] = mods.reduce((n, r) => n + (r.noCoverage ?? 0), 0);
    } else missing.push('mutation.* (no reports/mutation/baseline.json)');

    // ---- debt ledgers, each read from the file that owns it ----
    const fam = readJson('tests/sop/test-family-setup.ledger.json');
    if (fam?.families) m['debt.testFamilies'] = fam.families.length;
    else missing.push('debt.testFamilies');

    const fakes = readJson('tests/sop/canonical-fakes.ledger.json');
    if (fakes?.logger) m['debt.loggerFakes'] = fakes.logger.length;
    else missing.push('debt.loggerFakes');

    const con = readJson('tests/setup/console-allowlist.json');
    if (con?.suites) m['debt.consoleNoise'] = con.suites.length;
    else missing.push('debt.consoleNoise');

    const ex = readJson('tests/sop/architecture-rules.exemptions.json');
    if (ex) {
        // Each category is an OBJECT keyed by exempted path, not an array — and one
        // entry (patternBSendMessageCeiling) is a numeric ceiling rather than a list
        // of exemptions at all. The first version of this counted `Array.isArray`
        // only and reported 0 against a real 30: a broken reader printing a perfect
        // score, which is the exact failure this file's own COULD NOT MEASURE
        // section exists to prevent.
        m['debt.archExemptions'] = Object.entries(ex)
            .filter(([k]) => !k.startsWith('_'))
            .reduce((n, [, v]) => n + (v && typeof v === 'object' ? Object.keys(v).length : 0), 0);
    } else missing.push('debt.archExemptions');

    // ---- enforcement ----
    const hb = readFileSync(join(REPO, 'docs/development/handbook.md'), 'utf8');
    const conv = /This handbook states (\d+) conventions\. (\d+) of them are enforced/.exec(hb);
    if (conv) {
        m['conventions.total'] = +conv[1];
        m['conventions.enforced'] = +conv[2];
    } else missing.push('conventions.* (the handbook sentence did not match)');

    m['suite.testFiles'] = sh("git ls-files 'tests/**/*.test.ts' 'tests/**/*.test.tsx'")
        .split('\n')
        .filter(Boolean).length;

    return { metrics: m, missing };
}

function render(now, prev, missing) {
    const keys = Object.keys(DIRECTION).filter((k) => k in now);
    const w = Math.max(...keys.map((k) => k.length));
    console.log('metric'.padEnd(w) + '      now       was     move');
    console.log('-'.repeat(w + 34));
    let better = 0;
    let worse = 0;
    for (const k of keys) {
        const n = now[k];
        const p = prev?.[k];
        let move = '';
        if (p !== undefined && p !== n) {
            const dir = DIRECTION[k];
            const good = dir === 'lower' ? n < p : dir === 'higher' ? n > p : null;
            if (good === true) better++;
            if (good === false) worse++;
            const d = (n - p).toFixed(k.endsWith('pct') || k.includes('score') ? 2 : 0);
            move = `${good === true ? 'better' : good === false ? 'WORSE' : ''} ${d > 0 ? '+' : ''}${d}`;
        } else if (p === undefined) {
            move = 'new';
        }
        console.log(
            k.padEnd(w) + String(n).padStart(9) + String(p ?? '—').padStart(10) + '   ' + move,
        );
    }
    console.log();
    if (prev) console.log(`  ${better} metric(s) improved, ${worse} regressed since the last snapshot.`);
    if (missing.length) {
        console.log('\n  COULD NOT MEASURE — these are broken instruments, not clean results:');
        for (const x of missing) console.log(`    ${x}`);
    }
    console.log('\n  Reported, never gated. A rise may be a deliberate trade; read it, do not obey it.');
}

const write = process.argv.includes('--write');
const note = write ? (process.argv[process.argv.indexOf('--write') + 1] ?? '') : '';

const { metrics, missing } = measure();
const history = readJson('reports/health/history.json', { _what: null, snapshots: [] });
history._what =
    'Derived time series of codebase health. Each metric is READ from its real source ' +
    '(the ledgers, the mutation baseline, the handbook); this file is never authoritative. ' +
    'Append-only — a snapshot is a reading, not a target.';
// Recorded WITH the history, not only in the script, because the whole point of a
// time series is that someone reads it months later and asks whether two snapshots
// are comparable. A metric measured with different flags is a different metric; if
// one of these commands changes, snapshots either side of the change are not.
history._definitions = {
    'dup.src.clones': 'bash .claude/skills/code-duplication-scan/scan.sh src  (min-lines 8, min-tokens 60, tests ignored) — ratchet 66',
    'dup.tests.*': 'npx jscpd tests --min-lines 20 --min-tokens 140 — ratchet 160 / 2.44%. Jitter is +/-1 between identical runs',
    'dup.tests.pairsWebview|pairsService': 'the same run, split by whether either side of the pair is a .tsx suite',
    'mutation.*': 'READ from reports/mutation/baseline.json, never re-measured here. scoreWeighted is killed/total mutants across pinned modules — NOT a mean of per-module percentages, which would weigh a 40-mutant module equally with a 400-mutant one',
    'debt.*': 'the length of each shrink-only ledger, read from the file that owns it',
    'conventions.*': 'the sentence in docs/development/handbook.md that tests/sop pins',
    'suite.testFiles': 'git ls-files over tests/**/*.test.ts(x)',
};
const prev = history.snapshots.at(-1)?.metrics;

render(metrics, prev, missing);

if (write) {
    if (missing.length) {
        console.log('\n  REFUSED to append: some metrics could not be measured, and a snapshot');
        console.log('  with holes reads later as a snapshot where those things were fine.');
        process.exit(1);
    }
    history.snapshots.push({
        at: new Date().toISOString().slice(0, 10),
        commit: sh('git rev-parse --short HEAD').trim(),
        note,
        metrics,
    });
    mkdirSync(dirname(HISTORY), { recursive: true });
    writeFileSync(HISTORY, JSON.stringify(history, null, 4) + '\n');
    console.log(`\n  Appended snapshot ${history.snapshots.length} to reports/health/history.json`);
}
