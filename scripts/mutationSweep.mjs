#!/usr/bin/env node
/**
 * Baseline every INCLUDED module, one focused run at a time, unattended.
 *
 *   node scripts/mutationSweep.mjs --minutes 480          # a night's budget
 *   node scripts/mutationSweep.mjs --limit 3              # a dry run
 *   node scripts/mutationSweep.mjs --minutes 480 --redo   # re-measure pinned ones too
 *
 * WHY THIS EXISTS. 16 of 507 included modules were measured — 3.2%. Every module we
 * know to be weak was found by measuring one, so the map is worth more than another
 * pass over the same sixteen: you cannot aim at the worst code without knowing where
 * it is. At the focused runner's 1-3 minutes per module the whole set is 8-25 hours,
 * which is one or two unattended nights and needs no agent, no tokens and no
 * supervision — just a machine that stays awake.
 *
 * THE SAFETY PROPERTY, and the reason for the default. `checkMutationBaseline --write`
 * accepts whatever it just measured as that module's new floor. For an UNMEASURED
 * module that is exactly right. For one already pinned it would silently lower the
 * floor if the run came in worse — turning a ratchet into a rubber stamp, unattended,
 * with nobody reading the output. So a module already in the baseline is SKIPPED
 * unless `--redo` is passed, which also makes the sweep resumable for free: stop it
 * whenever, start it again, it carries on where it left off.
 *
 * WHAT IT DOES NOT DO. It does not touch the 305 blocked files — 115 React, 120 with
 * no suite of their own, 70 with no tests at all. Those need the tooling gap closed or
 * tests written, and a sweep that pretended to measure them would report a confident
 * zero, which is the failure mode this whole instrument keeps having.
 */
import { spawnSync } from 'child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';

import { suitesFor } from './focusModule.mjs';

const BASELINE = 'reports/mutation/baseline.json';
const FOCUS_REPORT = 'reports/mutation/focus.json';
const LOG = 'reports/mutation/sweep-log.jsonl';

const arg = (name, fallback) => {
    const i = process.argv.indexOf(name);
    return i === -1 ? fallback : process.argv[i + 1];
};
const MINUTES = Number(arg('--minutes', '480'));
const LIMIT = Number(arg('--limit', '0'));
const PER_MODULE_MIN = Number(arg('--timeout-min', '12'));
const REDO = process.argv.includes('--redo');
/**
 * `--only <file>`: restrict the queue to the modules listed in that file, one per line.
 * Exists for a targeted re-measure — the 48 rows pinned before `openGaps` learned to
 * count uncovered mutants (2026-09-03) lack the per-category breakdown that fix added,
 * and the baseline alone cannot supply it. Combine with `--redo`, since those modules
 * are already pinned.
 */
const ONLY = arg('--only', '');

/** Modules the scope rule includes, in the order it lists them. */
function includedModules() {
    const r = spawnSync('node', ['scripts/mutationScope.mjs', '--list', 'include'], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
    });
    if (r.status !== 0) {
        console.error('Could not list the included set:\n' + (r.stderr || r.stdout));
        process.exit(1);
    }
    return r.stdout.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('src/'));
}

const pinned = () =>
    existsSync(BASELINE) ? new Set(Object.keys(JSON.parse(readFileSync(BASELINE, 'utf8')).modules)) : new Set();

/** Run a command, inheriting nothing — the sweep's own log is the record. */
function run(cmd, args, timeoutMs) {
    const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
    return {
        ok: r.status === 0,
        status: r.status,
        timedOut: r.error?.code === 'ETIMEDOUT',
        out: `${r.stdout ?? ''}${r.stderr ?? ''}`,
    };
}

function scoreOf(modulePath) {
    if (!existsSync(BASELINE)) return undefined;
    return JSON.parse(readFileSync(BASELINE, 'utf8')).modules[modulePath];
}

/**
 * The focused configs are GENERATED, and the sweep rewrites them once per module. Left
 * as they fell, every sweep produces a diff on two files nobody edited, pointing at
 * whichever module the run happened to stop on. Restoring them keeps the working tree
 * honest — the sweep's product is the baseline, not a config.
 */
function restoreFocusConfigs(saved) {
    for (const [path, content] of Object.entries(saved)) writeFileSync(path, content);
}

function main() {
    if (!existsSync(dirname(LOG))) mkdirSync(dirname(LOG), { recursive: true });

    const savedConfigs = Object.fromEntries(
        ['stryker.focus.config.json', 'jest.focus.config.js'].map((p) => [p, readFileSync(p, 'utf8')])
    );
    // Restore on every exit path, Ctrl-C included — an interrupted overnight run is the
    // normal case, not the exception.
    process.on('exit', () => restoreFocusConfigs(savedConfigs));
    process.on('SIGINT', () => process.exit(130));
    process.on('SIGTERM', () => process.exit(143));

    const already = pinned();
    const all = includedModules();
    const only = ONLY
        ? new Set(readFileSync(ONLY, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean))
        : null;
    const queue = all.filter((m) => (REDO || !already.has(m)) && (!only || only.has(m)));

    console.log(`included: ${all.length}   already pinned: ${already.size}   to measure: ${queue.length}`);
    console.log(`budget: ${MINUTES} min   per-module cap: ${PER_MODULE_MIN} min\n`);

    const deadline = Date.now() + MINUTES * 60_000;
    const tally = { measured: 0, skipped: 0, failed: 0, timedOut: 0 };
    let i = 0;

    for (const mod of queue) {
        if (Date.now() > deadline) {
            console.log('\nBudget reached — stopping cleanly. Re-run to continue.');
            break;
        }
        if (LIMIT && tally.measured + tally.failed + tally.timedOut >= LIMIT) {
            console.log('\n--limit reached.');
            break;
        }
        i += 1;
        const started = Date.now();
        const label = `[${i}/${queue.length}] ${mod}`;

        // Refuse before spending minutes on it: a module the mirror convention finds no
        // suite for would be measured against nothing and report a confident zero.
        if (suitesFor(mod).length === 0) {
            tally.skipped += 1;
            console.log(`${label}\n    SKIP  no mirrored suite`);
            appendFileSync(LOG, JSON.stringify({ mod, outcome: 'skip-no-suite' }) + '\n');
            continue;
        }

        const focus = run('node', ['scripts/focusModule.mjs', mod], 60_000);
        if (!focus.ok) {
            tally.skipped += 1;
            console.log(`${label}\n    SKIP  ${focus.out.trim().split('\n')[0]}`);
            appendFileSync(LOG, JSON.stringify({ mod, outcome: 'skip-focus', detail: focus.out.trim() }) + '\n');
            continue;
        }

        const stryker = run('npx', ['stryker', 'run', 'stryker.focus.config.json'], PER_MODULE_MIN * 60_000);
        const mins = ((Date.now() - started) / 60_000).toFixed(1);

        if (stryker.timedOut) {
            tally.timedOut += 1;
            console.log(`${label}\n    TIMEOUT after ${mins} min`);
            appendFileSync(LOG, JSON.stringify({ mod, outcome: 'timeout', minutes: Number(mins) }) + '\n');
            continue;
        }
        // Stryker found nothing on the module's import graph to run. That is a suite
        // that matched by NAME without exercising the module — a "no suite" case the
        // text check in focusModule.mjs could not see — not a broken run. Filed as a
        // skip so the tally reads true and the module is retried by nobody.
        if (/No tests were executed/.test(stryker.out)) {
            tally.skipped += 1;
            console.log(`${label}\n    SKIP  named suite(s) never exercise the module — Stryker ran no tests`);
            appendFileSync(LOG, JSON.stringify({ mod, outcome: 'skip-no-related-tests' }) + '\n');
            continue;
        }
        if (!stryker.ok || !existsSync(FOCUS_REPORT)) {
            tally.failed += 1;
            // The FIRST error line is the cause; the last three are stack trace. Keeping
            // only the tail cost an hour on 2026-09-03: "Missing coverage results" was
            // the whole diagnosis and the log held `pool.js:69:13 | | Node.js v20`.
            const lines = stryker.out.trim().split('\n');
            const firstError = lines.find((l) => /ERROR|Error:/.test(l)) ?? '';
            const errorBody = lines.slice(lines.indexOf(firstError) + 1, lines.indexOf(firstError) + 4);
            const tailLines = [firstError, ...errorBody, '…', ...lines.slice(-2)]
                .filter(Boolean)
                .map((l) => l.replace(/\x1b\[[0-9;]*m/g, '').trim())
                .join(' | ');
            console.log(`${label}\n    FAIL  exit ${stryker.status}: ${tailLines}`);
            appendFileSync(LOG, JSON.stringify({ mod, outcome: 'fail', status: stryker.status, detail: tailLines }) + '\n');
            continue;
        }

        const write = run(
            'node',
            ['scripts/checkMutationBaseline.mjs', '--report', FOCUS_REPORT, '--write', 'baseline sweep'],
            120_000
        );
        if (!write.ok) {
            tally.failed += 1;
            console.log(`${label}\n    FAIL  could not pin: ${write.out.trim().split('\n').slice(-2).join(' | ')}`);
            appendFileSync(LOG, JSON.stringify({ mod, outcome: 'fail-pin', detail: write.out.trim() }) + '\n');
            continue;
        }

        tally.measured += 1;
        const row = scoreOf(mod);
        console.log(
            `${label}\n    ${String(row?.score ?? '?').padStart(6)}%  ` +
                `openGaps ${row?.openGaps ?? '?'}   ${mins} min`
        );
        appendFileSync(
            LOG,
            JSON.stringify({ mod, outcome: 'measured', minutes: Number(mins), ...row }) + '\n'
        );
    }

    console.log(
        `\nmeasured ${tally.measured}   skipped ${tally.skipped}   ` +
            `failed ${tally.failed}   timed out ${tally.timedOut}`
    );
    console.log(`now pinned: ${pinned().size} of ${all.length} included`);
    console.log(`log: ${LOG}`);
}

main();
