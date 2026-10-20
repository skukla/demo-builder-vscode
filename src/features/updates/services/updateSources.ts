/**
 * Small, UI-free helpers the update check and apply share: where a storefront's template
 * comes from, the "N commits behind" wording, and whether a template sync already covered
 * a block library.
 *
 * Moved unchanged on 2026-10-20 (PL-80) from `commands/updateTypes.ts`, which held them
 * beside the picker's QuickPick item types; the picker is gone and the services use them.
 *
 * @module features/updates/services/updateSources
 */

import { COMPONENT_IDS } from '@/core/constants';
import type { Project } from '@/types/base';
import type { InstalledBlockLibrary } from '@/types/blockLibraries';

/** Format a "N commits behind" / "update available" label. */
export function formatBehindLabel(count: number): string {
    if (count <= 0) return 'update available';
    return `${count} commit${count !== 1 ? 's' : ''} behind`;
}

/**
 * Extract template source owner/repo from a project's EDS storefront metadata.
 * Returns null if the project has no EDS component or metadata.
 */
export function getTemplateSource(
    project: Project,
): { owner: string; repo: string; branch?: string } | null {
    const edsMetadata = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]
        ?.metadata as Record<string, unknown> | undefined;
    const owner = edsMetadata?.templateOwner as string | undefined;
    const repo = edsMetadata?.templateRepo as string | undefined;
    if (!owner || !repo) return null;
    // An added demo's branch, recorded at creation; a shipped template is on main.
    const branch = edsMetadata?.templateBranch;
    return { owner, repo, ...(typeof branch === 'string' ? { branch } : {}) };
}

/**
 * Determine if a block library update should be skipped because the
 * template sync already covered the same source repository.
 */
export function shouldSkipBlockLibrary(
    library: InstalledBlockLibrary,
    project: Project,
    templateSyncSucceeded: Set<string>,
): boolean {
    if (!templateSyncSucceeded.has(project.path)) return false;
    const source = getTemplateSource(project);
    if (!source) return false;
    return library.source.owner === source.owner && library.source.repo === source.repo;
}
