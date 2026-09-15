/**
 * A template update merged from the storefront's RECORDED template version,
 * run against real git rather than a scripted one.
 *
 * WHY REAL GIT. A repository GitHub generates from a template has its own root
 * commit and shares no history with the template. `git merge template/main`
 * refuses that ("refusing to merge unrelated histories", exit 128) and leaves no
 * unmerged files, so a service that ignored the exit code read the refusal as a
 * clean, empty merge: it reported success, pushed nothing, and recorded the
 * storefront's own HEAD as the synced commit — so the same update was offered
 * again forever. The mocked suites could not see that, because a mock answers
 * whatever it is told git would say. These cases build the exact shape instead:
 * a template repository with two commits and a storefront repository with a
 * different root commit whose tree equals the first.
 *
 * THE SEAM. The service builds `https://github.com/<owner>/<repo>.git` URLs
 * (with the token injected for the storefront). Production code is unchanged:
 * the executor handed to the service here rewrites those URLs to `file://` URLs
 * of local bare repositories under the temp root before running the command.
 * The URL the service builds is pinned separately by the plumbing suite.
 *
 * SAFETY. Every git process runs with every `GIT_*` variable removed. The
 * pre-push gate runs jest inside a git hook with `GIT_DIR` set; a suite that
 * inherited it committed a delete-everything tree into the real repository on
 * 2026-09-15. HOME points into the temp root as well, so the developer's global
 * git config (signing, hooks) cannot change what these commands do. The
 * executor refuses anything that is not a git command.
 */

import { execFileSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import type { ExecuteOptions } from '@/core/shell/types';
import { TemplateSyncService } from '@/features/updates/services/templateSyncService';
import type { Project } from '@/types/base';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';

// The service reads its GitHub token through the shared service cache; only getToken is called.
jest.mock('@/features/eds/handlers/edsServiceCache', () => ({
    getGitHubServices: () => ({ tokenService: { getToken: async () => ({ token: 'gh-token' }) } }),
}));

const REAL_GIT_TIMEOUT_MS = 60_000;
const SC_REPO = 'skukla/demo-storefront';
const TEMPLATE = { owner: 'adobe', repo: 'aem-boilerplate-commerce' };
/** A GitHub https URL, with or without credentials in it, as the service builds it. */
const GITHUB_URL = /https:\/\/(?:[^@\s"]+@)?github\.com\/([^/\s"]+)\/([^/\s"]+?)\.git/g;

const BASE_A = 'line 1\nline 2\nline 3\n';
const TEMPLATE_A = 'line 1\nline 2 from the template\nline 3\n';
const SC_CONFLICTING_A = 'line 1\nline 2 from the SC\nline 3\n';
const BINARY_B = Buffer.from([0, 1, 2, 255, 254, 0, 7]);
const SC_CONFIG = '{"commerce-endpoint":"the SC\'s own"}\n';

/** This process's environment with every GIT_* variable removed, plus a fixed identity. */
function gitEnv(home: string): NodeJS.ProcessEnv {
    const inherited = Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'));
    return {
        ...Object.fromEntries(inherited),
        HOME: home,
        XDG_CONFIG_HOME: home,
        GIT_AUTHOR_NAME: 'test',
        GIT_AUTHOR_EMAIL: 'test@example.com',
        GIT_COMMITTER_NAME: 'test',
        GIT_COMMITTER_EMAIL: 'test@example.com',
    };
}

interface Fixture {
    root: string;
    home: string;
    scBare: string;
    t1: string;
    t2: string;
}

function git(fx: Pick<Fixture, 'home'>, cwd: string, ...args: string[]): string {
    return execFileSync('git', args, { cwd, env: gitEnv(fx.home), encoding: 'utf8' }).trim();
}

function write(dir: string, file: string, content: string | Buffer): void {
    fs.writeFileSync(path.join(dir, file), content);
}

function bareRepo(fx: Pick<Fixture, 'root' | 'home'>, ownerRepo: string): string {
    const bare = path.join(fx.root, 'github', `${ownerRepo}.git`);
    fs.mkdirSync(bare, { recursive: true });
    git(fx, bare, 'init', '-q', '--bare', '-b', 'main');
    return bare;
}

/** The template: T1 (the recorded base) → T2 (changes A, adds binary B, changes config.json). */
function buildTemplate(fx: Pick<Fixture, 'root' | 'home'>): { t1: string; t2: string } {
    const work = path.join(fx.root, 'template-work');
    fs.mkdirSync(work);
    git(fx, work, 'init', '-q', '-b', 'main');
    write(work, 'A.txt', BASE_A);
    write(work, 'C.txt', 'c from the template\n');
    write(work, 'config.json', '{"template":1}\n');
    git(fx, work, 'add', '-A');
    git(fx, work, 'commit', '-q', '-m', 'T1');
    const t1 = git(fx, work, 'rev-parse', 'HEAD');
    write(work, 'A.txt', TEMPLATE_A);
    write(work, 'B.bin', BINARY_B);
    write(work, 'config.json', '{"template":2}\n');
    git(fx, work, 'add', '-A');
    git(fx, work, 'commit', '-q', '-m', 'T2');
    const bare = bareRepo(fx, `${TEMPLATE.owner}/${TEMPLATE.repo}`);
    git(fx, work, 'push', '-q', bare, 'main');
    return { t1, t2: git(fx, work, 'rev-parse', 'HEAD') };
}

/**
 * The storefront: its OWN root commit ("Initial commit", as GitHub writes it)
 * whose tree equals T1, then the SC's edits, pushed to a bare origin.
 */
function buildStorefront(
    fx: Pick<Fixture, 'root' | 'home'>,
    scEdits: (work: string) => void,
): string {
    const work = path.join(fx.root, 'sc-work');
    fs.mkdirSync(work);
    git(fx, work, 'init', '-q', '-b', 'main');
    write(work, 'A.txt', BASE_A);
    write(work, 'C.txt', 'c from the template\n');
    write(work, 'config.json', '{"template":1}\n');
    git(fx, work, 'add', '-A');
    git(fx, work, 'commit', '-q', '-m', 'Initial commit');
    write(work, 'C.txt', 'c edited by the SC\n');
    write(work, 'config.json', SC_CONFIG);
    scEdits(work);
    git(fx, work, 'add', '-A');
    git(fx, work, 'commit', '-q', '-m', 'SC edits');
    const bare = bareRepo(fx, SC_REPO);
    git(fx, work, 'push', '-q', bare, 'main');
    return bare;
}

function buildFixture(scEdits: (work: string) => void = () => undefined): Fixture {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'template-merge-base-')));
    const home = path.join(root, 'home');
    fs.mkdirSync(home);
    const { t1, t2 } = buildTemplate({ root, home });
    const scBare = buildStorefront({ root, home }, scEdits);
    return { root, home, scBare, t1, t2 };
}

/** A CommandExecutor that runs git for real, against the local bare repositories. */
function realGitExecutor(fx: Fixture) {
    const execute = async (command: string, options: ExecuteOptions = {}) => {
        if (!command.startsWith('git ')) throw new Error(`not a git command: ${command}`);
        const local = command.replace(GITHUB_URL, (_url, owner: string, repo: string) =>
            pathToFileURL(path.join(fx.root, 'github', owner, `${repo}.git`)).href,
        );
        const run = spawnSync('/bin/bash', ['-c', local], {
            cwd: options.cwd, env: gitEnv(fx.home), encoding: 'utf8',
        });
        return { code: run.status, stdout: run.stdout, stderr: run.stderr, duration: 0 };
    };
    return createMockCommandExecutor({ execute });
}

function storefrontProject(lastSyncedCommit: string | undefined): Project {
    return createMockProject({
        name: 'demo',
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                status: 'ready',
                metadata: {
                    githubRepo: SC_REPO,
                    templateOwner: TEMPLATE.owner,
                    templateRepo: TEMPLATE.repo,
                    lastSyncedCommit,
                },
            },
        },
    });
}

function merge(fx: Fixture, lastSyncedCommit: string | undefined, strategy: 'merge' | 'reset' = 'merge') {
    const svc = new TemplateSyncService(
        createMockSecretStorage({ githubToken: 'gh-token' }).secrets,
        createMockLogger(),
        realGitExecutor(fx),
    );
    return svc.syncWithTemplate(storefrontProject(lastSyncedCommit), { strategy });
}

const originHead = (fx: Fixture): string => git(fx, fx.scBare, 'rev-parse', 'main');
const originFile = (fx: Fixture, file: string): string =>
    git(fx, fx.scBare, 'show', `main:${file}`);

describe('merging a template update from the recorded version (real git)', () => {
    let fx: Fixture;

    afterEach(() => {
        if (fx) fs.rmSync(fx.root, { recursive: true, force: true });
    });

    it('CONTROL: the two repositories really share no history', () => {
        fx = buildFixture();
        const probe = path.join(fx.root, 'probe');
        git(fx, fx.root, 'clone', '-q', fx.scBare, probe);
        git(fx, probe, 'fetch', '-q', path.join(fx.root, 'github', TEMPLATE.owner, `${TEMPLATE.repo}.git`), 'main');
        const refused = spawnSync('git', ['merge', 'FETCH_HEAD', '--no-commit', '--no-ff'], {
            cwd: probe, env: gitEnv(fx.home), encoding: 'utf8',
        });
        expect(refused.status).toBe(128);
        expect(refused.stderr).toContain('unrelated histories');
    }, REAL_GIT_TIMEOUT_MS);

    it('(a) applies the template change, keeps the SC edits, pushes, and records the template commit', async () => {
        fx = buildFixture();
        const before = originHead(fx);

        const result = await merge(fx, fx.t1);

        expect(result).toEqual({ success: true, strategy: 'merge', syncedCommit: fx.t2 });
        expect(originHead(fx)).not.toBe(before);
        expect(originFile(fx, 'A.txt')).toBe(TEMPLATE_A.trim());
        expect(originFile(fx, 'C.txt')).toBe('c edited by the SC');
        // A preserved file keeps the SC's version even though the template changed it.
        expect(originFile(fx, 'config.json')).toBe(SC_CONFIG.trim());
        const bin = execFileSync('git', ['show', 'main:B.bin'], { cwd: fx.scBare, env: gitEnv(fx.home) });
        expect(Buffer.compare(bin, BINARY_B)).toBe(0);
    }, REAL_GIT_TIMEOUT_MS);

    it('(b) the SC edited the lines the template changed: stops, names the file, pushes nothing', async () => {
        fx = buildFixture((work) => write(work, 'A.txt', SC_CONFLICTING_A));
        const before = originHead(fx);

        const result = await merge(fx, fx.t1);

        expect(result).toEqual({
            success: false,
            strategy: 'merge',
            syncedCommit: '',
            conflicts: ['A.txt'],
            error: 'Merge conflicts in 1 file (A.txt); the template update was not applied.',
        });
        expect(originHead(fx)).toBe(before);
    }, REAL_GIT_TIMEOUT_MS);

    it('(c) no recorded version: fails with the reset-once sentence and pushes nothing', async () => {
        fx = buildFixture();
        const before = originHead(fx);

        const result = await merge(fx, undefined);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/no recorded template version/);
        expect(result.error).toMatch(/reset it to its template once/);
        expect(originHead(fx)).toBe(before);
    }, REAL_GIT_TIMEOUT_MS);

    it('(d) the recorded version IS the template head: succeeds and pushes nothing', async () => {
        fx = buildFixture();
        const before = originHead(fx);

        const result = await merge(fx, fx.t2);

        expect(result).toEqual({ success: true, strategy: 'merge', syncedCommit: fx.t2 });
        expect(originHead(fx)).toBe(before);
    }, REAL_GIT_TIMEOUT_MS);

    it('(e) an apply that fails without conflicts: reports git\'s reason and pushes nothing', async () => {
        // The SC deleted the file the template changed: git cannot 3-way that,
        // and says so without leaving any file unmerged.
        fx = buildFixture((work) => fs.rmSync(path.join(work, 'A.txt')));
        const before = originHead(fx);

        const result = await merge(fx, fx.t1);

        expect(result.success).toBe(false);
        expect(result.conflicts).toBeUndefined();
        expect(result.error).toBe('The template update could not be applied: A.txt: does not exist in index.');
        expect(originHead(fx)).toBe(before);
    }, REAL_GIT_TIMEOUT_MS);

    it('(f) a recorded version that is not a template commit: fails and pushes nothing', async () => {
        // The shape the old merge left behind: it recorded the storefront's OWN
        // head. Diffing from that commit would replay "turn this storefront into
        // the template" over the SC's edits, so it must be refused, not applied.
        fx = buildFixture();
        const before = originHead(fx);

        const result = await merge(fx, before);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/is not in adobe\/aem-boilerplate-commerce's history/);
        expect(originHead(fx)).toBe(before);
    }, REAL_GIT_TIMEOUT_MS);

    it('reset (the explicit alternative) records the template commit too, not the storefront head', async () => {
        // Same reason as (a): the update checker compares the record against the
        // TEMPLATE's latest commit, so recording the storefront's own head after a
        // reset would offer the same update again.
        fx = buildFixture((work) => write(work, 'A.txt', SC_CONFLICTING_A));

        const result = await merge(fx, fx.t1, 'reset');

        expect(result).toEqual({ success: true, strategy: 'reset', syncedCommit: fx.t2 });
        expect(originFile(fx, 'A.txt')).toBe(TEMPLATE_A.trim());
        expect(originFile(fx, 'config.json')).toBe(SC_CONFIG.trim());
    }, REAL_GIT_TIMEOUT_MS);
});
