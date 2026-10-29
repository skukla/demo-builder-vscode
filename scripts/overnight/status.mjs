#!/usr/bin/env node
/**
 * How far along the mutation burn-down is, and whether it is still moving.
 *
 *   npm run mutation:status            # one screen
 *   npm run mutation:status -- --json  # the same facts, for a script
 *   node scripts/overnight/status.mjs --gaps    # "gaps=754 modules=121" — what the
 *                                               # runners record when they start
 *
 *   node scripts/overnight/status.mjs --stop-measurement   # SIGTERM the measurement in
 *                                               # flight, by its recorded pid
 *
 * Exit 0 healthy, 3 STALLED, 4 nothing running.
 *
 * WHY. On 2026-10-10 nobody could say how far a run had got. The line being used to
 * watch it searched `ps` for a word that was also in its own command, so it matched
 * itself and reported "measuring" for a run that was dead. This reads only what the
 * runners WROTE, and decides "alive" one way: the pid a runner recorded, asked of the
 * kernel with `process.kill(pid, 0)`. It never reads the process list.
 *
 * WHAT IT READS. Nothing new is kept for it:
 *   reports/mutation/baseline.json      gaps now
 *   .rptc/handoff/runs.log              the run's starting numbers and each batch
 *                                       boundary — `run.sh` and `runs.sh` write these
 *   reports/mutation/run-status.json    the measurement in flight —
 *                                       `mutationMeasure.mjs` rewrites it every 30 s
 *   git                                 commits since the run started
 *
 * STALLED means one of four things, and the line says which: a measurement older than
 * its own time limit, a measurement whose pid is gone, a batch past its cap, or a batch
 * the log lists as open whose pid is gone.
 */
import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';

const BASELINE = 'reports/mutation/baseline.json';
const LOG = '.rptc/handoff/runs.log';
const HEARTBEAT = 'reports/mutation/run-status.json';
/** Slack before a limit that has passed is called a stall. The runners kill at the limit. */
const MEASURE_MARGIN_MIN = 2;
const BATCH_MARGIN_MIN = 5;
const GIT_TIMEOUT_MS = 10_000;

const JSON_OUT = process.argv.includes('--json');
const GAPS_ONLY = process.argv.includes('--gaps');

function pidAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (err) {
        return err.code === 'EPERM';
    }
}

const minutesSince = (ms) => Math.max(0, Math.round((Date.now() - ms) / 60_000));

function countGaps() {
    const rows = Object.values(JSON.parse(readFileSync(BASELINE, 'utf8')).modules);
    const open = rows.filter((r) => r.openGaps > 0);
    return { now: open.reduce((n, r) => n + r.openGaps, 0), modules: open.length };
}

/** `key=value` pairs on a log line, numbers as numbers. */
function fields(text) {
    return Object.fromEntries(
        [...text.matchAll(/(\w+)=(\S+)/g)].map(([, k, v]) => [k, /^\d+$/.test(v) ? Number(v) : v])
    );
}

/**
 * The boundary lines the runners write: `<date> <time>  <kind> — <rest>`. Every other
 * line in the log (the runners' own narration) is ignored.
 */
function readBoundaries() {
    if (!existsSync(LOG)) return [];
    const out = [];
    for (const line of readFileSync(LOG, 'utf8').split('\n')) {
        const m = /^(\d{4}-\d\d-\d\d) (\d\d:\d\d)  (loop start|loop end|queue start|queue end|batch start|batch end) — (.*)$/.exec(line);
        if (!m) continue;
        const [, date, time, kind, rest] = m;
        out.push({ kind, at: new Date(`${date}T${time}:00`).getTime(), name: rest.split(' ')[0], ...fields(rest) });
    }
    return out;
}

/**
 * Where "this run" began: the `loop start` the latest queue belongs to (runs.sh,
 * several queues back to back), otherwise that queue's own start (run.sh by itself).
 */
function runStart(events) {
    const kinds = events.map((e) => e.kind);
    const queue = kinds.lastIndexOf('queue start');
    if (queue === -1) {
        const loop = kinds.lastIndexOf('loop start');
        return loop === -1 ? null : events[loop];
    }
    // run.sh marks a queue `loop=1` when runs.sh started it. A queue without the mark
    // was started by hand, and an older loop that never logged its end is not its start.
    if (events[queue].loop !== 1) return events[queue];
    const loop = kinds.lastIndexOf('loop start', queue);
    return loop === -1 ? events[queue] : events[loop];
}

/** The batch the log lists as started and not ended, if the queue it belongs to is open. */
function openBatch(events) {
    for (let i = events.length - 1; i >= 0; i--) {
        const e = events[i];
        if (e.kind === 'queue end' || e.kind === 'loop end' || e.kind === 'batch end') return null;
        if (e.kind === 'batch start') {
            return { name: e.name, pid: e.pid, alive: pidAlive(e.pid), minutes: minutesSince(e.at), capMin: e.cap, log: e.log };
        }
    }
    return null;
}

function readHeartbeat() {
    if (!existsSync(HEARTBEAT)) return null;
    try {
        return JSON.parse(readFileSync(HEARTBEAT, 'utf8'));
    } catch {
        return null;
    }
}

function git(args) {
    try {
        return execFileSync('git', args, { encoding: 'utf8', timeout: GIT_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
        return null;
    }
}

function stallReasons(batch, measuring) {
    const reasons = [];
    if (measuring) {
        const what = measuring.modules.join(', ');
        if (!measuring.alive) {
            reasons.push(`the measurement of ${what} is recorded as running, but its process (pid ${measuring.pid}) is not running`);
        } else if (measuring.minutes > measuring.timeoutMin + MEASURE_MARGIN_MIN) {
            reasons.push(`the measurement of ${what} has run ${measuring.minutes} min, past its ${measuring.timeoutMin}-minute limit`);
        }
    }
    if (batch) {
        if (!batch.alive) {
            reasons.push(`batch ${batch.name} is listed as open, but its process (pid ${batch.pid}) is not running`);
        } else if (batch.minutes > batch.capMin + BATCH_MARGIN_MIN) {
            reasons.push(`batch ${batch.name} has run ${batch.minutes} min, past its ${batch.capMin}-minute cap`);
        }
    }
    return reasons;
}

function collect() {
    const events = readBoundaries();
    const start = runStart(events);
    const batch = openBatch(events);
    const hb = readHeartbeat();
    const gapsNow = countGaps();

    const measuring =
        hb && hb.state === 'measuring'
            ? {
                  modules: hb.modules,
                  pid: hb.pid,
                  alive: pidAlive(hb.pid),
                  minutes: minutesSince(new Date(hb.startedAt).getTime()),
                  phase: hb.phase ?? null,
                  timeoutMin: hb.timeoutMin,
              }
            : null;
    const stalled = stallReasons(batch, measuring);
    const running = !!batch || (!!measuring && measuring.alive);

    const closed = start && typeof start.gaps === 'number' ? start.gaps - gapsNow.now : null;
    const hours = start ? (Date.now() - start.at) / 3_600_000 : null;
    const ratePerHour = closed !== null && hours > 0 ? Number((closed / hours).toFixed(1)) : null;
    const lastCommit = git(['log', '-1', '--format=%ct']);
    const commits = start?.sha ? git(['rev-list', '--count', `${start.sha}..HEAD`]) : null;

    return {
        state: stalled.length ? 'stalled' : running ? 'healthy' : 'idle',
        stalled,
        gaps: {
            now: gapsNow.now,
            modules: gapsNow.modules,
            atStart: start?.gaps ?? null,
            modulesAtStart: start?.modules ?? null,
            closed,
        },
        run: start ? { startedMinutesAgo: minutesSince(start.at), sha: start.sha ?? null, commits: commits === null ? null : Number(commits) } : null,
        batch,
        measuring,
        lastMeasurement: hb && hb.state !== 'measuring' ? { modules: hb.modules, state: hb.state, minutes: hb.minutes ?? null, score: hb.score ?? null, openGaps: hb.openGaps ?? null, reason: hb.reason ?? null } : null,
        lastHeartbeatMinutes: hb?.updatedAt ? minutesSince(new Date(hb.updatedAt).getTime()) : null,
        lastCommitMinutes: lastCommit ? minutesSince(Number(lastCommit) * 1000) : null,
        ratePerHour,
        etaHours: ratePerHour > 0 ? Number((gapsNow.now / ratePerHour).toFixed(1)) : null,
    };
}

const orUnknown = (v, unit = '') => (v === null || v === undefined ? 'unknown' : `${v}${unit}`);

function render(s) {
    const lines = [];
    for (const reason of s.stalled) lines.push(`STALLED  ${reason}`);
    lines.push(`Now:        ${s.gaps.now} open gaps in ${s.gaps.modules} modules`);
    if (s.run) {
        lines.push(
            `Run start:  ${orUnknown(s.gaps.atStart)} gaps in ${orUnknown(s.gaps.modulesAtStart)} modules, ${s.run.startedMinutesAgo} min ago` +
                ` — ${orUnknown(s.gaps.closed)} closed, ${orUnknown(s.run.commits)} commit(s) since`
        );
    } else {
        lines.push('Run start:  no run recorded in .rptc/handoff/runs.log');
    }
    lines.push(
        s.batch
            ? `Batch:      ${s.batch.name}, ${s.batch.minutes} of ${s.batch.capMin} min, pid ${s.batch.pid} ${s.batch.alive ? 'running' : 'NOT running'}`
            : 'Batch:      none in flight'
    );
    if (s.measuring) {
        lines.push(
            `Measuring:  ${s.measuring.modules.join(', ')} — ${s.measuring.minutes} of ${s.measuring.timeoutMin} min` +
                `${s.measuring.phase ? `, ${s.measuring.phase}` : ''}, pid ${s.measuring.pid} ${s.measuring.alive ? 'running' : 'NOT running'}`
        );
    } else if (s.lastMeasurement) {
        const m = s.lastMeasurement;
        const result = m.state === 'done' && m.score !== null ? `score ${m.score}%, ${m.openGaps} open gaps` : (m.reason ?? '');
        lines.push(`Measuring:  nothing now. Last: ${m.modules.join(', ')} — ${m.state}, ${orUnknown(m.minutes, ' min')}${result ? `, ${result}` : ''}`);
    } else {
        lines.push('Measuring:  nothing, and no measurement recorded');
    }
    lines.push(`Last:       commit ${orUnknown(s.lastCommitMinutes, ' min ago')}, heartbeat ${orUnknown(s.lastHeartbeatMinutes, ' min ago')}`);
    lines.push(
        s.ratePerHour > 0
            ? `Pace:       ${s.ratePerHour} gaps closed per hour — about ${s.etaHours} hours left at this pace (rough)`
            : 'Pace:       no gaps closed yet this run, so no estimate'
    );
    if (s.state === 'idle') lines.push('Nothing is running.');
    return lines.join('\n');
}

// `--stop-measurement`: ask the measurement in flight to stop, by the pid it recorded.
// run.sh's watchdog calls this after killing a batch. The measurement handles SIGTERM
// itself — it kills its Stryker tree, cleans up and records that it was stopped.
if (process.argv.includes('--stop-measurement')) {
    const hb = readHeartbeat();
    if (hb?.state === 'measuring' && pidAlive(hb.pid)) {
        process.kill(hb.pid, 'SIGTERM');
        console.log(`asked the measurement of ${hb.modules.join(', ')} (pid ${hb.pid}) to stop`);
    } else {
        console.log('no measurement is running');
    }
    process.exit(0);
}
if (GAPS_ONLY) {
    const g = countGaps();
    console.log(`gaps=${g.now} modules=${g.modules}`);
    process.exit(0);
}
const status = collect();
console.log(JSON_OUT ? JSON.stringify(status, null, 2) : render(status));
process.exit(status.state === 'stalled' ? 3 : status.state === 'idle' ? 4 : 0);
