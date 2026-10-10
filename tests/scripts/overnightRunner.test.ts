/**
 * `scripts/overnight/run.sh` and `runs.sh`, run for real against a stand-in `claude`
 * in a throwaway git repository.
 *
 * Three things are held here. The runner writes the boundary lines `npm run
 * mutation:status` reads — the queue's starting numbers, each batch's start with its
 * pid, each end — into the one log. The wall-clock cap on a batch still fires: a
 * batch that does not finish is killed and the queue moves on, which is the only thing
 * that has ever stopped a session waiting on output that was never coming. And the
 * loop runs the five-hour redundancy sweep ONLY when it ended because no module has
 * open gaps — a pause by stop file, or a run that moved nothing, skips it and says
 * how to run it by hand (on 2026-10-10 a pause started a 631-candidate sweep).
 *
 * No session is started: `claude` and `caffeinate` are two-line stubs first on PATH,
 * and so are `pgrep`/`pkill`, because the loop's first act is to look for a run.sh
 * already going — and one may really be going in another worktree while this runs.
 * Every `GIT_*` variable is removed, because the pre-push gate runs jest with `GIT_DIR`
 * set and this suite commits (a suite that inherited it committed into the real
 * repository on 2026-09-15).
 */

import { execFileSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const OVERNIGHT = path.resolve(__dirname, '../../scripts/overnight');

class FixtureRepo {
    readonly dir = fs.mkdtempSync(path.join(os.tmpdir(), 'overnight-runner-'));

    constructor(claudeBody: string) {
        for (const f of ['run.sh', 'runs.sh', 'status.mjs']) {
            this.write(
                `scripts/overnight/${f}`,
                fs.readFileSync(path.join(OVERNIGHT, f), 'utf8'),
                0o755
            );
        }
        this.write('scripts/overnight/queue', 'ONE\nTWO\n');
        this.write('scripts/overnight/goals/ONE.goal', 'first condition\n');
        this.write('scripts/overnight/goals/TWO.goal', 'second condition\n');
        this.write(
            'reports/mutation/baseline.json',
            JSON.stringify({
                modules: { 'src/a.ts': { openGaps: 7 }, 'src/b.ts': { openGaps: 0 } },
            })
        );
        this.write('.gitignore', '*.log\n.rptc/handoff/overnight-*/\nbin/\n');
        // runs.sh logs before anything creates the handoff directory; the repo has it.
        this.write('.rptc/handoff/.keep', '');
        this.write('bin/caffeinate', '#!/usr/bin/env bash\nshift\nexec "$@"\n', 0o755);
        this.write('bin/claude', `#!/usr/bin/env bash\n${claudeBody}\n`, 0o755);
        this.write('bin/pgrep', '#!/usr/bin/env bash\nexit 1\n', 0o755);
        this.write('bin/pkill', '#!/usr/bin/env bash\nexit 1\n', 0o755);
        // The loop's two node scripts. The queue generator answers with the size in
        // FAKE_QUEUED; the sweep only records that it was called, and with what.
        this.write(
            'scripts/mutationQueue.mjs',
            'const n = process.env.FAKE_QUEUED ?? "2";\n' +
                'console.log(`queued: ${n} in 1 batch(es)`);\n'
        );
        this.write(
            'scripts/mutationRedundancySweep.mjs',
            'import { writeFileSync } from "fs";\n' +
                'writeFileSync(".rptc/handoff/sweep-called", process.argv.slice(2).join(" "));\n'
        );
        this.git(['init', '-q', '-b', 'main']);
        this.git(['add', '-A']);
        this.git(['commit', '-q', '-m', 'fixture']);
    }

    env(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
        // RUNS_LOOP too: a batch the loop itself started carries it, and it then
        // marked every queue this suite starts `loop=1` (2026-10-10, at pre-push).
        const inherited = Object.entries(process.env).filter(
            ([k]) => !k.startsWith('GIT_') && k !== 'RUNS_LOOP'
        );
        return {
            ...Object.fromEntries(inherited),
            HOME: this.dir,
            XDG_CONFIG_HOME: this.dir,
            GIT_AUTHOR_NAME: 'test',
            GIT_AUTHOR_EMAIL: 'test@example.com',
            GIT_COMMITTER_NAME: 'test',
            GIT_COMMITTER_EMAIL: 'test@example.com',
            PATH: `${path.join(this.dir, 'bin')}:${process.env.PATH}`,
            ...extra,
        };
    }
    git(args: string[]): string {
        return execFileSync('git', args, { cwd: this.dir, env: this.env(), encoding: 'utf8' });
    }
    write(rel: string, content: string, mode = 0o644): void {
        const abs = path.join(this.dir, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content, { mode });
    }
    run(extra: Record<string, string> = {}) {
        const r = spawnSync('bash', ['scripts/overnight/run.sh'], {
            cwd: this.dir,
            env: this.env(extra),
            encoding: 'utf8',
            timeout: 30_000,
        });
        const logPath = path.join(this.dir, '.rptc/handoff/runs.log');
        return {
            code: r.status,
            out: `${r.stdout}${r.stderr}`,
            log: fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '',
        };
    }
    runLoop(extra: Record<string, string> = {}) {
        const r = spawnSync('bash', ['scripts/overnight/runs.sh'], {
            cwd: this.dir,
            env: this.env({ MAX_RUNS: '3', ...extra }),
            encoding: 'utf8',
            timeout: 30_000,
        });
        const handoff = path.join(this.dir, '.rptc/handoff');
        const sweep = path.join(handoff, 'sweep-called');
        return {
            code: r.status,
            out: `${r.stdout}${r.stderr}`,
            log: fs.readFileSync(path.join(handoff, 'runs.log'), 'utf8'),
            sweepCall: fs.existsSync(sweep) ? fs.readFileSync(sweep, 'utf8') : null,
        };
    }
    dispose(): void {
        fs.rmSync(this.dir, { recursive: true, force: true });
    }
}

describe('the overnight runner', () => {
    let repo: FixtureRepo | undefined;
    afterEach(() => repo?.dispose());

    it('records the starting numbers and every batch boundary in the one log', () => {
        repo = new FixtureRepo('exit 0');

        const { code, out, log } = repo.run();

        expect(code).toBe(0);
        const lines = log
            .trim()
            .split('\n')
            .map((l) => l.replace(/^\d{4}-\d\d-\d\d \d\d:\d\d {2}/, ''));
        expect(lines).toHaveLength(6);
        expect(lines[0]).toMatch(
            /^queue start — gaps=7 modules=1 sha=[0-9a-f]{7,} batches=2 cap=150$/
        );
        expect(lines[1]).toMatch(
            /^batch start — ONE pid=\d+ cap=150 log=\.rptc\/handoff\/overnight-[\d-]+\/ONE\.jsonl$/
        );
        expect(lines[2]).toBe('batch end — ONE exit=0');
        expect(lines[3]).toMatch(/^batch start — TWO pid=\d+ /);
        expect(lines[4]).toBe('batch end — TWO exit=0');
        expect(lines[5]).toBe('queue end — invoked=2');
        expect(out).toContain('npm run mutation:status');
    });

    it('marks a queue started by runs.sh, so status measures from the loop', () => {
        repo = new FixtureRepo('exit 0');

        const { log } = repo.run({ RUNS_LOOP: '1' });

        expect(log).toMatch(/queue start — gaps=7 modules=1 sha=\S+ batches=2 cap=150 loop=1\n/);
    });

    it('kills a batch that outlives its cap and carries on with the next one', () => {
        // The first batch never finishes; the second returns at once.
        repo = new FixtureRepo('if [[ "$2" == *first* ]]; then exec sleep 20; fi\nexit 0');

        const { code, out, log } = repo.run({ BATCH_TIMEOUT_SEC: '1' });

        expect(code).toBe(0);
        expect(out).toContain('ONE EXCEEDED 150 min — killing it so the queue continues');
        expect(log).toMatch(/batch end — ONE exit=143\n/);
        expect(log).toMatch(/batch end — TWO exit=0\n/);
        expect(log).toMatch(/queue end — invoked=2\n/);
    });

    it('CONTROL: the stand-in is what ran, with the goal as its argument', () => {
        repo = new FixtureRepo('echo "stub got: $2"');

        repo.run();
        const dir = path.join(repo.dir, '.rptc/handoff');
        const session = fs.readdirSync(dir).find((d) => d.startsWith('overnight-')) as string;

        expect(fs.readFileSync(path.join(dir, session, 'ONE.jsonl'), 'utf8')).toContain(
            'stub got: /goal first condition'
        );
    });
});

describe('the loop (runs.sh) and the redundancy sweep', () => {
    let repo: FixtureRepo | undefined;
    afterEach(() => repo?.dispose());

    const BY_HAND = 'node scripts/mutationRedundancySweep.mjs --minutes 300';
    // A session that commits, then asks the loop to stop after this run.
    const COMMIT_THEN_STOP =
        'git commit -q --allow-empty -F - <<< "work"\ntouch .rptc/handoff/STOP-RUNS';

    it('paused by the stop file: no sweep, and the log says how to run it by hand', () => {
        repo = new FixtureRepo(COMMIT_THEN_STOP);

        const { code, log, sweepCall } = repo.runLoop();

        expect(code).toBe(0);
        expect(log).toMatch(/stop file found — stopping\n/);
        expect(sweepCall).toBeNull();
        expect(log).toMatch(
            new RegExp(`redundancy sweep skipped — the loop was stopped by hand.*${BY_HAND}`)
        );
        expect(log).not.toContain('starting the redundancy sweep');
    });

    it('ended because no module has open gaps: the sweep runs', () => {
        repo = new FixtureRepo('exit 0');

        const { code, log, sweepCall } = repo.runLoop({ FAKE_QUEUED: '0' });

        expect(code).toBe(0);
        expect(log).toMatch(/no module has open gaps — the burn-down is DONE\n/);
        expect(sweepCall).toBe('--minutes 300');
        expect(log).toMatch(/starting the redundancy sweep .*--minutes 300/);
        expect(log).not.toContain('redundancy sweep skipped');
    });

    it('a run that moved HEAD by zero commits: no sweep', () => {
        repo = new FixtureRepo('exit 0');

        const { code, log, sweepCall } = repo.runLoop();

        expect(code).toBe(0);
        expect(log).toMatch(/run 1 produced NO commits — stopping/);
        expect(sweepCall).toBeNull();
        expect(log).toMatch(/redundancy sweep skipped — the run produced no commits/);
    });

    it('a queue size that could not be read: no sweep', () => {
        repo = new FixtureRepo('exit 0');

        const { log, sweepCall } = repo.runLoop({ FAKE_QUEUED: 'unreadable' });

        expect(log).toMatch(/could not read the queue size from the generator — stopping/);
        expect(sweepCall).toBeNull();
        expect(log).toMatch(/redundancy sweep skipped — the queue size could not be read/);
    });

    it('MAX_RUNS reached with gaps still open: no sweep', () => {
        repo = new FixtureRepo('git commit -q --allow-empty -F - <<< "work"');

        const { log, sweepCall } = repo.runLoop({ MAX_RUNS: '1' });

        expect(log).toMatch(/MAX_RUNS=1 reached — stopping\n/);
        expect(sweepCall).toBeNull();
        expect(log).toMatch(/redundancy sweep skipped — MAX_RUNS was reached/);
    });

    it('CONTROL: the loop ran the queue and the stand-in session each time', () => {
        repo = new FixtureRepo(COMMIT_THEN_STOP);

        const { log } = repo.runLoop();

        expect(log).toMatch(/run 1 finished: exit=0, 2 commit\(s\)\n/);
        expect(log).toMatch(/loop end — runs=1\n/);
    });
});
