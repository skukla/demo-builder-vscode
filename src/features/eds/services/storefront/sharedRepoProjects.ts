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
