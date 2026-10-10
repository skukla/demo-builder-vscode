/**
 * The home Chat's git-sync hook, RUN rather than read.
 *
 * The string tests beside this one (`claudeSettingsWriter.test.ts`) check that the
 * command contains each guard. They could not see what the guards let through: a
 * headless storefront or a mesh is a git clone under the projects root whose
 * `origin` is its SOURCE (a shared repository such as skukla/citisignal-nextjs or
 * a colleague's), so an agent edit there committed and pushed to that source with
 * no confirmation (found 2026-09-15, headless-storefront-repository research).
 *
 * Each case builds real repositories in a temp root, each with a local bare
 * repository as `origin`, pipes the PostToolUse payload Claude Code sends into
 * the generated command, and reads the bare repository to see whether a push
 * landed. Nothing leaves the machine.
 */

import { execFileSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildHomeGitSyncCommand } from '@/features/project-creation/services/aiBundle/claudeSettingsWriter';

/**
 * The environment every git command here runs with: this process's, WITHOUT any
 * `GIT_*` variable. A git hook exports `GIT_DIR` (and friends) pointing at the real
 * repository, and the pre-push gate runs this suite from inside one; inherited,
 * those send `git init`, `add -A` and `commit` in a temp folder into the real
 * repository instead. That happened on 2026-09-15: a pre-push run committed a
 * tree deleting every file onto the branch and set `core.bare = true` on the
 * shared config. The CONTROL at the bottom replays that environment.
 */
const GIT_ENV = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
    GIT_AUTHOR_NAME: 'test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
};

function git(cwd: string, ...args: string[]): string {
    return execFileSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8' }).trim();
}

/** A repository at `dir` with one commit, pushed to a new bare `origin`. Returns the bare path. */
function repoWithOrigin(root: string, dir: string): string {
    const bare = path.join(root, '..', `${path.basename(dir)}-${Date.now()}-origin.git`);
    execFileSync('git', ['init', '--bare', '-q', bare], { env: GIT_ENV });
    fs.mkdirSync(dir, { recursive: true });
    git(dir, 'init', '-q', '-b', 'main');
    fs.writeFileSync(path.join(dir, 'README.md'), 'start\n');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'start');
    git(dir, 'remote', 'add', 'origin', bare);
    git(dir, 'push', '-q', '-u', 'origin', 'main');
    return bare;
}

/**
 * Edit a file in `dir`, then run the hook with the payload Claude Code sends for
 * that edit. The hook's exit code is not the question (a refused push exits
 * non-zero); what reached `origin` is.
 */
function editAndRunHook(root: string, dir: string): void {
    const file = path.join(dir, 'edited.txt');
    fs.writeFileSync(file, 'an agent edit\n');
    const command = buildHomeGitSyncCommand(root, process.execPath);
    expect(command).not.toBe('');
    spawnSync('/bin/sh', ['-c', command], {
        input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: file } }),
        env: GIT_ENV,
    });
}

function commitsIn(bare: string): number {
    return Number(execFileSync('git', ['--git-dir', bare, 'rev-list', '--count', 'main'], { env: GIT_ENV, encoding: 'utf8' }).trim());
}

describe('the home git-sync hook, run against real repositories', () => {
    let root: string;
    let project: string;

    beforeEach(() => {
        // realpath: git answers --show-toplevel with the resolved path, and on macOS
        // the temp directory is behind a symlink.
        const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'home-hook-')));
        root = path.join(base, 'projects');
        project = path.join(root, 'demo');
        fs.mkdirSync(project, { recursive: true });
    });

    function writeManifest(instances: Record<string, { path: string }>): void {
        fs.writeFileSync(path.join(project, '.demo-builder.json'), JSON.stringify({ componentInstances: instances }));
    }

    it("pushes an edit in the project's own Edge Delivery storefront repository", () => {
        const storefront = path.join(project, 'storefront');
        const origin = repoWithOrigin(root, storefront);
        writeManifest({ 'eds-storefront': { path: storefront } });

        editAndRunHook(root, storefront);

        expect(commitsIn(origin)).toBe(2);
    });

    it('never pushes an edit in a headless storefront clone, whose origin is its source', () => {
        const headless = path.join(project, 'headless');
        const origin = repoWithOrigin(root, headless);
        writeManifest({ headless: { path: headless } });

        editAndRunHook(root, headless);

        expect(commitsIn(origin)).toBe(1);
        expect(git(headless, 'status', '--porcelain')).toContain('edited.txt');
    });

    it("never pushes an edit in another clone of a project that has an Edge Delivery storefront (a mesh, an app)", () => {
        const storefront = path.join(project, 'storefront');
        const mesh = path.join(project, 'commerce-mesh');
        repoWithOrigin(root, storefront);
        const meshOrigin = repoWithOrigin(root, mesh);
        writeManifest({ 'eds-storefront': { path: storefront }, 'headless-commerce-mesh': { path: mesh } });

        editAndRunHook(root, mesh);

        expect(commitsIn(meshOrigin)).toBe(1);
    });

    it('pushes nothing when the project has no manifest to say which repository is its own', () => {
        const storefront = path.join(project, 'storefront');
        const origin = repoWithOrigin(root, storefront);

        editAndRunHook(root, storefront);

        expect(commitsIn(origin)).toBe(1);
    });
});

describe('CONTROL: run from inside a git hook, the suite cannot touch the repository the hook belongs to', () => {
    it('ignores a GIT_DIR, GIT_WORK_TREE and GIT_INDEX_FILE pointing at another repository', () => {
        const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'home-hook-control-')));
        const outer = path.join(base, 'outer');
        fs.mkdirSync(outer);
        execFileSync('git', ['init', '-q', '-b', 'main', outer], { env: GIT_ENV });
        fs.writeFileSync(path.join(outer, 'keep.txt'), 'keep\n');
        execFileSync('git', ['-C', outer, 'add', '-A'], { env: GIT_ENV });
        execFileSync('git', ['-C', outer, 'commit', '-q', '-m', 'outer'], { env: GIT_ENV });
        const before = execFileSync('git', ['-C', outer, 'rev-parse', 'HEAD'], { env: GIT_ENV, encoding: 'utf8' });

        const saved = { GIT_DIR: process.env.GIT_DIR, GIT_WORK_TREE: process.env.GIT_WORK_TREE, GIT_INDEX_FILE: process.env.GIT_INDEX_FILE };
        process.env.GIT_DIR = path.join(outer, '.git');
        process.env.GIT_WORK_TREE = outer;
        process.env.GIT_INDEX_FILE = path.join(outer, '.git', 'index');
        try {
            // The module-level GIT_ENV was built before these were set, so build the
            // same filter again here, the way a suite started inside a hook would.
            const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
            expect(Object.keys(inherited).some((key) => key.startsWith('GIT_'))).toBe(false);
            const scratch = path.join(base, 'scratch');
            fs.mkdirSync(scratch);
            execFileSync('git', ['init', '-q', '-b', 'main', scratch], { env: { ...inherited } });
            fs.writeFileSync(path.join(scratch, 'x.txt'), 'x\n');
            execFileSync('git', ['-C', scratch, 'add', '-A'], { env: { ...inherited } });
        } finally {
            for (const [key, value] of Object.entries(saved)) {
                if (value === undefined) delete process.env[key];
                else process.env[key] = value;
            }
        }

        const after = execFileSync('git', ['-C', outer, 'rev-parse', 'HEAD'], { env: GIT_ENV, encoding: 'utf8' });
        expect(after).toBe(before);
        expect(execFileSync('git', ['-C', outer, 'config', '--get', 'core.bare'], { env: GIT_ENV, encoding: 'utf8' }).trim()).toBe('false');
        expect(execFileSync('git', ['-C', outer, 'status', '--porcelain'], { env: GIT_ENV, encoding: 'utf8' })).toBe('');
    });
});
