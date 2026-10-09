/**
 * `scripts/mutationStaleRows.mjs` and `mutationSweep.mjs --stale`, run against a
 * throwaway git repository built commit by commit.
 *
 * A baseline row is STALE when its module, or a suite that mirrors it, has a commit
 * the row's own commit does not contain. The order of commits is the whole rule, so
 * every case here is built by committing in a chosen order and asking the real
 * script, as a subprocess (the scripts are plain ESM `.mjs`, which this repo's jest
 * transform does not parse — the precedent is `traceSession.test.ts`).
 *
 * SAFETY. Every git process runs with every `GIT_*` variable removed. The pre-push
 * gate runs jest inside a git hook with `GIT_DIR` set; a suite that inherited it
 * committed into the real repository on 2026-09-15. HOME points into the temp root
 * so the developer's global git config cannot change what these commands do.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const SCRIPTS = path.resolve(__dirname, '../../scripts');
const STALE_SCRIPT = path.join(SCRIPTS, 'mutationStaleRows.mjs');
const SWEEP_SCRIPT = path.join(SCRIPTS, 'mutationSweep.mjs');
const BASELINE = 'reports/mutation/baseline.json';

interface StaleRow {
    module: string;
    recorded: { sha: string; date: string };
    lastChange: { sha: string; date: string };
    changesAfter: number;
    changed: 'module' | 'suite';
}
interface StaleReport {
    rows: number;
    stale: StaleRow[];
    uncommitted: number;
    gone: string[];
}

/** A fixture repository whose commits carry fixed, increasing dates. */
class FixtureRepo {
    readonly dir: string;
    private day = 1;

    constructor() {
        this.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stale-rows-'));
        this.git(['init', '-q', '-b', 'main']);
    }

    env(): NodeJS.ProcessEnv {
        const inherited = Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'));
        const date = `2026-09-${String(this.day).padStart(2, '0')}T12:00:00Z`;
        return {
            ...Object.fromEntries(inherited),
            HOME: this.dir,
            XDG_CONFIG_HOME: this.dir,
            GIT_AUTHOR_NAME: 'test',
            GIT_AUTHOR_EMAIL: 'test@example.com',
            GIT_COMMITTER_NAME: 'test',
            GIT_COMMITTER_EMAIL: 'test@example.com',
            GIT_AUTHOR_DATE: date,
            GIT_COMMITTER_DATE: date,
        };
    }

    git(args: string[]): string {
        return execFileSync('git', args, { cwd: this.dir, env: this.env(), encoding: 'utf8' });
    }

    write(file: string, content: string): void {
        const full = path.join(this.dir, file);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content);
    }

    /** Set a module's baseline row; any other row is kept. */
    row(module: string, score: number): void {
        const full = path.join(this.dir, BASELINE);
        const base = fs.existsSync(full)
            ? JSON.parse(fs.readFileSync(full, 'utf8'))
            : { _what: 'fixture', modules: {} };
        base.modules[module] = { score, killed: 1, survived: 0, noCoverage: 0, openGaps: 0 };
        this.write(BASELINE, JSON.stringify(base, null, 4) + '\n');
    }

    commit(message: string): void {
        this.git(['add', '-A']);
        this.git(['commit', '-q', '-m', message]);
        this.day += 1;
    }

    run(script: string, args: string[]): string {
        return execFileSync(process.execPath, [script, ...args], {
            cwd: this.dir,
            env: this.env(),
            encoding: 'utf8',
        });
    }

    report(): StaleReport {
        return JSON.parse(this.run(STALE_SCRIPT, ['--json']));
    }

    remove(): void {
        fs.rmSync(this.dir, { recursive: true, force: true });
    }
}

const staleModules = (r: StaleReport): string[] => r.stale.map((s) => s.module);

describe('mutationStaleRows.mjs — which rows are stale', () => {
    let repo: FixtureRepo;
    beforeEach(() => {
        repo = new FixtureRepo();
    });
    afterEach(() => repo.remove());

    it('flags a row whose module changed AFTER the row was recorded', () => {
        repo.write('src/a.ts', 'export const a = 1;\n');
        repo.row('src/a.ts', 90);
        repo.commit('module and row');
        repo.write('src/a.ts', 'export const a = 2;\n');
        repo.commit('module changes');

        const report = repo.report();
        expect(staleModules(report)).toEqual(['src/a.ts']);
        expect(report.stale[0].changesAfter).toBe(1);
        expect(report.stale[0].changed).toBe('module');
        expect(report.stale[0].recorded.date).toMatch(/^2026-09-01/);
        expect(report.stale[0].lastChange.date).toMatch(/^2026-09-02/);
    });

    it('does NOT flag a row recorded after the module last changed', () => {
        repo.write('src/a.ts', 'export const a = 1;\n');
        repo.commit('module');
        repo.write('src/a.ts', 'export const a = 2;\n');
        repo.commit('module changes');
        repo.row('src/a.ts', 90);
        repo.commit('row');

        expect(staleModules(repo.report())).toStrictEqual([]);
    });

    it('does NOT flag a module changed in the same commit that recorded its row', () => {
        repo.write('src/a.ts', 'export const a = 1;\n');
        repo.row('src/a.ts', 80);
        repo.commit('first');
        repo.write('src/a.ts', 'export const a = 2;\n');
        repo.row('src/a.ts', 85);
        repo.commit('module change measured and pinned together');

        expect(staleModules(repo.report())).toStrictEqual([]);
    });

    it('flags a row whose MIRRORING SUITE changed after it, and only that row', () => {
        repo.write('src/a.ts', 'export const a = 1;\n');
        repo.write('src/b.ts', 'export const b = 1;\n');
        repo.write('tests/a.test.ts', '// a\n');
        repo.write('tests/b.test.ts', '// b\n');
        repo.row('src/a.ts', 90);
        repo.row('src/b.ts', 90);
        repo.commit('two modules, two rows');
        repo.write('tests/a.test.ts', '// a, one test fewer\n');
        repo.commit('suite changes');

        const report = repo.report();
        expect(staleModules(report)).toEqual(['src/a.ts']);
        expect(report.stale[0].changed).toBe('suite');
    });

    it('takes the row commit from the ROW, not from the last commit to the file', () => {
        // Another module's row being rewritten must not make this row look fresh.
        repo.write('src/a.ts', 'export const a = 1;\n');
        repo.write('src/b.ts', 'export const b = 1;\n');
        repo.row('src/a.ts', 90);
        repo.row('src/b.ts', 90);
        repo.commit('rows');
        repo.write('src/a.ts', 'export const a = 2;\n');
        repo.commit('a changes');
        repo.row('src/b.ts', 95);
        repo.commit('b re-measured');

        expect(staleModules(repo.report())).toEqual(['src/a.ts']);
    });

    it('treats a row changed in the working tree as just recorded', () => {
        repo.write('src/a.ts', 'export const a = 1;\n');
        repo.row('src/a.ts', 90);
        repo.commit('module and row');
        repo.write('src/a.ts', 'export const a = 2;\n');
        repo.commit('module changes');
        repo.row('src/a.ts', 70);

        const report = repo.report();
        expect(staleModules(report)).toStrictEqual([]);
        expect(report.uncommitted).toBe(1);
    });

    it('lists stale rows OLDEST first, and a row whose module is gone separately', () => {
        repo.write('src/old.ts', '1\n');
        repo.write('src/gone.ts', '1\n');
        repo.row('src/old.ts', 90);
        repo.row('src/gone.ts', 90);
        repo.commit('old rows');
        repo.write('src/new.ts', '1\n');
        repo.row('src/new.ts', 90);
        repo.commit('newer row');
        repo.write('src/old.ts', '2\n');
        repo.write('src/new.ts', '2\n');
        fs.rmSync(path.join(repo.dir, 'src/gone.ts'));
        repo.commit('both change, one deleted');

        const report = repo.report();
        expect(report.rows).toBe(3);
        expect(staleModules(report)).toEqual(['src/old.ts', 'src/new.ts']);
        expect(report.gone).toEqual(['src/gone.ts']);
    });

    it('prints the rows with both dates and a re-measure command in text mode', () => {
        repo.write('src/a.ts', '1\n');
        repo.row('src/a.ts', 90);
        repo.commit('row');
        repo.write('src/a.ts', '2\n');
        repo.commit('change');

        const out = repo.run(STALE_SCRIPT, []);
        expect(out).toMatch(/1 of 1 rows? stale/);
        expect(out).toMatch(/2026-09-01\s+2026-09-02\s+1\s+module\s+src\/a\.ts/);
        expect(out).toContain('node scripts/mutationSweep.mjs --stale');
    });

    it('CONTROL: an all-fresh repo prints a zero, not an empty page', () => {
        repo.write('src/a.ts', '1\n');
        repo.row('src/a.ts', 90);
        repo.commit('row');

        expect(repo.run(STALE_SCRIPT, [])).toMatch(/0 of 1 rows? stale/);
    });
});

describe('mutationSweep.mjs --stale --dry — the overnight runner re-measures exactly those rows', () => {
    let repo: FixtureRepo;
    beforeEach(() => {
        repo = new FixtureRepo();
    });
    afterEach(() => repo.remove());

    it('queues the stale modules, oldest first, and runs nothing', () => {
        for (const m of ['src/fresh.ts', 'src/stale1.ts']) repo.write(m, '1\n');
        repo.row('src/stale1.ts', 90);
        repo.commit('first row');
        repo.write('src/stale2.ts', '1\n');
        repo.row('src/stale2.ts', 90);
        repo.commit('second row');
        repo.write('src/stale1.ts', '2\n');
        repo.write('src/stale2.ts', '2\n');
        repo.commit('both change');
        repo.row('src/fresh.ts', 90);
        repo.commit('fresh row');

        const out = repo.run(SWEEP_SCRIPT, ['--stale', '--dry']);
        const queued = out
            .split('\n')
            .filter((l) => l.startsWith('  src/'))
            .map((l) => l.trim());
        expect(queued).toEqual(['src/stale1.ts', 'src/stale2.ts']);
        expect(out).toMatch(/dry run/i);
        // Nothing was written: no sweep log, no focus report.
        expect(fs.existsSync(path.join(repo.dir, 'reports/mutation/sweep-log.jsonl'))).toBe(false);
    });
});
