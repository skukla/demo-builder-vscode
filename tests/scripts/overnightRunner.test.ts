/**
 * `scripts/overnight/run.sh`, run for real against a stand-in `claude` in a throwaway
 * git repository.
 *
 * Two things are held here. The runner writes the boundary lines `npm run
 * mutation:status` reads — the queue's starting numbers, each batch's start with its
 * pid, each end — into the one log. And the wall-clock cap on a batch still fires: a
 * batch that does not finish is killed and the queue moves on, which is the only thing
 * that has ever stopped a session waiting on output that was never coming.
 *
 * No session is started: `claude` and `caffeinate` are two-line stubs first on PATH.
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
        for (const f of ['run.sh', 'status.mjs']) {
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
        this.write('bin/caffeinate', '#!/usr/bin/env bash\nshift\nexec "$@"\n', 0o755);
        this.write('bin/claude', `#!/usr/bin/env bash\n${claudeBody}\n`, 0o755);
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
