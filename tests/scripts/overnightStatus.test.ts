/**
 * `scripts/overnight/status.mjs` — one screen saying how far the burn-down is and
 * whether it is still moving — run against fixture files in a temp directory.
 *
 * The rule under test is how it decides something is ALIVE: by the pid a runner
 * recorded (`process.kill(pid, 0)`) and by the age of what that runner wrote, never
 * by searching the process list for a word. On 2026-10-10 a hand-rolled status line
 * matched its own command text in `ps` and reported "measuring" for a run that had
 * been dead for most of an hour.
 *
 * `GIT_*` is stripped from the child's environment: the pre-push gate runs jest with
 * `GIT_DIR` set, and the status command asks git for the commit count.
 */

import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const SCRIPT = path.resolve(__dirname, '../../scripts/overnight/status.mjs');
const HEARTBEAT = 'reports/mutation/run-status.json';
const LOG = '.rptc/handoff/runs.log';

interface Status {
    state: 'healthy' | 'stalled' | 'idle';
    stalled: string[];
    gaps: { now: number; modules: number; atStart: number | null; modulesAtStart: number | null; closed: number | null };
    batch: { name: string; pid: number; alive: boolean; minutes: number; capMin: number } | null;
    measuring: { modules: string[]; pid: number; alive: boolean; minutes: number } | null;
    ratePerHour: number | null;
    etaHours: number | null;
}

/** A log timestamp `minutes` ago, in the format run.sh and runs.sh write. */
function stamp(minutesAgo: number): string {
    const d = new Date(Date.now() - minutesAgo * 60_000);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
const isoAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

/** A pid that is certainly not running: a child that has already been reaped. */
const deadPid = () => spawnSync(process.execPath, ['-e', '']).pid;

class Fixture {
    readonly dir = fs.mkdtempSync(path.join(os.tmpdir(), 'overnight-status-'));

    constructor() {
        // 30 open gaps in 2 modules; a third module is finished.
        this.write(
            'reports/mutation/baseline.json',
            JSON.stringify({ modules: { 'src/a.ts': { openGaps: 10 }, 'src/b.ts': { openGaps: 20 }, 'src/c.ts': { openGaps: 0 } } })
        );
    }

    write(rel: string, content: string): void {
        const abs = path.join(this.dir, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content);
    }
    log(lines: string[]): void {
        this.write(LOG, lines.join('\n') + '\n');
    }
    heartbeat(hb: Record<string, unknown>): void {
        this.write(HEARTBEAT, JSON.stringify(hb));
    }

    status(args: string[] = ['--json']): { code: number | null; out: string; json: Status } {
        const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
        const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: this.dir, env, encoding: 'utf8' });
        const out = `${r.stdout}${r.stderr}`;
        return { code: r.status, out, json: args.includes('--json') ? (JSON.parse(r.stdout) as Status) : ({} as Status) };
    }

    dispose(): void {
        fs.rmSync(this.dir, { recursive: true, force: true });
    }
}

/** A queue that started two hours ago at 50 gaps, with one batch still open. */
const runningLog = (batchPid: number, batchMinutesAgo = 20) => [
    `${stamp(120)}  queue start — gaps=50 modules=4 sha=abc1234 batches=2 cap=150`,
    `${stamp(120)}  batch start — MUT-01 pid=1 cap=150 log=x/MUT-01.jsonl`,
    `${stamp(30)}  batch end — MUT-01 exit=0`,
    `${stamp(batchMinutesAgo)}  batch start — MUT-02 pid=${batchPid} cap=150 log=x/MUT-02.jsonl`,
];

describe('the burn-down status command', () => {
    let fx: Fixture;
    beforeEach(() => {
        fx = new Fixture();
    });
    afterEach(() => fx.dispose());

    it('is healthy while a batch and its measurement are alive and inside their limits', () => {
        fx.log(runningLog(process.pid));
        fx.heartbeat({ pid: process.pid, modules: ['src/a.ts'], state: 'measuring', startedAt: isoAgo(3), updatedAt: isoAgo(0), timeoutMin: 12 });

        const { code, json } = fx.status();

        expect(code).toBe(0);
        expect(json.state).toBe('healthy');
        expect(json.stalled).toStrictEqual([]);
        expect(json.gaps).toStrictEqual({ now: 30, modules: 2, atStart: 50, modulesAtStart: 4, closed: 20 });
        expect(json.batch).toMatchObject({ name: 'MUT-02', pid: process.pid, alive: true, capMin: 150 });
        expect(json.measuring).toMatchObject({ modules: ['src/a.ts'], alive: true });
        // 20 gaps closed in about two hours; 30 left at that pace is about three more.
        expect(json.ratePerHour).toBeGreaterThan(9);
        expect(json.ratePerHour).toBeLessThan(11);
        expect(json.etaHours).toBeGreaterThan(2.7);
        expect(json.etaHours).toBeLessThan(3.3);
    });

    it('is STALLED when the measurement is older than its own time limit', () => {
        fx.log(runningLog(process.pid));
        fx.heartbeat({ pid: process.pid, modules: ['src/a.ts'], state: 'measuring', startedAt: isoAgo(40), updatedAt: isoAgo(40), timeoutMin: 12 });

        const { code, json } = fx.status();

        expect(code).toBe(3);
        expect(json.state).toBe('stalled');
        expect(json.stalled.join(' ')).toMatch(/src\/a\.ts.*12-minute limit/);
    });

    it('is STALLED when the pid a measurement recorded is no longer running', () => {
        fx.log(runningLog(process.pid));
        fx.heartbeat({ pid: deadPid(), modules: ['src/a.ts'], state: 'measuring', startedAt: isoAgo(2), updatedAt: isoAgo(2), timeoutMin: 12 });

        const { code, json } = fx.status();

        expect(code).toBe(3);
        expect(json.stalled.join(' ')).toMatch(/not running/);
    });

    it('is STALLED when a batch has run past its cap', () => {
        fx.log(runningLog(process.pid, 170));

        const { code, json } = fx.status();

        expect(code).toBe(3);
        expect(json.stalled.join(' ')).toMatch(/MUT-02.*150-minute cap/);
    });

    it('is STALLED when the batch it lists as open has no live process', () => {
        fx.log(runningLog(deadPid() as number));

        const { code, json } = fx.status();

        expect(code).toBe(3);
        expect(json.stalled.join(' ')).toMatch(/MUT-02.*not running/);
    });

    it('says nothing is running when the queue ended and no measurement is live', () => {
        fx.log([...runningLog(1), `${stamp(5)}  batch end — MUT-02 exit=0`, `${stamp(5)}  queue end — invoked=2`]);
        fx.heartbeat({ pid: deadPid(), modules: ['src/a.ts'], state: 'done', startedAt: isoAgo(30), updatedAt: isoAgo(26), timeoutMin: 12, minutes: 4 });

        const { code, json } = fx.status();

        expect(code).toBe(4);
        expect(json.state).toBe('idle');
        expect(json.batch).toBeNull();
        expect(json.gaps.atStart).toBe(50);
    });

    it('says nothing is running when there is no log at all, and still counts the gaps', () => {
        const { code, json } = fx.status();

        expect(code).toBe(4);
        expect(json.gaps).toMatchObject({ now: 30, modules: 2, atStart: null });
    });

    it('prints one plain screen, with a STALLED line when stalled', () => {
        fx.log(runningLog(process.pid));
        fx.heartbeat({ pid: deadPid(), modules: ['src/a.ts'], state: 'measuring', startedAt: isoAgo(2), updatedAt: isoAgo(2), timeoutMin: 12 });

        const { code, out } = fx.status([]);

        expect(code).toBe(3);
        expect(out).toContain('30 open gaps in 2 modules');
        expect(out).toContain('50 gaps in 4 modules');
        expect(out).toContain('MUT-02');
        expect(out).toMatch(/^STALLED/m);
    });

    it('prints the gap count the runners record, on one line', () => {
        const { code, out } = fx.status(['--gaps']);

        expect(code).toBe(0);
        expect(out.trim()).toBe('gaps=30 modules=2');
    });
});

describe('stopping a measurement by its recorded pid', () => {
    it('sends SIGTERM to the pid in the status file, and to nothing when none is running', async () => {
        const fx = new Fixture();
        const sleeper = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
        const ended = new Promise<NodeJS.Signals | null>((resolve) => sleeper.on('exit', (_code, signal) => resolve(signal)));
        fx.heartbeat({ pid: sleeper.pid, modules: ['src/a.ts'], state: 'measuring', startedAt: isoAgo(1), updatedAt: isoAgo(0), timeoutMin: 12 });

        const first = fx.status(['--stop-measurement']);

        expect(first.out).toContain(`pid ${sleeper.pid}`);
        expect(await ended).toBe('SIGTERM');
        expect(fx.status(['--stop-measurement']).out).toContain('no measurement is running');
        fx.dispose();
    });
});
