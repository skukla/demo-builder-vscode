/**
 * Install a block library an EXISTING storefront has selected but never
 * received (EDS-28).
 *
 * Selecting a library on a project that already exists — `configure_project`,
 * or the settings UI — only records the id in `selectedBlockLibraries`. Until
 * this module, the block files reached the storefront repository at creation or
 * at a full reset and nowhere else, and the update check walked only
 * `installedBlockLibraries`, so the selection was never acted on.
 *
 * Two halves, both UI-free:
 *  - `findUninstalledBlockLibraries` — what is selected and not yet installed.
 *    Pure: it reads the project and the bundled catalog, no network.
 *  - `applyBlockLibraryInstall` — copies the blocks through the SAME installer
 *    updates use (`installBlockLibraryFiles` → `installBlockCollections`) and
 *    writes the record creation would have written (`toInstalledBlockLibrary`).
 *
 * `demoBuilder.blockLibraries.syncBehavior` does not gate an install. That
 * setting decides whether an UPDATE may replace block files the SC may have
 * edited; an install only adds block folders that are not there yet, so there
 * is nothing of the SC's for it to protect.
 */

import { getLatestBranchCommit } from './githubApiClient';
import { installBlockLibraryFiles, type UpdateContext } from './updateCore';
import { COMPONENT_IDS } from '@/core/constants';
import {
    getBlockLibraryName,
    getBlockLibrarySource,
    isBlockLibraryAvailableForPackage,
} from '@/features/components/services/blockLibraryLoader';
import type { BlockLibraryEntry } from '@/features/eds/services/blockCollectionHelpers';
import { toInstalledBlockLibrary } from '@/features/eds/services/installedBlockLibraryRecord';
import type { Project } from '@/types/base';
import type { AddonSource } from '@/types/demoPackages';

/** One library to install into one project's storefront. */
export interface BlockLibraryInstallTarget {
    project: Project;
    library: BlockLibraryEntry;
}

/** What an install did, in the terms both surfaces report. */
interface BlockLibraryInstallOutcome {
    name: string;
    /** Block folders added to the storefront; empty when every one already existed. */
    blockIds: string[];
}

function sameRepo(a: AddonSource, b: { owner?: string; repo?: string }): boolean {
    return (
        a.owner.toLowerCase() === b.owner?.toLowerCase() &&
        a.repo.toLowerCase() === b.repo?.toLowerCase()
    );
}

/** Catalog ids → entries, with the same package filter creation and reset apply. */
function selectedLibraryEntries(project: Project): BlockLibraryEntry[] {
    const packageId = project.selectedPackage ?? '';
    const entries: BlockLibraryEntry[] = [];
    for (const libraryId of project.selectedBlockLibraries ?? []) {
        if (!isBlockLibraryAvailableForPackage(libraryId, packageId)) continue;
        const source = getBlockLibrarySource(libraryId);
        if (source) entries.push({ source, name: getBlockLibraryName(libraryId) });
    }
    for (const lib of project.customBlockLibraries ?? []) {
        if (lib.source?.owner && lib.source.repo && lib.source.branch) {
            entries.push({ source: lib.source, name: lib.name });
        }
    }
    return entries;
}

/**
 * The libraries this project has selected that its storefront does not have.
 *
 * Empty unless the project has an EDS storefront with a GitHub repository —
 * there is nowhere else to install to. A library is left out when it is already
 * recorded (matched by source repository, or by name), or when its source IS
 * the storefront's own template: those blocks arrived with the template and
 * creation records nothing for them either.
 */
export function findUninstalledBlockLibraries(project: Project): BlockLibraryEntry[] {
    const metadata = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata;
    const githubRepo = metadata?.githubRepo;
    if (typeof githubRepo !== 'string' || !githubRepo.includes('/')) return [];

    const template = {
        owner: typeof metadata?.templateOwner === 'string' ? metadata.templateOwner : undefined,
        repo: typeof metadata?.templateRepo === 'string' ? metadata.templateRepo : undefined,
    };
    const installed = project.installedBlockLibraries ?? [];

    return selectedLibraryEntries(project).filter((entry) => {
        if (sameRepo(entry.source, template)) return false;
        return !installed.some(
            (lib) => lib.name === entry.name || (lib.source && sameRepo(entry.source, lib.source)),
        );
    });
}

/** The line both surfaces show for a pending install: "Demo Builder Blocks: install". */
export function describePendingInstall(library: BlockLibraryEntry): string {
    return `${library.name}: install`;
}

/**
 * The line both surfaces show after an install ran: one short sentence. Which blocks it
 * added go to the log, not the notification.
 */
export function describeInstallOutcome(outcome: BlockLibraryInstallOutcome, projectName: string): string {
    const count = outcome.blockIds.length;
    if (count === 0) {
        return `${outcome.name} is already in ${projectName}.`;
    }
    return `Added ${count} block${count === 1 ? '' : 's'} from ${outcome.name} to ${projectName}.`;
}

/**
 * Install one selected library into the project's storefront repository and
 * record it in `installedBlockLibraries`.
 *
 * This WRITES to the SC's GitHub repository (one commit on `main`), so it runs
 * only from an explicit apply — the picked QuickPick row, or `apply_updates`
 * with `confirm:true`.
 *
 * When every block already exists in the storefront the installer writes
 * nothing and reports no version. The library is still recorded, with no block
 * ids, at the source's current commit: it is selected and there is nothing left
 * to add, and without a record the check would offer the same install forever.
 */
export async function applyBlockLibraryInstall(
    item: BlockLibraryInstallTarget,
    ctx: UpdateContext,
): Promise<BlockLibraryInstallOutcome> {
    const { project, library } = item;
    const result = await installBlockLibraryFiles(item, ctx);

    const version = result.libraryVersions?.[0] ?? (await versionWithNoBlocks(library, ctx));
    const record = toInstalledBlockLibrary(version);

    const previous = project.installedBlockLibraries;
    project.installedBlockLibraries = [...(previous ?? []), record];
    try {
        await ctx.stateManager.saveProject(project);
    } catch (error) {
        // The files are in the repository; only the record failed. Restore the
        // in-memory list so a retry re-runs (the installer skips what exists).
        project.installedBlockLibraries = previous;
        throw error;
    }

    ctx.logger.info(
        `[Updates] ${describeInstallOutcome(record, project.name)}` +
            (record.blockIds.length ? ` (${record.blockIds.join(', ')})` : ''),
    );
    return { name: record.name, blockIds: record.blockIds };
}

async function versionWithNoBlocks(
    library: BlockLibraryEntry,
    ctx: UpdateContext,
): Promise<{ name: string; source: AddonSource; commitSha: string; blockIds: string[] }> {
    const { owner, repo, branch } = library.source;
    const commitSha = await getLatestBranchCommit(ctx.secrets, owner, repo, branch);
    if (!commitSha) {
        throw new Error(`Could not read the latest commit of ${owner}/${repo}`);
    }
    return { name: library.name, source: library.source, commitSha, blockIds: [] };
}
