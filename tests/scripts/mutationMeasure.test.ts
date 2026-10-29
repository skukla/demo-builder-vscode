/**
 * `scripts/mutationMeasure.mjs` — the bounded measurement — driven with a FAKE
 * Stryker, never the real one.
 *
 * What it has to hold is everything the 2026-10-10 morning session lacked: a group
 * too big to finish is refused before anything starts; a run that does not finish is
 * killed by the clock, WITH its children; the temp directory and the incremental
 * cache are gone on every exit path, a signal included; and a status file says which
 * of those happened.
 *
 * The scripts are plain ESM `.mjs`, which this repo's jest transform does not parse
 * (the precedent is `mutationStaleRows.test.ts`), so each case writes a small driver
 * into a temp directory that imports the real `measure` and hands it stand-in
 * commands. Nothing here waits on a timer: a case either awaits the process closing
 * or one line of its output.
 */

import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const SCRIPT = path.resolve(__dirname, '../../scripts/mutationMeasure.mjs');
const STATUS = 'reports/mutation/run-status.json';
const TEMP = '.stryker-tmp-focus';
const INCREMENTAL = 'reports/mutation/focus-incremental.json';
const MODULE_A = 'src/a/small.ts';
const MODULE_B = 'src/a/large.ts';
const MODULE_NEW = 'src/a/unmeasured.ts';

interface Heartbeat {
    pid: number;
    modules: string[];
    startedAt: string;
    state: 'measuring' | 'done' | 'timeout' | 'failed';
    phase?: string;
    minutes?: number;
    timeoutMin: number;
    score?: number;
    openGaps?: number;
    reason?: string;
}
interface DriverResult {
    code: number | null;
    out: string;
}

const row = (killed: number, survived: number) => ({
    score: 50,
    killed,
    survived,
    noCoverage: 0,
    timeout: 0,
    openGaps: survived,
});

/** A Stryker-shaped report: two killed, one survivor on a branch. */
const REPORT = {
    files: {
        [MODULE_A]: {
            source: 'export const f = (a) => {\n    if (a) return 1;\n    return 2;\n};\n',
            mutants: ['Killed', 'Killed', 'Survived'].map((status, id) => ({
                id: String(id),
                status,
                mutatorName: 'ConditionalExpression',
                location: { start: { line: 2, column: 4 }, end: { line: 2, column: 9 } },
            })),
        },
    },
};

const FAKE_STRYKER = `
import { spawn } from 'child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'fs';
const mode = process.argv[2];
mkdirSync('${TEMP}/sandbox', { recursive: true });
writeFileSync('${TEMP}/sandbox/leftover.txt', 'x');
mkdirSync('reports/mutation', { recursive: true });
writeFileSync('${INCREMENTAL}', '{}');
appendFileSync('stryker-started.txt', 'started\\n');
if (mode === 'hang') {
    const grandchild = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'inherit' });
    writeFileSync('pids.json', JSON.stringify({ child: process.pid, grandchild: grandchild.pid }));
    console.log('Initial test run succeeded. Ran 3 tests in 1 second.');
    setInterval(() => {}, 1000);
} else {
    console.log('Initial test run succeeded. Ran 3 tests in 1 second.');
    writeFileSync('reports/mutation/focus.json', ${JSON.stringify(JSON.stringify(REPORT))});
    console.log('Done in 1 second.');
}
`;

const DRIVER = `
import { readFileSync } from 'fs';
import { measure } from ${JSON.stringify(SCRIPT)};
const cfg = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const node = (...args) => [process.execPath, args];
const code = await measure(cfg.opts, {
    focus: cfg.focusFails
        ? node('-e', "console.error('No test suite mirrors src/a/small.ts, and none imports it either.'); process.exit(1)")
        : node('-e', ''),
    stryker: node('fakeStryker.mjs', cfg.mode),
});
process.exit(code);
`;

/**
 * Whether the process with this pid is still running. Asked of `ps` BY PID — a pid this
 * suite was handed, never a search for a word — because a killed process whose parent
 * has not collected it yet still answers `kill(pid, 0)`; `ps` reports that state as Z.
 */
function alive(pid: number): boolean {
    const r = spawnSync('ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' });
    const stat = r.stdout.trim();
    return stat !== '' && !stat.startsWith('Z');
}

class Fixture {
    readonly dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mutation-measure-'));

    constructor() {
        this.write('fakeStryker.mjs', FAKE_STRYKER);
        this.write('driver.mjs', DRIVER);
        this.write(MODULE_A, 'export const a = 1;\n');
        // The REAL ledger reader runs, not a stand-in: the one survivor in the fake
        // report is recorded here as equivalent, so a finished run must read 0 open gaps.
        // A stand-in returning the wrong shape reported 4 open gaps for a finished module
        // on the first live run (2026-10-10).
        this.write(
            'scripts/mutation-equivalents.ledger.json',
            JSON.stringify({ entries: [{ module: MODULE_A, anchors: ['export const a = 1;'], mutants: 1 }] })
        );
        this.write(MODULE_B, 'export const b = 1;\n');
        // 100 non-blank lines and no baseline row: estimated from its size.
        this.write(MODULE_NEW, Array.from({ length: 100 }, (_, i) => `export const v${i} = ${i};`).join('\n'));
        this.write(
            'reports/mutation/baseline.json',
            JSON.stringify({ modules: { [MODULE_A]: row(40, 10), [MODULE_B]: row(300, 100) } })
        );
    }

    write(rel: string, content: string): void {
        const abs = path.join(this.dir, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content);
    }
    exists(rel: string): boolean {
        return fs.existsSync(path.join(this.dir, rel));
    }
    heartbeat(): Heartbeat {
        return JSON.parse(fs.readFileSync(path.join(this.dir, STATUS), 'utf8')) as Heartbeat;
    }
    pids(): { child: number; grandchild: number } {
        return JSON.parse(fs.readFileSync(path.join(this.dir, 'pids.json'), 'utf8'));
    }

    start(cfg: Record<string, unknown>) {
        this.write('cfg.json', JSON.stringify(cfg));
        return spawn(process.execPath, ['driver.mjs', 'cfg.json'], { cwd: this.dir });
    }

    /** Run the driver to the end. `onLine` fires once, on the first matching output. */
    run(cfg: Record<string, unknown>, onLine?: { match: string; then: (pid: number) => void }): Promise<DriverResult> {
        const child = this.start(cfg);
        let out = '';
        let fired = false;
        return new Promise((resolve) => {
            const take = (chunk: Buffer) => {
                out += chunk.toString();
                if (onLine && !fired && out.includes(onLine.match)) {
                    fired = true;
                    onLine.then(child.pid as number);
                }
            };
            child.stdout.on('data', take);
            child.stderr.on('data', take);
            child.on('close', (code) => resolve({ code, out }));
        });
    }

    dispose(): void {
        fs.rmSync(this.dir, { recursive: true, force: true });
    }
}

describe('the bounded mutation measurement', () => {
    let fx: Fixture;
    beforeEach(() => {
        fx = new Fixture();
    });
    afterEach(() => fx.dispose());

    it('refuses a group over the mutant budget, says to split it, and starts nothing', async () => {
        const r = await fx.run({ opts: { modules: [MODULE_A, MODULE_B], budget: 400 }, mode: 'done' });

        expect(r.code).toBe(2);
        expect(r.out).toContain('450 mutants');
        expect(r.out).toContain('over the budget of 400');
        expect(r.out).toMatch(/split/i);
        expect(fx.exists('stryker-started.txt')).toBe(false);
        expect(fx.exists(STATUS)).toBe(false);
    });

    it('measures the same group when forced', async () => {
        const r = await fx.run({ opts: { modules: [MODULE_A, MODULE_B], budget: 400, force: true }, mode: 'done' });

        expect(r.code).toBe(0);
        expect(fx.exists('stryker-started.txt')).toBe(true);
    });

    it('does not refuse ONE module for its size, because one module cannot be split', async () => {
        const r = await fx.run({ opts: { modules: [MODULE_A], budget: 10 }, mode: 'done' });

        expect(r.code).toBe(0);
        expect(r.out).toContain('cannot be split');
    });

    it('estimates a module with no baseline row from its size, and says so', async () => {
        const r = await fx.run({ opts: { modules: [MODULE_A, MODULE_NEW], budget: 60 }, mode: 'done' });

        // 50 from the row; 100 lines at the baseline's own rate of 450 mutants over 2 lines
        // would be absurd, so the fixture rate is checked only for being applied at all.
        expect(r.code).toBe(2);
        expect(r.out).toContain(`${MODULE_A}: 50 (baseline row)`);
        expect(r.out).toMatch(new RegExp(`${MODULE_NEW}: \\d+ \\(estimated from 100 lines`));
    });

    it('reports a finished run: exit 0, one pasteable line, heartbeat done, nothing left behind', async () => {
        const r = await fx.run({ opts: { modules: [MODULE_A], timeoutMin: 1 }, mode: 'done' });

        expect(r.code).toBe(0);
        const last = r.out.trim().split('\n').pop() as string;
        expect(last).toContain('MEASURED');
        expect(last).toContain(`${MODULE_A} score 66.67% openGaps 0`);
        const hb = fx.heartbeat();
        expect(hb.state).toBe('done');
        expect(hb.modules).toStrictEqual([MODULE_A]);
        expect(hb.score).toBe(66.67);
        expect(hb.openGaps).toBe(0);
        expect(typeof hb.minutes).toBe('number');
        expect(fx.exists(TEMP)).toBe(false);
        expect(fx.exists(INCREMENTAL)).toBe(false);
    });

    it('kills a run that outlives its limit, children included, and exits 124 cleaned up', async () => {
        const r = await fx.run({ opts: { modules: [MODULE_A], timeoutMin: 0.01 }, mode: 'hang' });

        expect(r.code).toBe(124);
        expect(r.out.trim().split('\n').pop()).toContain('TIMEOUT');
        const { child, grandchild } = fx.pids();
        expect({ child: alive(child), grandchild: alive(grandchild) }).toStrictEqual({ child: false, grandchild: false });
        expect(fx.heartbeat().state).toBe('timeout');
        expect(fx.exists(TEMP)).toBe(false);
        expect(fx.exists(INCREMENTAL)).toBe(false);
    });

    it('says measuring while it runs, and cleans up when it is sent SIGTERM', async () => {
        let during: Heartbeat | undefined;
        const r = await fx.run(
            { opts: { modules: [MODULE_A], timeoutMin: 5 }, mode: 'hang' },
            {
                match: 'dry run finished',
                then: (pid) => {
                    during = fx.heartbeat();
                    process.kill(pid, 'SIGTERM');
                },
            }
        );

        expect(during?.state).toBe('measuring');
        expect(during?.phase).toBe('mutating');
        expect(during?.timeoutMin).toBe(5);
        expect(r.code).toBe(143);
        const { child, grandchild } = fx.pids();
        expect({ child: alive(child), grandchild: alive(grandchild) }).toStrictEqual({ child: false, grandchild: false });
        expect(fx.heartbeat().state).toBe('failed');
        expect(fx.heartbeat().reason).toContain('SIGTERM');
        expect(fx.exists(TEMP)).toBe(false);
        expect(fx.exists(INCREMENTAL)).toBe(false);
    });

    it('exits 2 when a module has no suites, without starting a run', async () => {
        const r = await fx.run({ opts: { modules: [MODULE_A] }, mode: 'done', focusFails: true });

        expect(r.code).toBe(2);
        expect(r.out).toContain('No test suite mirrors');
        expect(fx.exists('stryker-started.txt')).toBe(false);
    });

    it('refuses to start while another measurement is alive', async () => {
        fx.write(
            STATUS,
            JSON.stringify({ pid: process.pid, modules: [MODULE_B], state: 'measuring', startedAt: new Date().toISOString(), timeoutMin: 12 })
        );
        const r = await fx.run({ opts: { modules: [MODULE_A] }, mode: 'done' });

        expect(r.code).toBe(2);
        expect(r.out).toContain(`pid ${process.pid}`);
        expect(fx.exists('stryker-started.txt')).toBe(false);
    });

    it('CONTROL: the liveness check tells a finished process from a running one', () => {
        const finished = spawnSync(process.execPath, ['-e', '']);

        expect(alive(process.pid)).toBe(true);
        expect(alive(finished.pid)).toBe(false);
    });
});
