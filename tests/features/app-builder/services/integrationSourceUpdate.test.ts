/**
 * integrationSourceUpdate — fast-forwarding an integration's clone, against
 * real git repositories in a temp directory: a bare "GitHub" origin, a clone of
 * it (the integration folder), and a second clone that pushes new commits.
 *
 * SAFETY. Every git process runs with every `GIT_*` variable removed (the
 * pre-push gate runs jest inside a git hook with `GIT_DIR` set; a suite that
 * inherited it committed a delete-everything tree into the real repository on
 * 2026-09-15) and with HOME inside the temp root, so the developer's global git
 * config cannot change what these commands do. The runner refuses anything that
 * is not a git command.
 */

import { execFileSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    checkCloneForUpdate,
    fastForwardClone,
    type GitRunner,
} from '@/features/app-builder/services/integrationSourceUpdate';

const REAL_GIT_TIMEOUT_MS = 60_000;

interface Fixture {
    root: string;
    home: string;
    origin: string;
    clone: string;
    upstream: string;
}

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

function git(fx: Fixture, cwd: string, ...args: string[]): string {
    return execFileSync('git', args, { cwd, env: gitEnv(fx.home), encoding: 'utf8' }).trim();
}

function write(dir: string, file: string, content: string): void {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
}

/** Origin with one commit, the integration's clone of it, and an upstream clone to push from. */
function buildFixture(): Fixture {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'integration-update-')));
    const home = path.join(root, 'home');
    fs.mkdirSync(home);
    const fx: Fixture = {
        root,
        home,
        origin: path.join(root, 'origin.git'),
        clone: path.join(root, 'components', 'erp-integration'),
        upstream: path.join(root, 'upstream'),
    };
    fs.mkdirSync(fx.origin);
    git(fx, fx.origin, 'init', '-q', '--bare', '-b', 'main');
    fs.mkdirSync(fx.upstream);
    git(fx, fx.upstream, 'init', '-q', '-b', 'main');
    write(fx.upstream, 'app.commerce.config.ts', 'version 0.1.0\n');
    write(fx.upstream, 'package-lock.json', '{"lock":1}\n');
    write(fx.upstream, 'src/commerce-extensibility-1/.generated/app.commerce.manifest.json', '{"v":"0.1.0"}\n');
    write(fx.upstream, 'src/commerce-extensibility-1/ext.config.yaml', 'hooks: {}\n');
    // A standalone app's root config; the deploy path rewrites it to isolate the
    // app's Runtime packages, so every deployed ERP clone carries a changed one.
    write(fx.upstream, 'app.config.yaml', 'application:\n  web: no-static-site\n');
    git(fx, fx.upstream, 'add', '-A');
    git(fx, fx.upstream, 'commit', '-q', '-m', 'first');
    git(fx, fx.upstream, 'remote', 'add', 'origin', fx.origin);
    git(fx, fx.upstream, 'push', '-q', 'origin', 'main');
    fs.mkdirSync(path.dirname(fx.clone), { recursive: true });
    execFileSync('git', ['clone', '-q', '-b', 'main', fx.origin, fx.clone], { env: gitEnv(home) });
    return fx;
}

/** A new commit on origin's main. */
function publish(fx: Fixture, content = 'version 0.2.0\n'): string {
    write(fx.upstream, 'app.commerce.config.ts', content);
    git(fx, fx.upstream, 'commit', '-q', '-am', 'next');
    git(fx, fx.upstream, 'push', '-q', 'origin', 'main');
    return git(fx, fx.upstream, 'rev-parse', 'HEAD');
}

function realGit(fx: Fixture): jest.MockedFunction<GitRunner> {
    return jest.fn(async (command: string, cwd: string) => {
        if (!command.startsWith('git ')) throw new Error(`not a git command: ${command}`);
        const run = spawnSync('/bin/bash', ['-c', command], { cwd, env: gitEnv(fx.home), encoding: 'utf8' });
        return { code: run.status, stdout: run.stdout, stderr: run.stderr };
    });
}

describe('fastForwardClone', () => {
    let fx: Fixture;

    beforeEach(() => {
        fx = buildFixture();
    });
    afterEach(() => {
        fs.rmSync(fx.root, { recursive: true, force: true });
    });

    it('moves a clone that is behind to the branch head and names both commits', async () => {
        const from = git(fx, fx.clone, 'rev-parse', 'HEAD');
        const to = publish(fx);

        const result = await fastForwardClone(fx.clone, 'main', realGit(fx));

        expect(result).toEqual({
            status: 'updated',
            detail: `Updated the integration from ${from.slice(0, 7)} to ${to.slice(0, 7)}.`,
            from,
            to,
        });
        expect(git(fx, fx.clone, 'rev-parse', 'HEAD')).toBe(to);
        expect(fs.readFileSync(path.join(fx.clone, 'app.commerce.config.ts'), 'utf8')).toBe('version 0.2.0\n');
    }, REAL_GIT_TIMEOUT_MS);

    it('says an up-to-date clone is current and changes nothing', async () => {
        const head = git(fx, fx.clone, 'rev-parse', 'HEAD');
        const run = realGit(fx);

        const result = await fastForwardClone(fx.clone, 'main', run);

        expect(result).toEqual({
            status: 'current',
            detail: 'The integration is already up to date.',
            from: head,
            to: head,
        });
        expect(run.mock.calls.map(([command]) => command)).not.toContain('git merge --ff-only FETCH_HEAD');
    }, REAL_GIT_TIMEOUT_MS);

    it("refuses a clone holding the SC's own edits, names them, and leaves them alone", async () => {
        publish(fx);
        write(fx.clone, 'app.commerce.config.ts', 'the SC changed this\n');
        const head = git(fx, fx.clone, 'rev-parse', 'HEAD');

        const result = await fastForwardClone(fx.clone, 'main', realGit(fx));

        expect(result).toEqual({
            status: 'refused',
            detail: 'The integration folder has changes of its own (app.commerce.config.ts). Commit or undo them, then update again.',
        });
        expect(git(fx, fx.clone, 'rev-parse', 'HEAD')).toBe(head);
        expect(fs.readFileSync(path.join(fx.clone, 'app.commerce.config.ts'), 'utf8')).toBe('the SC changed this\n');
    }, REAL_GIT_TIMEOUT_MS);

    it('puts back the files the tooling rewrites, then updates', async () => {
        const to = publish(fx);
        write(fx.clone, 'package-lock.json', '{"lock":"npm rewrote this"}\n');
        write(fx.clone, 'src/commerce-extensibility-1/.generated/app.commerce.manifest.json', '{"v":"regenerated"}\n');
        write(fx.clone, 'src/commerce-extensibility-1/ext.config.yaml', 'hooks: {regenerated: true}\n');
        // What `appConfigPackages` leaves behind: the same YAML re-serialised,
        // comments gone. Found on a live update of the Bodea ERP (2026-09-17),
        // where it refused as "changes of its own" — our edit, blamed on the SC.
        write(fx.clone, 'app.config.yaml', 'application:\n  web: no-static-site\n  # comments dropped\n');

        const result = await fastForwardClone(fx.clone, 'main', realGit(fx));

        expect(result.status).toBe('updated');
        expect(git(fx, fx.clone, 'rev-parse', 'HEAD')).toBe(to);
        expect(git(fx, fx.clone, 'status', '--porcelain', '--untracked-files=no')).toBe('');
    }, REAL_GIT_TIMEOUT_MS);

    it('names at most five edited files', async () => {
        for (const name of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
            write(fx.upstream, `${name}.js`, 'x\n');
        }
        git(fx, fx.upstream, 'add', '-A');
        git(fx, fx.upstream, 'commit', '-q', '-m', 'files');
        git(fx, fx.upstream, 'push', '-q', 'origin', 'main');
        git(fx, fx.clone, 'pull', '-q', 'origin', 'main');
        for (const name of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
            write(fx.clone, `${name}.js`, 'edited\n');
        }

        const result = await fastForwardClone(fx.clone, 'main', realGit(fx));

        expect(result.detail).toBe(
            'The integration folder has changes of its own (a.js, b.js, c.js, d.js, e.js and 2 more). Commit or undo them, then update again.',
        );
    }, REAL_GIT_TIMEOUT_MS);

    it('lets files git does not track stay where they are', async () => {
        const to = publish(fx);
        write(fx.clone, '.node-version', '24\n');

        const result = await fastForwardClone(fx.clone, 'main', realGit(fx));

        expect(result.status).toBe('updated');
        expect(git(fx, fx.clone, 'rev-parse', 'HEAD')).toBe(to);
        expect(fs.existsSync(path.join(fx.clone, '.node-version'))).toBe(true);
    }, REAL_GIT_TIMEOUT_MS);

    it('refuses a clone with a commit of its own when the branch has nothing new', async () => {
        write(fx.clone, 'local.txt', 'mine\n');
        git(fx, fx.clone, 'add', '-A');
        git(fx, fx.clone, 'commit', '-q', '-m', 'local');
        const head = git(fx, fx.clone, 'rev-parse', 'HEAD');

        const result = await fastForwardClone(fx.clone, 'main', realGit(fx));

        expect(result.status).toBe('refused');
        expect(result.detail).toBe(
            'The integration folder has commits that main on GitHub does not, so it cannot be updated in place.',
        );
        expect(git(fx, fx.clone, 'rev-parse', 'HEAD')).toBe(head);
    }, REAL_GIT_TIMEOUT_MS);

    it('refuses a clone that has moved away from the branch', async () => {
        publish(fx);
        write(fx.clone, 'local.txt', 'mine\n');
        git(fx, fx.clone, 'add', '-A');
        git(fx, fx.clone, 'commit', '-q', '-m', 'local');
        const head = git(fx, fx.clone, 'rev-parse', 'HEAD');

        const result = await fastForwardClone(fx.clone, 'main', realGit(fx));

        expect(result.status).toBe('refused');
        expect(git(fx, fx.clone, 'rev-parse', 'HEAD')).toBe(head);
    }, REAL_GIT_TIMEOUT_MS);

    it("fails with git's reason when the branch does not exist", async () => {
        const result = await fastForwardClone(fx.clone, 'no-such-branch', realGit(fx));

        expect(result.status).toBe('failed');
        expect(result.detail).toMatch(/^Could not fetch no-such-branch from GitHub: .*no-such-branch/);
    }, REAL_GIT_TIMEOUT_MS);

    it.each(['-bad', 'main;rm -rf ~', 'a..b', 'x y', '$(id)'])(
        'refuses the branch name %j without running git',
        async (branch) => {
            const run = realGit(fx);

            const result = await fastForwardClone(fx.clone, branch, run);

            expect(result).toEqual({
                status: 'failed',
                detail: `The branch name "${branch}" cannot be used.`,
            });
            expect(run).not.toHaveBeenCalled();
        },
    );

    it('fails when the folder is not a git clone', async () => {
        const plain = path.join(fx.root, 'plain');
        fs.mkdirSync(plain);

        const result = await fastForwardClone(plain, 'main', realGit(fx));

        expect(result.status).toBe('failed');
        expect(result.detail).toMatch(/^Could not read the integration folder: /);
    }, REAL_GIT_TIMEOUT_MS);
});

describe('checkCloneForUpdate', () => {
    let fx: Fixture;

    beforeEach(() => {
        fx = buildFixture();
    });
    afterEach(() => {
        fs.rmSync(fx.root, { recursive: true, force: true });
    });

    it('says an update is available when the branch has moved, and moves nothing', async () => {
        const head = git(fx, fx.clone, 'rev-parse', 'HEAD');
        const to = publish(fx);

        const result = await checkCloneForUpdate(fx.clone, 'main', realGit(fx));

        expect(result).toEqual({ status: 'available', to });
        expect(git(fx, fx.clone, 'rev-parse', 'HEAD')).toBe(head);
        expect(fs.readFileSync(path.join(fx.clone, 'app.commerce.config.ts'), 'utf8')).toBe('version 0.1.0\n');
    }, REAL_GIT_TIMEOUT_MS);

    it('says current when the clone is at the branch head', async () => {
        const head = git(fx, fx.clone, 'rev-parse', 'HEAD');

        await expect(checkCloneForUpdate(fx.clone, 'main', realGit(fx))).resolves.toEqual({
            status: 'current',
            to: head,
        });
    }, REAL_GIT_TIMEOUT_MS);

    it('says current for a clone with commits of its own, which an update would refuse', async () => {
        write(fx.clone, 'local.txt', 'mine\n');
        git(fx, fx.clone, 'add', '-A');
        git(fx, fx.clone, 'commit', '-q', '-m', 'local');

        const result = await checkCloneForUpdate(fx.clone, 'main', realGit(fx));

        expect(result.status).toBe('current');
    }, REAL_GIT_TIMEOUT_MS);

    it('ignores edits in the folder: they do not decide whether the branch moved', async () => {
        publish(fx);
        write(fx.clone, 'app.commerce.config.ts', 'the SC changed this\n');

        const result = await checkCloneForUpdate(fx.clone, 'main', realGit(fx));

        expect(result.status).toBe('available');
        expect(fs.readFileSync(path.join(fx.clone, 'app.commerce.config.ts'), 'utf8')).toBe('the SC changed this\n');
    }, REAL_GIT_TIMEOUT_MS);

    it("answers unknown with git's reason when the branch cannot be fetched", async () => {
        const result = await checkCloneForUpdate(fx.clone, 'no-such-branch', realGit(fx));

        expect(result.status).toBe('unknown');
        expect(result.detail).toMatch(/^Could not fetch no-such-branch from GitHub: /);
    }, REAL_GIT_TIMEOUT_MS);

    it('refuses an unsafe branch name without running git', async () => {
        const run = realGit(fx);

        await expect(checkCloneForUpdate(fx.clone, '-bad', run)).resolves.toEqual({
            status: 'unknown',
            detail: 'The branch name "-bad" cannot be used.',
        });
        expect(run).not.toHaveBeenCalled();
    });
});
