/**
 * When the storefront report may offer to bring a storefront's code up to date
 * with Demo Builder's template (EDS-13f step 05, decision 6; owner 2026-10-04:
 * "fork sync only for forks").
 *
 * Only a repository GitHub records as a FORK of one of our patched templates, and
 * only while it is behind. A fork shares the template's history, so GitHub's
 * merge-upstream brings the template's changes in and keeps the SC's own commits,
 * and stops on a conflict without changing anything. A repository GENERATED from a
 * template shares no history; the only way to modernise it would overwrite the
 * SC's work, so it is never offered.
 *
 * Pure over the fork status `ForkSyncService.checkForkStatus` answers.
 *
 * @module features/eds/services/storefront/templateCatchUp
 */

import { ourLineage } from './storefrontProvenance';
import type { ForkStatus } from '@/features/updates/services/forkSyncService';
import type { DemoPackage } from '@/types/demoPackages';
import type { RepositoryRef } from '@/types/projectFile';

export interface TemplateCatchUp {
    /** The SC's own repository: the fork that would be merged into. */
    repository: RepositoryRef;
    /** Its default branch, which merge-upstream updates. */
    branch: string;
    /** The template of ours it is a fork of. */
    template: RepositoryRef;
    /** How many of the template's commits it does not have. */
    behindBy: number;
}

/**
 * The offer, or undefined when there is none to make.
 *
 * @param repository - The project's own storefront repository
 * @param status - What GitHub says about it; null when it could not be read
 * @param packages - The catalog; defaults to the bundled one
 * @returns The catch-up to offer, or undefined
 */
export function templateCatchUpOf(
    repository: RepositoryRef,
    status: ForkStatus | null,
    packages?: readonly DemoPackage[],
): TemplateCatchUp | undefined {
    if (!status?.isFork || status.behindBy <= 0 || !status.defaultBranch) return undefined;
    const [owner, repo] = status.parentFullName?.split('/') ?? [];
    if (!owner || !repo) return undefined;
    const match = ourLineage({ lineage: { forkParent: { owner, repo } } }, packages);
    if (match?.by !== 'fork' || !match.template) return undefined;
    return { repository, branch: status.defaultBranch, template: match.template, behindBy: status.behindBy };
}
