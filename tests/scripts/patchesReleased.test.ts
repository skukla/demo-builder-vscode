/**
 * `scripts/patchesReleased.mjs` — is the patches repo's verified work in a release, so
 * storefronts get it? Run as a subprocess on given facts (the scripts are plain ESM
 * `.mjs`, which this repo's jest transform does not parse; precedent:
 * `mutationStaleRows.test.ts`). The network half only gathers the facts.
 *
 * The first case is the real state on 2026-10-16, before v1.1.0: the check exists
 * because that state passed every other check for seven weeks.
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const SCRIPT = path.resolve(__dirname, '../../scripts/patchesReleased.mjs');
const NOW = '2026-10-16T12:00:00Z';
const REPO = 'skukla/eds-demo-patches';

interface Facts {
    repo: string;
    release: { tag: string; sha: string } | null;
    mainSha: string;
    unreleased: Array<{ sha: string; date: string }>;
    gateConclusion: string | null;
    gateState?: string;
    gateLastRun?: string | null;
}

let dir: string;

beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'patches-released-'));
});

afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
});

/** Run the script on `facts`; its exit code and what it printed. */
function check(facts: Facts[]): { code: number | null; out: string } {
    const file = path.join(dir, `facts-${Math.random().toString(36).slice(2)}.json`);
    fs.writeFileSync(file, JSON.stringify(facts));
    const run = spawnSync(process.execPath, [SCRIPT, '--facts', file, '--now', NOW], { encoding: 'utf8' });
    return { code: run.status, out: run.stdout };
}

const released = (sha: string): Facts => ({
    repo: REPO,
    release: { tag: 'v1.1.0', sha },
    mainSha: sha,
    unreleased: [],
    gateConclusion: 'success',
    gateState: 'active',
    gateLastRun: '2026-10-16T07:20:00Z',
});

describe('patchesReleased', () => {
    it('fails on seven weeks of verified work no release carries (the 2026-10-16 state)', () => {
        const { code, out } = check([
            {
                repo: REPO,
                release: { tag: 'v1.0.0', sha: 'aaa' },
                mainSha: 'zzz',
                unreleased: [
                    { sha: 'b', date: '2026-08-29T07:30:00Z' },
                    { sha: 'zzz', date: '2026-10-16T12:25:00Z' },
                ],
                gateConclusion: 'success',
            },
        ]);

        expect(code).toBe(1);
        expect(out).toContain('FAIL skukla/eds-demo-patches: 2 commits on main, the oldest 1156h old');
        expect(out).toContain('latest release v1.0.0');
    });

    it('passes when main is the latest release', () => {
        const { code, out } = check([released('abc')]);

        expect(code).toBe(0);
        expect(out).toBe('OK   skukla/eds-demo-patches: main is released as v1.1.0\n');
    });

    it('passes while unreleased work is younger than two days: the next daily run releases it', () => {
        const { code, out } = check([
            {
                ...released('aaa'),
                mainSha: 'bbb',
                unreleased: [{ sha: 'bbb', date: '2026-10-15T07:30:00Z' }],
                gateConclusion: 'failure',
            },
        ]);

        expect(code).toBe(0);
        expect(out).toContain('1 commit on main wait for the next daily release (oldest 28h)');
        expect(out).toContain("The drift gate's last run: failure.");
    });

    it('fails when the repo has no release at all', () => {
        const { code, out } = check([{ ...released('a'), release: null }]);

        expect(code).toBe(1);
        expect(out).toContain('no release at all');
    });

    it('fails the run when any one repo fails', () => {
        const stale: Facts = {
            ...released('aaa'),
            repo: 'skukla/other-patches',
            mainSha: 'bbb',
            unreleased: [{ sha: 'bbb', date: '2026-10-01T00:00:00Z' }],
        };

        const { code } = check([released('abc'), stale]);

        expect(code).toBe(1);
    });

    // Since 2026-10-16 the gate commits only when upstream's files change, so a
    // quiet stretch can pass 60 days without a commit, and GitHub then switches the
    // scheduled workflow off (it did exactly that to bodea-source's sync). Nothing
    // would be unreleased, so the release check alone would say OK forever.
    it('fails when GitHub has switched the daily check off', () => {
        const { code, out } = check([{ ...released('abc'), gateState: 'disabled_inactivity' }]);

        expect(code).toBe(1);
        expect(out).toContain('the daily drift gate is switched off (disabled_inactivity)');
    });

    it('fails when the daily check has not run for more than two days', () => {
        const { code, out } = check([{ ...released('abc'), gateLastRun: '2026-10-13T07:20:00Z' }]);

        expect(code).toBe(1);
        expect(out).toContain('the daily drift gate last ran 76h ago');
    });

    it('passes when the daily check ran this morning — control', () => {
        expect(check([released('abc')]).code).toBe(0);
    });
});
