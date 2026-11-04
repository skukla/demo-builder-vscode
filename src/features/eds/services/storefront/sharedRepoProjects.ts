/**
 * Which other local projects publish to a GitHub repository (EDS-26).
 *
 * A Helix site is keyed by the GitHub owner/repo, so two projects on one repository
 * share one set of published pages. Removing the product pages for one of them would
 * take the other's down — so the removal asks here first, and refuses when the answer
 * is not empty (`productPageRemoval.ts`).
 *
 * Only projects on THIS machine can be seen; a colleague's project on the same
 * repository cannot.
 *
 * @module features/eds/services/storefront/sharedRepoProjects
 */

import { getLinkedEdsProjects } from '@/features/eds/services/resourceCleanupHelpers';
import type { StateManager } from '@/types/state';

/**
 * @param stateManager - where the local projects are read from (never saved)
 * @param githubRepo - `owner/repo`
 * @param exceptProjectPath - the project being reset or deleted, which does not count
 * @returns the names of the other local projects whose storefront is that repository
 */
export async function otherProjectsPublishingTo(
    stateManager: StateManager,
    githubRepo: string,
    exceptProjectPath?: string,
): Promise<string[]> {
    const wanted = githubRepo.toLowerCase();
    return (await getLinkedEdsProjects(stateManager))
        .filter((p) => p.path !== exceptProjectPath && p.metadata.githubRepo?.toLowerCase() === wanted)
        .map((p) => p.name);
}

/**
 * The same question for an action on a SITE rather than on a project (the agent's
 * `cleanup_dalive_site`): one local project on the repository is that site's own, so it
 * does not stand in the way; two or more means the product pages cannot be removed for
 * one without the other.
 *
 * @param stateManager - where the local projects are read from (never saved)
 * @param githubRepo - `owner/repo`
 * @returns the projects sharing the repository, or none when at most one uses it
 */
export async function projectsSharingRepo(stateManager: StateManager, githubRepo: string): Promise<string[]> {
    const onRepo = await otherProjectsPublishingTo(stateManager, githubRepo);
    return onRepo.length > 1 ? onRepo : [];
}

/** Which local projects, beyond those being deleted, also use a project's repository and its site. */
export interface SharedOnline {
    repo: string[];
    site: string[];
}

/**
 * What a delete must not take: the repository or the DA.live site another local project still
 * uses (owner, 2026-11-04). Only product pages were protected before; deleting the repository or
 * the site took a second project's storefront down with it.
 *
 * @param stateManager - where the local projects are read from (never saved)
 * @param metadata - the project's storefront, as `extractEdsMetadata` reads it
 * @param going - every project being deleted, the one asked about included: none of them counts
 * @returns the other projects' names, per resource
 */
export async function sharedOnlineOf(
    stateManager: StateManager,
    metadata: { githubRepo?: string; daLiveOrg?: string; daLiveSite?: string } | null,
    going: readonly string[],
): Promise<SharedOnline> {
    if (!metadata) return { repo: [], site: [] };
    const same = (a?: string, b?: string): boolean => !!a && !!b && a.toLowerCase() === b.toLowerCase();
    const others = (await getLinkedEdsProjects(stateManager)).filter((p) => !going.includes(p.path));
    return {
        repo: others.filter((p) => same(p.metadata.githubRepo, metadata.githubRepo)).map((p) => p.name),
        site: others
            .filter((p) => same(p.metadata.daLiveOrg, metadata.daLiveOrg) && same(p.metadata.daLiveSite, metadata.daLiveSite))
            .map((p) => p.name),
    };
}
