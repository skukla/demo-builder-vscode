/**
 * The storefront identity guard: is this project the one whose storefront is
 * being set up? Storefront setup and the creation-time pre-warm ask it before
 * reading a project's Commerce scope, because the wizard's "current project"
 * may be a different one.
 *
 * @module features/eds/services/storefrontIdentityGuard
 */

import type { Project } from '@/types/base';

/**
 * Is this project the one whose storefront is being set up?
 *
 * `storefront-setup-start` is registered by BOTH the wizard
 * (`ProjectCreationHandlerRegistry`) and the dashboard (`edsHandlers`). In the
 * wizard the project being created does not exist yet, so a `getCurrentProject()`
 * read there returns WHATEVER WAS LAST OPEN — and prewarm would then enumerate
 * that other project's Commerce scope and publish its product paths onto this
 * site. `configureHandlers.ts:91-95` documents the same hazard for the same call.
 *
 * Measured 2026-08-18: a colleague with one existing project created a second
 * storefront, prewarm ran against the FIRST project's store view, and the run
 * reported `No index was found for this request` — a truthful answer about a
 * scope nobody wanted. On a machine with zero projects the same code skipped
 * prewarm entirely and looked clean, which is why it read as a per-person issue.
 *
 * Fails CLOSED: no project, or no recorded repo, means we cannot prove identity,
 * and prewarming the wrong catalog is worse than not prewarming at all.
 *
 * @param project - The project the caller believes owns this storefront
 * @param repoOwner - GitHub owner of the storefront being set up
 * @param repoName - GitHub repo of the storefront being set up
 * @returns True only when the project's recorded storefront repo matches
 */
export function projectTargetsStorefront(
    project: Project | undefined,
    repoOwner: string,
    repoName: string,
): boolean {
    const recorded = project?.componentInstances?.['eds-storefront']?.metadata?.githubRepo;
    if (typeof recorded !== 'string') {
        return false;
    }
    const [owner, name, ...rest] = recorded.split('/');
    if (!owner || !name || rest.length > 0) {
        return false;
    }
    // GitHub treats owner and repo case-insensitively; so must this.
    return (
        owner.toLowerCase() === repoOwner.toLowerCase() &&
        name.toLowerCase() === repoName.toLowerCase()
    );
}
