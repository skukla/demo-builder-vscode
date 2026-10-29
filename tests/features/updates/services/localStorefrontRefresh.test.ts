/**
 * refreshLocalStorefront — the local storefront copy follows GitHub and loses nothing
 * (EDS-57 step 1), run against real git.
 *
 * WHY REAL GIT. The rules are about what git refuses: a fast-forward over a dirty file, a
 * merge onto local commits. A scripted git answers whatever it is told and cannot see
 * either. "GitHub" here is a local bare repository; the copy is a clone of it.
 *
 * SAFETY. Every git process runs with every `GIT_*` variable removed and HOME in the temp
 * root (the pre-push gate runs jest with GIT_DIR set; see templateMergeBase.test.ts).
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { refreshLocalStorefront, refreshLocalStorefronts } from '@/features/updates/services/localStorefrontRefresh';
import type { GitStep } from '@/features/updates/services/templateMergeBase';
import type { UpdateContext } from '@/features/updates/services/updateCore';
import type { Project } from '@/types/base';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { gitEnv, realGitExecutor, runGit } from '../../../helpers/realGit';

// The SC's GitHub token; the token service is the one thing faked on the wrapper's path.
const mockGetToken = jest.fn();
jest.mock('@/features/eds/handlers/edsServiceCache', () => ({
    getGitHubServices: () => ({ tokenService: { getToken: () => mockGetToken() } }),
}));

const REAL_GIT_TIMEOUT_MS = 60_000;
const SC_REPO = 'skukla/demo-storefront';

interface Fixture {
    root: string;
    home: string;
    bare: string;
    /** A second clone standing in for GitHub-side commits (the API, a colleague). */
    upstream: string;
    /** The project's local copy. */
    local: string;
}

let fx: Fixture;

function git(cwd: string, ...args: string[]): string {
    return runGit(fx.home, cwd, ...args);
}

function write(dir: string, file: string, content: string): void {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
}

/** Commit on "GitHub" (through the upstream clone) and push. */
function commitOnGitHub(files: Record<string, string>, message: string): string {
    for (const [file, content] of Object.entries(files)) write(fx.upstream, file, content);
    git(fx.upstream, 'add', '-A');
    git(fx.upstream, 'commit', '-q', '-m', message);
    git(fx.upstream, 'push', '-q', 'origin', 'main');
    return git(fx.upstream, 'rev-parse', 'HEAD');
}

/** The production GitStep shape, running real git (only git) in the local copy. */
const runInLocal: GitStep = async (command) => {
    if (!command.startsWith('git ')) throw new Error(`not a git command: ${command}`);
    const started = Date.now();
    const r = spawnSync('/bin/bash', ['-c', command], { cwd: fx.local, env: gitEnv(fx.home), encoding: 'utf8' });
    return { code: r.status, stdout: r.stdout, stderr: r.stderr, duration: Date.now() - started };
};

const request = () => ({
    storefrontPath: fx.local,
    remoteUrl: pathToFileURL(fx.bare).href,
    branch: 'main',
});

beforeEach(() => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'local-refresh-')));
    const home = path.join(root, 'home');
    fs.mkdirSync(home);
    fx = { root, home, bare: path.join(root, 'github', `${SC_REPO}.git`), upstream: path.join(root, 'upstream'), local: path.join(root, 'local') };
    fs.mkdirSync(fx.bare, { recursive: true });
    git(fx.bare, 'init', '-q', '--bare', '-b', 'main');
    git(root, 'clone', '-q', fx.bare, 'upstream');
    commitOnGitHub({ 'config.json': '{"v":1}\n', 'blocks/header/header.js': 'header 1\n' }, 'Initial commit');
    git(root, 'clone', '-q', fx.bare, 'local');
});

afterEach(() => {
    fs.rmSync(fx.root, { recursive: true, force: true });
});

describe('refreshLocalStorefront', () => {
    it('fast-forwards a clean copy that is behind GitHub', async () => {
        const from = git(fx.local, 'rev-parse', 'HEAD');
        const to = commitOnGitHub({ 'scripts/scripts.js': 'vendored\n' }, 'chore: vendor a snippet');

        await expect(refreshLocalStorefront(runInLocal, request())).resolves.toEqual({ kind: 'refreshed', from, to });

        expect(git(fx.local, 'rev-parse', 'HEAD')).toBe(to);
        expect(fs.readFileSync(path.join(fx.local, 'scripts/scripts.js'), 'utf8')).toBe('vendored\n');
    }, REAL_GIT_TIMEOUT_MS);

    it('says current when the copy already matches GitHub', async () => {
        await expect(refreshLocalStorefront(runInLocal, request())).resolves.toEqual({ kind: 'current' });
    }, REAL_GIT_TIMEOUT_MS);

    it("drops a local change GitHub already holds (JustRite's config.json), then fast-forwards", async () => {
        const to = commitOnGitHub({ 'config.json': '{"v":2}\n' }, 'chore: sync config.json');
        // The extension wrote the same config locally and through GitHub.
        write(fx.local, 'config.json', '{"v":2}\n');

        await expect(refreshLocalStorefront(runInLocal, request())).resolves.toMatchObject({ kind: 'refreshed', to });

        expect(git(fx.local, 'status', '--porcelain')).toBe('');
    }, REAL_GIT_TIMEOUT_MS);

    it('drops an untracked file GitHub already holds, so the fast-forward can write it', async () => {
        const to = commitOnGitHub({ 'head.html': '<meta>\n' }, 'chore: add head.html');
        write(fx.local, 'head.html', '<meta>\n');

        await expect(refreshLocalStorefront(runInLocal, request())).resolves.toMatchObject({ kind: 'refreshed', to });
    }, REAL_GIT_TIMEOUT_MS);

    it('leaves the copy as it is when it holds a change GitHub does not have', async () => {
        commitOnGitHub({ 'scripts/scripts.js': 'vendored\n' }, 'chore: vendor a snippet');
        const head = git(fx.local, 'rev-parse', 'HEAD');
        write(fx.local, 'blocks/header/header.js', 'an edit only here\n');

        await expect(refreshLocalStorefront(runInLocal, request())).resolves.toEqual({
            kind: 'left',
            reason: 'it has a local change GitHub does not have (blocks/header/header.js)',
        });

        expect(git(fx.local, 'rev-parse', 'HEAD')).toBe(head);
        expect(fs.readFileSync(path.join(fx.local, 'blocks/header/header.js'), 'utf8')).toBe('an edit only here\n');
    }, REAL_GIT_TIMEOUT_MS);

    it('drops nothing when any one change is not on GitHub, even if another is', async () => {
        commitOnGitHub({ 'config.json': '{"v":2}\n' }, 'chore: sync config.json');
        write(fx.local, 'config.json', '{"v":2}\n');
        write(fx.local, 'notes.txt', 'only here\n');

        await expect(refreshLocalStorefront(runInLocal, request())).resolves.toMatchObject({ kind: 'left' });

        expect(fs.readFileSync(path.join(fx.local, 'config.json'), 'utf8')).toBe('{"v":2}\n');
        expect(fs.readFileSync(path.join(fx.local, 'notes.txt'), 'utf8')).toBe('only here\n');
    }, REAL_GIT_TIMEOUT_MS);

    it('leaves the copy as it is when it has commits GitHub does not have', async () => {
        commitOnGitHub({ 'scripts/scripts.js': 'vendored\n' }, 'chore: vendor a snippet');
        write(fx.local, 'blocks/header/header.js', 'committed only here\n');
        git(fx.local, 'commit', '-q', '-am', 'a local commit');
        const head = git(fx.local, 'rev-parse', 'HEAD');

        await expect(refreshLocalStorefront(runInLocal, request())).resolves.toEqual({
            kind: 'left',
            reason: 'it has commits GitHub does not have',
        });

        expect(git(fx.local, 'rev-parse', 'HEAD')).toBe(head);
    }, REAL_GIT_TIMEOUT_MS);

    it('leaves a copy on another branch alone', async () => {
        git(fx.local, 'checkout', '-q', '-b', 'experiment');

        await expect(refreshLocalStorefront(runInLocal, request())).resolves.toEqual({
            kind: 'left',
            reason: 'it is on experiment, not main',
        });
    }, REAL_GIT_TIMEOUT_MS);

    it('never writes the fetch URL into the copy\'s git config', async () => {
        commitOnGitHub({ 'scripts/scripts.js': 'vendored\n' }, 'chore: vendor a snippet');

        await refreshLocalStorefront(runInLocal, request());

        // The URL handed in (in production, the one carrying the token) is not stored...
        const config = fs.readFileSync(path.join(fx.local, '.git', 'config'), 'utf8');
        expect(config).not.toContain(request().remoteUrl);
        // ...and, as a control that this reads the right file, the clone's own origin is.
        expect(config).toContain(fx.bare);
    }, REAL_GIT_TIMEOUT_MS);
});

function storefrontProject(storefrontPath: string): Project {
    return createMockProject({
        name: 'demo',
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                status: 'ready',
                path: storefrontPath,
                metadata: { githubRepo: SC_REPO },
            },
        },
    });
}

function updateContext(): UpdateContext & { logger: ReturnType<typeof createMockLogger> } {
    return {
        secrets: createMockSecretStorage().secrets,
        extensionPath: '/ext',
        stateManager: createMockStateManager(),
        commandManager: realGitExecutor(fx.root, fx.home),
        logger: createMockLogger(),
    };
}

describe('refreshLocalStorefronts (after an update)', () => {
    it("refreshes a project's copy from its GitHub repository, once however often it is named", async () => {
        mockGetToken.mockResolvedValue({ token: 'gh-token' });
        const to = commitOnGitHub({ 'scripts/scripts.js': 'vendored\n' }, 'chore: vendor a snippet');
        const project = storefrontProject(fx.local);
        const ctx = updateContext();

        await refreshLocalStorefronts([project, project], ctx);

        expect(git(fx.local, 'rev-parse', 'HEAD')).toBe(to);
        expect((ctx.commandManager.execute as jest.Mock).mock.calls.filter(([c]) => String(c).startsWith('git fetch'))).toHaveLength(1);
        // The token rides in the fetch URL, never in the copy's config.
        expect(fs.readFileSync(path.join(fx.local, '.git', 'config'), 'utf8')).not.toContain('gh-token');
    }, REAL_GIT_TIMEOUT_MS);

    it('tells the window it is updating the local copy, once per copy', async () => {
        mockGetToken.mockResolvedValue({ token: 'gh-token' });
        commitOnGitHub({ 'scripts/scripts.js': 'vendored\n' }, 'chore: vendor a snippet');
        const project = storefrontProject(fx.local);
        const onProgress = jest.fn();

        const onCopy = jest.fn();

        await refreshLocalStorefronts([project, project], updateContext(), onProgress, onCopy);

        expect(onProgress.mock.calls).toEqual([['Updating your local copy', expect.any(String)]]);
        // And as a step of its own, which keeps its outcome (2026-10-21).
        expect(onCopy.mock.calls).toEqual([
            [project, { state: 'running' }],
            [project, { state: 'done' }],
        ]);
    }, REAL_GIT_TIMEOUT_MS);

    it('runs nothing without a GitHub token', async () => {
        mockGetToken.mockResolvedValue(undefined);
        const ctx = updateContext();

        await refreshLocalStorefronts([storefrontProject(fx.local)], ctx);

        expect(ctx.commandManager.execute).not.toHaveBeenCalled();
    });

    it('skips a project with no local copy on disk', async () => {
        mockGetToken.mockResolvedValue({ token: 'gh-token' });
        const ctx = updateContext();

        await refreshLocalStorefronts([storefrontProject(path.join(fx.root, 'nowhere'))], ctx);

        expect(ctx.commandManager.execute).not.toHaveBeenCalled();
    });

    it('never fails the update when the copy cannot be refreshed', async () => {
        mockGetToken.mockResolvedValue({ token: 'gh-token' });
        const ctx = updateContext();
        (ctx.commandManager.execute as jest.Mock).mockRejectedValue(new Error('spawn failed'));

        const onCopy = jest.fn();

        await expect(refreshLocalStorefronts([storefrontProject(fx.local)], ctx, undefined, onCopy)).resolves.toBeUndefined();

        expect(ctx.logger.warn).toHaveBeenCalled();
        expect(onCopy).toHaveBeenLastCalledWith(expect.anything(), {
            state: 'skipped',
            message: 'Not brought up to date — details are in Debug Logs.',
        });
    });
});
