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

import {
    checkCloneForUpdate,
    fastForwardClone,
    readCloneCommit,
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

/** Whether there is newer code to move to. Changes nothing the SC can see. */
export async function checkComponentSource(
    componentPath: string,
    branch: string,
    run: GitRunner,
    readRelease: ComponentReleaseReader,
): Promise<UpdateCheckResult> {
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
): Promise<SourceUpdateResult> {
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
