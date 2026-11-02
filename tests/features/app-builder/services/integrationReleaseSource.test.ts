/**
 * Which code an update of a component moves to: the newest release of a repository the builder
 * owns, or the branch of anyone else's. Driven with REAL git, because what is being tested is how
 * git treats a tag: an annotated tag names a tag object rather than a commit, which a fake
 * would answer however it was told to.
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
    checkComponentSource,
    updateComponentSource,
    type ComponentRelease,
} from '@/features/app-builder/services/integrationReleaseSource';
import type { GitRunner } from '@/features/app-builder/services/integrationSourceUpdate';

/** The pre-push gate runs jest with GIT_DIR set; a test's git must not inherit it. */
function cleanEnv(): NodeJS.ProcessEnv {
    return Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
}

function git(command: string, cwd: string): string {
    return execSync(`git ${command}`, { cwd, env: cleanEnv(), stdio: 'pipe' }).toString().trim();
}

const run: GitRunner = async (command, cwd) => {
    try {
        const stdout = execSync(command, { cwd, env: cleanEnv(), stdio: 'pipe' }).toString();
        return { code: 0, stdout, stderr: '' };
    } catch (error) {
        const failure = error as { status?: number; stderr?: Buffer };
        return { code: failure.status ?? 1, stdout: '', stderr: failure.stderr?.toString() ?? '' };
    }
};

const RELEASED_URL = 'https://github.com/skukla/demo-erp.git';
const FOREIGN_URL = 'https://github.com/adobe/commerce-integration-starter-kit.git';

let root: string;
let upstream: string;
let clone: string;

function commit(name: string): string {
    writeFileSync(join(upstream, name), name);
    git('add .', upstream);
    git(`-c user.name=t -c user.email=t@example.com commit -q -m ${name}`, upstream);
    return git('rev-parse HEAD', upstream);
}

/** Point the clone at a local upstream while its remote URL reads as `url`. */
function cloneAs(url: string): void {
    git(`clone -q "${upstream}" "${clone}"`, root);
    git(`config url."${upstream}".insteadOf ${url}`, clone);
    git(`remote set-url origin ${url}`, clone);
}

const release = (tag: string): ComponentRelease => ({ tag, version: tag.replace(/^v/, '') });
const reads = (found: ComponentRelease | null) => jest.fn(async () => found);

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'release-source-'));
    upstream = join(root, 'upstream');
    clone = join(root, 'clone');
    git(`init -q -b main "${upstream}"`, root);
    commit('one');
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('a repository the builder owns', () => {
    it('a push with no release offers nothing, and moves nothing', async () => {
        cloneAs(RELEASED_URL);
        const before = git('rev-parse HEAD', clone);
        commit('pushed-to-main');

        const checked = await checkComponentSource(clone, 'main', run, reads(null));
        const updated = await updateComponentSource(clone, 'main', run, reads(null));

        expect(checked).toMatchObject({ status: 'current', from: before, to: before });
        expect(updated).toMatchObject({ status: 'current', from: before, to: before });
        expect(git('rev-parse HEAD', clone)).toBe(before);
    });

    it('asks about the repository the clone came from', async () => {
        cloneAs(RELEASED_URL);
        const read = reads(null);

        await checkComponentSource(clone, 'main', run, read);

        expect(read).toHaveBeenCalledWith('skukla/demo-erp');
    });

    it('a new release is offered with its version, and pushes past it are not taken', async () => {
        cloneAs(RELEASED_URL);
        const tagged = commit('released');
        git('tag v1.1.0', upstream);
        commit('pushed-after-the-release');

        const checked = await checkComponentSource(clone, 'main', run, reads(release('v1.1.0')));
        const updated = await updateComponentSource(clone, 'main', run, reads(release('v1.1.0')));

        expect(checked).toMatchObject({ status: 'available', to: tagged, version: '1.1.0' });
        expect(updated).toMatchObject({
            status: 'updated',
            to: tagged,
            version: '1.1.0',
            detail: 'Updated to version 1.1.0.',
        });
        expect(git('rev-parse HEAD', clone)).toBe(tagged);
    });

    // An annotated tag names a tag object. Read as a commit, it never equals HEAD, so a clone
    // sitting exactly on the release would be offered it forever.
    it('a clone already on an annotated release is current', async () => {
        const tagged = commit('released');
        git('-c user.name=t -c user.email=t@example.com tag -a v1.1.0 -m v1.1.0', upstream);
        cloneAs(RELEASED_URL);

        const checked = await checkComponentSource(clone, 'main', run, reads(release('v1.1.0')));

        expect(checked).toMatchObject({ status: 'current', from: tagged, to: tagged });
    });

    it('a clone ahead of the release is never moved back', async () => {
        commit('released');
        git('tag v1.1.0', upstream);
        commit('newer');
        cloneAs(RELEASED_URL);
        const ahead = git('rev-parse HEAD', clone);

        const checked = await checkComponentSource(clone, 'main', run, reads(release('v1.1.0')));

        expect(checked.status).toBe('current');
        expect(git('rev-parse HEAD', clone)).toBe(ahead);
    });

    it('an SC edit still refuses the update', async () => {
        cloneAs(RELEASED_URL);
        commit('released');
        git('tag v1.1.0', upstream);
        writeFileSync(join(clone, 'one'), 'an edit of their own');

        const updated = await updateComponentSource(clone, 'main', run, reads(release('v1.1.0')));

        expect(updated.status).toBe('refused');
        expect(updated.detail).toContain('one');
    });
});

describe('a repository someone else owns', () => {
    it('follows its branch, and never asks about releases', async () => {
        cloneAs(FOREIGN_URL);
        const head = commit('pushed-to-main');
        const read = reads(release('v9.9.9'));

        const checked = await checkComponentSource(clone, 'main', run, read);
        const updated = await updateComponentSource(clone, 'main', run, read);

        expect(checked).toMatchObject({ status: 'available', to: head });
        expect(updated).toMatchObject({ status: 'updated', to: head });
        expect(read).not.toHaveBeenCalled();
    });
});

/**
 * The old updater replaced a mesh's folder with a release archive, which has no `.git`. With
 * no history the folder can be neither compared nor moved, so it would never be offered
 * anything. It is cloned again, and the old folder is kept, because with no history there is
 * no telling whether a file in it was the SC's own edit.
 */
describe('a folder with no git history', () => {
    let project: string;
    let folder: string;
    let run2: GitRunner;

    beforeEach(() => {
        project = join(root, 'project');
        folder = join(project, 'components', 'eds-accs-mesh');
        mkdirSync(folder, { recursive: true });
        writeFileSync(join(folder, 'one'), 'an edit we cannot recognise');
        writeFileSync(join(folder, '.env'), 'KEPT=1');
        // A clone from GitHub, answered by the local upstream.
        const config = join(root, 'gitconfig');
        writeFileSync(
            config,
            `[url "${upstream}"]\n\tinsteadOf = https://github.com/skukla/eds-accs-mesh.git\n`,
        );
        run2 = async (command, cwd) => {
            try {
                const stdout = execSync(command, {
                    cwd,
                    env: { ...cleanEnv(), GIT_CONFIG_GLOBAL: config },
                    stdio: 'pipe',
                }).toString();
                return { code: 0, stdout, stderr: '' };
            } catch (error) {
                const failure = error as { status?: number; stderr?: Buffer };
                return { code: failure.status ?? 1, stdout: '', stderr: failure.stderr?.toString() ?? '' };
            }
        };
    });

    const URL = 'https://github.com/skukla/eds-accs-mesh';

    it('is offered the newest release', async () => {
        const checked = await checkComponentSource(folder, 'main', run2, reads(release('v1.1.0')), URL);

        expect(checked).toMatchObject({ status: 'available', version: '1.1.0' });
    });

    it('is offered nothing while there is no release', async () => {
        const checked = await checkComponentSource(folder, 'main', run2, reads(null), URL);

        expect(checked.status).toBe('current');
    });

    it('is cloned again at the release, keeping the old folder and the settings', async () => {
        const tagged = commit('released');
        git('tag v1.1.0', upstream);
        commit('pushed-after-the-release');

        const updated = await updateComponentSource(folder, 'main', run2, reads(release('v1.1.0')), URL);

        const kept = join(project, 'component-backups', 'eds-accs-mesh-before-1.1.0');
        expect(updated).toMatchObject({ status: 'updated', to: tagged, version: '1.1.0' });
        expect(updated.detail).toContain(kept);
        expect(git('rev-parse HEAD', folder)).toBe(tagged);
        expect(readFileSync(join(folder, '.env'), 'utf8')).toBe('KEPT=1');
        expect(readFileSync(join(kept, 'one'), 'utf8')).toBe('an edit we cannot recognise');
    });

    it('puts the folder back when the clone fails', async () => {
        const updated = await updateComponentSource(folder, 'main', run2, reads(release('v9.9.9')), URL);

        expect(updated.status).toBe('failed');
        expect(readFileSync(join(folder, 'one'), 'utf8')).toBe('an edit we cannot recognise');
        expect(existsSync(join(project, 'component-backups', 'eds-accs-mesh-before-9.9.9'))).toBe(false);
    });

    it('is left alone when it is not one of our repositories', async () => {
        const read = reads(release('v1.1.0'));
        const foreign = 'https://github.com/adobe/commerce-integration-starter-kit';

        const checked = await checkComponentSource(folder, 'main', run2, read, foreign);

        expect(checked.status).toBe('unknown');
        expect(read).not.toHaveBeenCalled();
    });

    // A project folder can sit inside a repository of its own. Asking git from a folder with
    // no `.git` would then answer about that outer repository.
    it('never reads an outer repository as its own', async () => {
        git(`init -q "${project}"`, root);
        git('remote add origin https://github.com/skukla/demo-erp.git', project);
        const read = reads(release('v1.1.0'));

        await checkComponentSource(folder, 'main', run2, read, URL);

        expect(read).toHaveBeenCalledWith('skukla/eds-accs-mesh');
    });
});
