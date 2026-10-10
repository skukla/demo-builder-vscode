#!/usr/bin/env node
/**
 * Measure one module, or a small group, with a size limit and a time limit.
 *
 *   npm run test:mutation:measure -- src/features/eds/services/siteTools.ts
 *   npm run test:mutation:measure -- src/a.ts src/b.ts          # one run, two modules
 *   npm run test:mutation:measure -- --widen                    # after a run left mutants
 *                                                               # uncovered: add the importing
 *                                                               # suites and measure again
 *   npm run test:mutation:measure -- src/big.ts --timeout-min 30
 *
 * THIS IS THE WAY A WORKING SESSION MEASURES. It replaces the two-step "focus, then
 * `stryker run` in the background and wait for a line" that the burn-down goal used to
 * spell out, because that pair had nothing bounding it. On 2026-10-10 a session measured
 * nine files (1,112 mutants) in one run; it went 45 minutes with no result and was
 * killed by hand, and the session meanwhile sat in a shell loop waiting for `Done in`.
 *
 * WHAT IT BOUNDS.
 *   Size   A GROUP over the mutant budget (400) is refused before anything starts, with
 *          the per-module numbers, so it can be split. A module's size is its baseline
 *          row (killed + survived + noCoverage + timeout). A module with no row is
 *          ESTIMATED from its non-blank lines at the rate the baseline itself shows —
 *          every pinned module's mutants over its lines, 0.45 per line on 2026-10-10.
 *          That is a guess good to perhaps a third either way, and it says so. One
 *          module on its own is never refused for size: it cannot be split, so the
 *          time limit is what bounds it.
 *   Time   The Stryker run gets a wall-clock limit (12 minutes; `--timeout-min`). When
 *          it passes, the whole process tree is killed and this exits 124.
 *   State  `reports/mutation/run-status.json` says what is being measured and by which
 *          pid, and is rewritten every 30 seconds while it runs, so `npm run
 *          mutation:status` can tell a live run from a dead one without guessing.
 *   Mess   `.stryker-tmp-focus` and the incremental cache are removed on EVERY way out:
 *          done, failed, timed out, or sent a signal.
 *
 * WHAT IT DOES NOT DO. It does not write the baseline. The cycle measures, writes tests
 * and measures again before anything is pinned, and pinning a floor is a separate,
 * explicit act (`checkMutationBaseline.mjs --report … --write "<why>"`). The final line
 * names that command.
 *
 * EXIT CODES. 0 measured. 124 timed out. 2 refused — the group is over the budget, a
 * module has no suites or nothing to mutate, or another measurement is running. 143/130
 * on a signal. Anything else is a failure, and the Stryker output is in
 * `reports/mutation/measure-output.txt`.
 */
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

import { killActiveRuns, runBounded } from './boundedRun.mjs';
import { loadEquivalents, summarise } from './mutationBaseline.mjs';

const BASELINE = 'reports/mutation/baseline.json';
const FOCUS_REPORT = 'reports/mutation/focus.json';
const FOCUS_CONFIG = 'stryker.focus.config.json';
const INCREMENTAL = 'reports/mutation/focus-incremental.json';
const TEMP_DIR = '.stryker-tmp-focus';
const OUTPUT = 'reports/mutation/measure-output.txt';
export const STATUS_FILE = 'reports/mutation/run-status.json';

export const DEFAULT_BUDGET = 400;
export const DEFAULT_TIMEOUT_MIN = 12;
/** Used only when the baseline holds no row to derive a rate from. Measured 2026-10-10. */
const FALLBACK_MUTANTS_PER_LINE = 0.45;
const HEARTBEAT_EVERY_MS = 30_000;
const SETUP_TIMEOUT_MS = 120_000;

export const EXIT = { done: 0, failed: 1, refused: 2, timeout: 124 };
const SIGNAL_EXIT = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 };

const DEFAULT_DEPS = {
    focus: ['node', ['scripts/focusModule.mjs']],
    check: ['node', ['scripts/focusModule.mjs', '--check']],
    widen: ['node', ['scripts/focusModule.mjs', '--widen']],
    stryker: ['npx', ['stryker', 'run', FOCUS_CONFIG]],
    // `loadEquivalents` returns `{ counts, problems }`; `summarise` takes the counts.
    equivalents: () => loadEquivalents().counts,
};

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const mutantsIn = (row) => (row.killed ?? 0) + (row.survived ?? 0) + (row.noCoverage ?? 0) + (row.timeout ?? 0);
const lineCount = (path) => readFileSync(path, 'utf8').split('\n').filter((l) => l.trim()).length;
const minutesSince = (startedMs) => Number(((Date.now() - startedMs) / 60_000).toFixed(1));

function pidAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (err) {
        return err.code === 'EPERM';
    }
}

/** Mutants per non-blank line across every pinned module whose file still exists. */
function baselineRate(rows) {
    let mutants = 0;
    let lines = 0;
    for (const [path, row] of Object.entries(rows)) {
        if (!existsSync(path)) continue;
        mutants += mutantsIn(row);
        lines += lineCount(path);
    }
    return lines ? mutants / lines : FALLBACK_MUTANTS_PER_LINE;
}

/**
 * How many mutants each module will produce: its baseline row where it has one, an
 * estimate from its size where it does not.
 */
export function estimateMutants(modules, baselinePath = BASELINE) {
    const rows = existsSync(baselinePath) ? readJson(baselinePath).modules : {};
    let rate;
    return modules.map((module) => {
        if (rows[module]) return { module, mutants: mutantsIn(rows[module]), source: 'baseline row' };
        rate ??= baselineRate(rows);
        const lines = lineCount(module);
        return {
            module,
            mutants: Math.round(lines * rate),
            source: `estimated from ${lines} lines, no baseline row`,
        };
    });
}

/** Whether a group may be measured, and the words to print either way. */
export function budgetVerdict(estimates, budget, force) {
    const total = estimates.reduce((n, e) => n + e.mutants, 0);
    const breakdown = estimates.map((e) => `  ${e.module}: ${e.mutants} (${e.source})`).join('\n');
    if (total <= budget) return { ok: true, total, breakdown };
    if (estimates.length === 1) {
        const note = `${total} mutants is over the budget of ${budget}, but one module cannot be split — measuring it alone. Raise --timeout-min if the limit is not enough.`;
        return { ok: true, total, breakdown, note };
    }
    if (force) {
        return { ok: true, total, breakdown, note: `${total} mutants is over the budget of ${budget} — measuring anyway (--force).` };
    }
    return {
        ok: false,
        total,
        breakdown,
        reason: `${total} mutants in ${estimates.length} modules is over the budget of ${budget}. Split the group: measure the modules one at a time, or in smaller groups under ${budget}. (--force overrides.)`,
    };
}

function writeStatus(status) {
    mkdirSync(dirname(STATUS_FILE), { recursive: true });
    // Written beside and renamed, so a reader never sees half a file.
    writeFileSync(`${STATUS_FILE}.tmp`, JSON.stringify(status, null, 2) + '\n');
    renameSync(`${STATUS_FILE}.tmp`, STATUS_FILE);
}

/** Remove what a Stryker run leaves behind. Safe to call twice. */
function cleanUp() {
    rmSync(TEMP_DIR, { recursive: true, force: true });
    rmSync(INCREMENTAL, { force: true });
}

/** The measurement another process says it is running, if that process is alive. */
function liveMeasurement() {
    if (!existsSync(STATUS_FILE)) return null;
    try {
        const s = readJson(STATUS_FILE);
        return s.state === 'measuring' && s.pid !== process.pid && pidAlive(s.pid) ? s : null;
    } catch {
        return null;
    }
}

function currentFocus() {
    return existsSync(FOCUS_CONFIG) ? (readJson(FOCUS_CONFIG).mutate ?? []) : [];
}

const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** The first error line of a failed run, without colour codes. */
function firstError(out) {
    const line = out.split('\n').find((l) => /ERROR|Error:/.test(l)) ?? out.trim().split('\n').pop() ?? '';
    return line.replace(/\x1b\[[0-9;]*m/g, '').trim();
}

/**
 * Point the focus at `modules`.
 *
 * A focus already on the same modules is KEPT when its two configs still agree: a
 * widened focus names importing suites on top of the mirror ones, and regenerating it
 * here would silently drop them and report their mutants uncovered again.
 *
 * @returns `{ ok }`, or `{ ok: false, code, reason }` to stop with
 */
async function aim(opts, deps, say) {
    if (opts.widen) {
        const r = await runBounded(...deps.widen, SETUP_TIMEOUT_MS);
        if (r.status === 3) return { ok: false, code: EXIT.done, reason: 'nothing to widen — the first measurement stands' };
        if (!r.ok) return { ok: false, code: EXIT.failed, reason: r.out.trim() };
        say(r.out.trim());
        return { ok: true };
    }
    if (sameList(currentFocus(), opts.modules)) {
        const check = await runBounded(...deps.check, SETUP_TIMEOUT_MS);
        if (check.ok) {
            say(`focus kept: ${check.out.trim()}`);
            return { ok: true };
        }
    }
    const [cmd, args] = deps.focus;
    const r = await runBounded(cmd, [...args, ...opts.modules], SETUP_TIMEOUT_MS);
    if (r.ok) return { ok: true };
    const noSuites = /No test suite mirrors|Refusing to write a config/.test(r.out);
    return { ok: false, code: noSuites ? EXIT.refused : EXIT.failed, reason: r.out.trim() };
}

/** Read the finished report into the numbers the final line and the heartbeat carry. */
function readResults(modules, equivalents) {
    const rows = summarise(FOCUS_REPORT, equivalents());
    const results = modules
        .filter((m) => rows[m])
        .map((m) => ({ module: m, score: rows[m].score, openGaps: rows[m].openGaps, mutants: mutantsIn(rows[m]) }));
    const all = results.map((r) => rows[r.module]);
    const total = all.reduce((n, r) => n + mutantsIn(r), 0);
    const detected = all.reduce((n, r) => n + r.killed + r.timeout, 0);
    return {
        results,
        score: total ? Number(((detected / total) * 100).toFixed(2)) : 0,
        openGaps: results.reduce((n, r) => n + r.openGaps, 0),
    };
}

/**
 * Turn a finished Stryker run into an outcome: which state, which exit code, what to say.
 */
function judge(run, modules, timeoutMin, equivalents) {
    if (run.timedOut) {
        return {
            state: 'timeout',
            code: EXIT.timeout,
            reason: `no result inside the ${timeoutMin}-minute limit; the run and its workers were killed. Split the group, or raise --timeout-min for one large module`,
        };
    }
    if (/Instrumented \d+ source file\(s\) with 0 mutant\(s\)/.test(run.out)) {
        return { state: 'failed', code: EXIT.refused, reason: 'nothing to mutate — declarations only' };
    }
    if (/No tests were executed/.test(run.out)) {
        return { state: 'failed', code: EXIT.refused, reason: 'the named suites never exercise the module — Stryker ran no tests' };
    }
    if (!run.ok || !existsSync(FOCUS_REPORT)) {
        return { state: 'failed', code: EXIT.failed, reason: `Stryker exit ${run.status}: ${firstError(run.out)}. Output: ${OUTPUT}` };
    }
    const numbers = readResults(modules, equivalents);
    if (!numbers.results.length) {
        return { state: 'failed', code: EXIT.failed, reason: `the report holds none of the modules asked for. Output: ${OUTPUT}` };
    }
    return { state: 'done', code: EXIT.done, ...numbers };
}

function finalLine(outcome, modules, minutes) {
    if (outcome.state === 'done') {
        const rows = outcome.results
            .map((r) => `${r.module} score ${r.score}% openGaps ${r.openGaps} (${r.mutants} mutants)`)
            .join('; ');
        return `MEASURED in ${minutes} min — ${rows}. To pin: node scripts/checkMutationBaseline.mjs --report ${FOCUS_REPORT} --write "<what changed>"`;
    }
    const word = outcome.state === 'timeout' ? 'TIMEOUT' : outcome.code === EXIT.refused ? 'REFUSED' : 'FAILED';
    return `${word} after ${minutes} min — ${modules.join(', ')}: ${outcome.reason}`;
}

/**
 * Measure `opts.modules`. Resolves to the exit code; prints as it goes, and one
 * pasteable line last.
 *
 * @param opts  `{ modules, budget, timeoutMin, force, widen }`
 * @param deps  the commands it runs, handed in so the controls can stand a fake in for
 *              Stryker (`tests/scripts/mutationMeasure.test.ts`)
 */
export async function measure(opts, deps = {}) {
    const d = { ...DEFAULT_DEPS, ...deps };
    const budget = opts.budget ?? DEFAULT_BUDGET;
    const timeoutMin = opts.timeoutMin ?? DEFAULT_TIMEOUT_MIN;
    const modules = opts.widen ? currentFocus() : opts.modules;
    const say = (line) => console.log(line);
    const refuse = (reason, code = EXIT.refused) => {
        say(`${code === EXIT.refused ? 'REFUSED' : 'FAILED'} — ${reason}`);
        return code;
    };

    if (!modules.length) return refuse('no module named. Usage: npm run test:mutation:measure -- <src/module.ts> [more]', EXIT.failed);
    const missing = modules.filter((m) => !existsSync(m));
    if (missing.length) return refuse(`no such module: ${missing.join(', ')}`, EXIT.failed);

    const other = liveMeasurement();
    if (other) {
        return refuse(`another measurement is running (pid ${other.pid}, ${other.modules.join(', ')}). One at a time — the focus configs are single files. See: npm run mutation:status`);
    }

    const verdict = budgetVerdict(estimateMutants(modules), budget, opts.force);
    say(`mutants expected:\n${verdict.breakdown}`);
    if (!verdict.ok) return refuse(verdict.reason);
    if (verdict.note) say(verdict.note);

    // From here on something may be left behind, so every way out goes through `finish`.
    let interrupted = null;
    const onSignal = (signal) => {
        interrupted = signal;
        killActiveRuns('SIGKILL');
    };
    for (const s of Object.keys(SIGNAL_EXIT)) process.on(s, onSignal);
    process.on('exit', cleanUp);

    const startedMs = Date.now();
    const status = {
        pid: process.pid,
        modules,
        startedAt: new Date(startedMs).toISOString(),
        updatedAt: new Date(startedMs).toISOString(),
        state: 'measuring',
        phase: 'starting',
        timeoutMin,
        mutantsExpected: verdict.total,
    };
    const beat = (changes = {}) => {
        Object.assign(status, changes, { updatedAt: new Date().toISOString(), minutes: minutesSince(startedMs) });
        writeStatus(status);
    };
    const finish = (outcome) => {
        clearInterval(ticking);
        for (const s of Object.keys(SIGNAL_EXIT)) process.off(s, onSignal);
        cleanUp();
        const { state, code, reason, results, score, openGaps } = outcome;
        beat({ state, phase: undefined, reason, results, score, openGaps });
        say(finalLine(outcome, modules, status.minutes));
        return code;
    };
    const stopped = () => ({ state: 'failed', code: SIGNAL_EXIT[interrupted], reason: `stopped by ${interrupted}` });

    beat();
    const ticking = setInterval(() => beat(), HEARTBEAT_EVERY_MS);

    const aimed = await aim({ ...opts, modules }, d, say);
    if (interrupted) return finish(stopped());
    if (!aimed.ok) {
        const state = aimed.code === EXIT.done ? 'done' : 'failed';
        clearInterval(ticking);
        cleanUp();
        beat({ state, phase: undefined, reason: aimed.reason });
        return aimed.code === EXIT.done ? (say(`NOTHING TO DO — ${aimed.reason}`), EXIT.done) : refuse(aimed.reason, aimed.code);
    }

    // A cold run every time: a cache built before an edit reports the old score.
    cleanUp();
    rmSync(FOCUS_REPORT, { force: true });
    say(`measuring ${modules.length} module(s), limit ${timeoutMin} min, pid ${process.pid} …`);
    beat({ phase: 'dry-run' });
    let dryRunSeen = false;
    const run = await runBounded(...d.stryker, timeoutMin * 60_000, {
        onOutput: (text) => {
            if (dryRunSeen || !/Initial test run succeeded/.test(text)) return;
            dryRunSeen = true;
            beat({ phase: 'mutating', dryRunMinutes: minutesSince(startedMs) });
            say(`dry run finished after ${status.minutes} min — mutating`);
        },
    });
    mkdirSync(dirname(OUTPUT), { recursive: true });
    writeFileSync(OUTPUT, run.out);

    if (interrupted) return finish(stopped());
    return finish(judge(run, modules, timeoutMin, d.equivalents));
}

function parseArgs(argv) {
    const valued = ['--timeout-min', '--budget'];
    const value = (name) => {
        const i = argv.indexOf(name);
        return i === -1 ? undefined : Number(argv[i + 1]);
    };
    const modules = argv.filter((a, i) => !a.startsWith('--') && !valued.includes(argv[i - 1]));
    return {
        modules,
        timeoutMin: value('--timeout-min'),
        budget: value('--budget'),
        force: argv.includes('--force'),
        widen: argv.includes('--widen'),
    };
}

// Only when RUN, never when imported — the controls import `measure`.
const RUN_DIRECTLY =
    !!process.argv[1] &&
    existsSync(process.argv[1]) &&
    realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (RUN_DIRECTLY) process.exit(await measure(parseArgs(process.argv.slice(2))));
