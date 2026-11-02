/**
 * Which code an update of a component moves to.
 *
 * A repository the builder owns ships by release, as the extension does: a push to `main`
 * reaches no SC until a release is published. Anyone else's keeps following its branch. The
 * clone's own remote says which it is, so a project holds nothing that has to be migrated, and
 * this works for a project however old.
 *
 * @module features/app-builder/services/integrationReleaseSource
 */

import { promises as fsPromises } from 'fs';
import * as path from 'path';
import {
    checkCloneForUpdate,
    fastForwardClone,
    readCloneCommit,
    unsafeBranch,
    type GitRunner,
    type SourceUpdateResult,
    type UpdateCheckResult,
} from './integrationSourceUpdate';
import { releasedRepoOf } from '@/core/releases/releasedRepos';

/** A published release of a component. */
export interface ComponentRelease {
    tag: string;
    version: string;
}

/** The newest release of `owner/repo` this user's channel accepts, or null. */
export type ComponentReleaseReader = (repo: string) => Promise<ComponentRelease | null>;

type UpdateTarget = { ref: string; release?: ComponentRelease } | { unreleased: true };

/** Settings the deploy reads and that no repository holds. */
const LOCAL_SETTINGS = ['.env', '.env.local'];

async function exists(target: string): Promise<boolean> {
    try {
        await fsPromises.access(target);
        return true;
    } catch {
        return false;
    }
}

/**
 * Whether the folder is a clone of its own. Asked of the disk, not of git: from a folder with
 * no `.git`, git answers about any repository the project sits inside.
 */
const hasOwnHistory = (componentPath: string): Promise<boolean> => exists(path.join(componentPath, '.git'));

async function targetOf(
    componentPath: string,
    branch: string,
    run: GitRunner,
    readRelease: ComponentReleaseReader,
): Promise<UpdateTarget> {
    // The stored address: `git remote get-url` applies the user's own URL rewrites first.
    const origin = await run('git config --get remote.origin.url', componentPath);
    const repo = origin.code === 0 ? releasedRepoOf(origin.stdout) : null;
    if (!repo) return { ref: branch };
    const release = await readRelease(repo);
    return release ? { ref: `refs/tags/${release.tag}`, release } : { unreleased: true };
}

/** A path nothing holds yet: a retry after a failed install must not stop on the earlier copy. */
async function freeBackupPath(backups: string, name: string): Promise<string> {
    let candidate = path.join(backups, name);
    for (let attempt = 2; await exists(candidate); attempt++) {
        candidate = path.join(backups, `${name}-${attempt}`);
    }
    return candidate;
}

/**
 * Clone a folder with no history again at `release`, keeping the old folder beside the
 * project's components (anything inside `components/` would be read as a component). With no
 * history there is no telling whether a file in it was the SC's own edit, so it is never deleted.
 */
async function recloneAtRelease(
    componentPath: string,
    repo: string,
    release: ComponentRelease,
    run: GitRunner,
): Promise<SourceUpdateResult> {
    const refusal = unsafeBranch(release.tag);
    if (refusal) return { status: 'failed', detail: refusal };
    const componentsDir = path.dirname(componentPath);
    const backups = path.join(path.dirname(componentsDir), 'component-backups');
    const kept = await freeBackupPath(backups, `${path.basename(componentPath)}-before-${release.version}`);
    await fsPromises.mkdir(backups, { recursive: true });
    await fsPromises.rename(componentPath, kept);
    const url = `https://github.com/${repo}.git`;
    const cloned = await run(`git clone --branch "${release.tag}" "${url}" "${componentPath}"`, componentsDir);
    if (cloned.code !== 0) {
        await fsPromises.rm(componentPath, { recursive: true, force: true });
        await fsPromises.rename(kept, componentPath);
        return {
            status: 'failed',
            detail: `Could not clone version ${release.version}: ${cloned.stderr.trim() || 'git gave no reason'}.`,
        };
    }
    for (const name of LOCAL_SETTINGS) {
        if (await exists(path.join(kept, name))) {
            await fsPromises.copyFile(path.join(kept, name), path.join(componentPath, name));
        }
    }
    return {
        status: 'updated',
        detail: `Updated to version ${release.version}. The old folder is kept at ${kept}.`,
        to: await readCloneCommit(componentPath, run),
        version: release.version,
    };
}

/** Whether there is newer code to move to. Changes nothing the SC can see. */
export async function checkComponentSource(
    componentPath: string,
    branch: string,
    run: GitRunner,
    readRelease: ComponentReleaseReader,
    repoUrl?: string,
): Promise<UpdateCheckResult> {
    if (!(await hasOwnHistory(componentPath))) {
        const repo = releasedRepoOf(repoUrl);
        if (!repo) return { status: 'unknown', detail: 'This folder has no git history to compare.' };
        const release = await readRelease(repo);
        return release ? { status: 'available', version: release.version } : { status: 'current' };
    }
    const target = await targetOf(componentPath, branch, run, readRelease);
    if ('unreleased' in target) {
        const commit = await readCloneCommit(componentPath, run);
        return { status: 'current', from: commit, to: commit };
    }
    const checked = await checkCloneForUpdate(componentPath, target.ref, run);
    return target.release ? { ...checked, version: target.release.version } : checked;
}

/** Move the clone to that code, keeping what the SC changed safe (`fastForwardClone`). */
export async function updateComponentSource(
    componentPath: string,
    branch: string,
    run: GitRunner,
    readRelease: ComponentReleaseReader,
    repoUrl?: string,
): Promise<SourceUpdateResult> {
    if (!(await hasOwnHistory(componentPath))) {
        const repo = releasedRepoOf(repoUrl);
        const release = repo ? await readRelease(repo) : null;
        return repo && release
            ? recloneAtRelease(componentPath, repo, release, run)
            : { status: 'failed', detail: 'This folder has no git history, and there is no release to replace it with.' };
    }
    const target = await targetOf(componentPath, branch, run, readRelease);
    if ('unreleased' in target) {
        const commit = await readCloneCommit(componentPath, run);
        return {
            status: 'current',
            detail: 'There is no release of this component to update to yet.',
            from: commit,
            to: commit,
        };
    }
    const updated = await fastForwardClone(componentPath, target.ref, run);
    if (!target.release) return updated;
    const { version } = target.release;
    return updated.status === 'updated'
        ? { ...updated, version, detail: `Updated to version ${version}.` }
        : { ...updated, version };
}

/**
 * Move a component that is not deployed to Adobe, such as a Headless storefront, to a release
 * it has been offered. The same rules as any other: an SC's edit refuses it, a folder with no
 * history is cloned again and the old one kept.
 */
export async function moveCloneToRelease(
    componentPath: string,
    repoUrl: string | undefined,
    release: ComponentRelease,
    run: GitRunner,
): Promise<SourceUpdateResult> {
    if (!(await hasOwnHistory(componentPath))) {
        const repo = releasedRepoOf(repoUrl);
        return repo
            ? recloneAtRelease(componentPath, repo, release, run)
            : { status: 'failed', detail: 'This folder has no git history to update.' };
    }
    const updated = await fastForwardClone(componentPath, `refs/tags/${release.tag}`, run);
    return updated.status === 'updated'
        ? { ...updated, version: release.version, detail: `Updated to version ${release.version}.` }
        : { ...updated, version: release.version };
}
