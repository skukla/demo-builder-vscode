/**
 * Remove a block library an EXISTING storefront has but no longer selects
 * (EDS-39) — the mirror of `blockLibraryInstall.ts`.
 *
 * Two halves, both UI-free:
 *  - `findUnselectedInstalledBlockLibraries` — what is installed and no longer
 *    selected. Pure: it reads the project and the bundled catalog, no network.
 *  - `applyBlockLibraryUninstall` — removes what the library added through
 *    `removeBlockLibraryFiles`, takes the removed blocks off the DA.live block
 *    list, and updates the record to exactly what is left.
 *
 * A block the SC edited, or one another selected library also provides, is
 * left in place and named ONCE: it is the SC's own now (or the other library's),
 * so the record lets go of it and no later save offers it again. The record is
 * kept only for blocks that could not be checked because the library could not
 * be read at its commit. That failure may pass, so the next save tries again.
 *
 * Check for Updates does not offer removals and no agent tool does: this is
 * reached only from Configure's save (`configureBlockLibraryWork.ts`).
 */

import { sameRepo } from './blockLibraryInstall';
import { COMPONENT_IDS } from '@/core/constants';
import {
    getBlockLibraryName,
    getBlockLibrarySource,
    getNativeBlockLibraries,
    withAlwaysIncludedBlockLibraries,
} from '@/features/components/services/blockLibraryLoader';
import { getStackById } from '@/features/components/services/demoPackageLoader';
import {
    belongsTo,
    removeBlockLibraryFiles,
    type BlockLibraryRemovalFileOps,
    type BlockLibraryRemovalResult,
    type LeftBlock,
} from '@/features/eds/services/blockLibraryRemoval';
import type { LeftEntry } from '@/features/eds/services/blockLibraryRemovalEntries';
import type { DaLiveBlockLibraryOperations } from '@/features/eds/services/daLive/daLiveBlockLibraryOperations';
import type { Project } from '@/types/base';
import type { AddedComponentEntries, InstalledBlockLibrary } from '@/types/blockLibraries';
import type { Logger } from '@/types/logger';
import type { StateManager } from '@/types/state';

/** One library to remove from one project's storefront. */
export interface BlockLibraryUninstallTarget {
    project: Project;
    library: InstalledBlockLibrary;
}

export interface BlockLibraryUninstallDeps {
    fileOps: BlockLibraryRemovalFileOps;
    /** The DA.live block list. Undefined when there is no DA.live session to use. */
    daLive?: Pick<DaLiveBlockLibraryOperations, 'removeBlockFromLibrary'>;
    stateManager: Pick<StateManager, 'saveProject'>;
    logger: Logger;
}

/** What a removal did, in the terms the SC is told. */
export interface BlockLibraryUninstallOutcome {
    name: string;
    /** Block folders deleted from the storefront. */
    removedBlockIds: string[];
    /** Blocks left exactly as they are, each with the reason. Named here and, unless unverified, nowhere again. */
    leftBlocks: LeftBlock[];
    /** Authoring entries left in place because the SC changed them. */
    leftEntries: LeftEntry[];
    /** Why the DA.live block list was not updated, when it was not. */
    daLiveError?: string;
}

function storefrontMetadata(project: Project): Record<string, unknown> | undefined {
    return project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata;
}

function stringOf(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** The sources and names the project still selects, plus the ones it can never drop. */
function keptLibraries(project: Project): Array<{ name?: string; owner?: string; repo?: string }> | undefined {
    const stack = getStackById(project.selectedStack ?? '');
    // Without the stack a native library cannot be told from an unticked one.
    if (!stack) return undefined;
    const metadata = storefrontMetadata(project);

    const kept: Array<{ name?: string; owner?: string; repo?: string }> = [
        // The template's own blocks arrived with the template.
        { owner: stringOf(metadata?.templateOwner), repo: stringOf(metadata?.templateRepo) },
        ...getNativeBlockLibraries(stack, project.selectedPackage ?? '').map((lib) => ({
            name: lib.name, ...lib.source,
        })),
        ...(project.customBlockLibraries ?? []).map((lib) => ({ name: lib.name, ...lib.source })),
    ];
    // An always-included library is kept whether or not anything names it.
    for (const id of withAlwaysIncludedBlockLibraries(project.selectedBlockLibraries, project.selectedPackage ?? '')) {
        kept.push({ name: getBlockLibraryName(id), ...getBlockLibrarySource(id) });
    }
    return kept;
}

/**
 * The libraries this project's storefront has that the project no longer
 * selects — the mirror of `findUninstalledBlockLibraries`.
 *
 * Empty unless the project has an EDS storefront with a GitHub repository and
 * a stack the catalog knows. A record is left out when it is still selected
 * (matched by source repository, or by name), when it is native to the
 * project's package (a locked card, which cannot be unticked), or when its
 * source is the storefront's own template.
 */
export function findUnselectedInstalledBlockLibraries(project: Project): InstalledBlockLibrary[] {
    const githubRepo = storefrontMetadata(project)?.githubRepo;
    if (typeof githubRepo !== 'string' || !githubRepo.includes('/')) return [];
    const kept = keptLibraries(project);
    if (!kept) return [];

    return (project.installedBlockLibraries ?? []).filter(
        (record) =>
            !kept.some(
                (lib) => lib.name === record.name || (record.source && sameRepo(record.source, lib)),
            ),
    );
}

/**
 * Blocks the storefront must keep because another library the project still
 * selects provides them: block id → that library's name. A library's blocks
 * are the folders in its repository now, plus the ones its record says it copied.
 */
async function blocksOfKeptLibraries(
    { project, library }: BlockLibraryUninstallTarget,
    fileOps: BlockLibraryRemovalFileOps,
): Promise<Map<string, string>> {
    const leaving = new Set(findUnselectedInstalledBlockLibraries(project));
    const shared = new Map<string, string>();
    for (const other of project.installedBlockLibraries ?? []) {
        if (other === library || leaving.has(other)) continue;
        const { owner, repo, branch } = other.source;
        const files = await fileOps.listRepoFiles(owner, repo, branch);
        const inRepository = files
            .map((file) => file.path.split('/'))
            .filter((parts) => parts.length >= 3 && parts[0] === 'blocks')
            .map((parts) => parts[1]);
        for (const id of [...other.blockIds, ...inRepository]) {
            if (!shared.has(id)) shared.set(id, other.name);
        }
    }
    return shared;
}

/** Take the removed blocks off the DA.live block list; answers why it could not, if it could not. */
async function removeFromDaLive(
    project: Project,
    repoName: string,
    blockIds: string[],
    deps: BlockLibraryUninstallDeps,
): Promise<string | undefined> {
    if (blockIds.length === 0) return undefined;
    const metadata = storefrontMetadata(project);
    const org = stringOf(metadata?.daLiveOrg);
    // Legacy-first, repository fallback — the rule `extractRepublishParams` reads it by.
    const site = stringOf(metadata?.daLiveSite) ?? repoName;
    if (!org) return 'this project has no DA.live organization';
    if (!deps.daLive) return 'not signed in to DA.live';
    try {
        for (const blockId of blockIds) {
            await deps.daLive.removeBlockFromLibrary(org, site, { blockId });
        }
        return undefined;
    } catch (error) {
        deps.logger.warn(`[Updates] DA.live block list not updated: ${(error as Error).message}`);
        return (error as Error).message;
    }
}

/**
 * The record after a removal, or undefined when the library is done with.
 *
 * Only a block left `unverified` keeps the record alive, with the entries that
 * belong to it. A block left because the SC changed it, or because another
 * library provides it, is no longer this library's to track, and neither is an
 * authoring entry the SC changed: each was named in the result, once.
 */
function remainingRecord(
    library: InstalledBlockLibrary,
    result: BlockLibraryRemovalResult,
): InstalledBlockLibrary | undefined {
    const blockIds = result.leftBlocks
        .filter((block) => block.reason === 'unverified')
        .map((block) => block.id);
    if (blockIds.length === 0) return undefined;

    const added = library.addedEntries;
    if (!added) return { ...library, blockIds };
    const kept = (ids: string[] | undefined): string[] =>
        (ids ?? []).filter((id) => blockIds.some((blockId) => belongsTo(id, blockId)));
    const addedEntries: AddedComponentEntries = {
        definition: kept(added.definition),
        sectionFilter: kept(added.sectionFilter),
        filters: kept(added.filters),
        models: kept(added.models),
        ...(added.htmlExamples ? { htmlExamples: kept(added.htmlExamples) } : {}),
    };
    return { ...library, blockIds, addedEntries };
}

/**
 * Remove one unselected library from the project's storefront repository and
 * update its record in `installedBlockLibraries`.
 *
 * This WRITES to the SC's GitHub repository (at most one commit on `main`) and
 * to DA.live, so it runs only from an explicit apply.
 *
 * @param item - the project and the library's record
 * @param deps - the GitHub and DA.live collaborators, the state manager, the logger
 * @returns what was removed and what was left, with the reasons
 */
export async function applyBlockLibraryUninstall(
    item: BlockLibraryUninstallTarget,
    deps: BlockLibraryUninstallDeps,
): Promise<BlockLibraryUninstallOutcome> {
    const { project, library } = item;
    const githubRepo = storefrontMetadata(project)?.githubRepo;
    if (typeof githubRepo !== 'string' || !githubRepo.includes('/')) {
        throw new Error('Cannot remove block library: storefront has no GitHub repo');
    }
    const [destOwner, destRepo] = githubRepo.split('/');

    const sharedBlocks = await blocksOfKeptLibraries(item, deps.fileOps);
    const result = await removeBlockLibraryFiles(
        { destOwner, destRepo, library, sharedBlocks },
        deps.fileOps,
        deps.logger,
    );
    const daLiveError = await removeFromDaLive(
        project, destRepo, result.clearedEntries.definition, deps,
    );

    const previous = project.installedBlockLibraries;
    const remaining = remainingRecord(library, result);
    project.installedBlockLibraries = (previous ?? []).flatMap((record) => {
        if (record !== library) return [record];
        return remaining ? [remaining] : [];
    });
    try {
        await deps.stateManager.saveProject(project);
    } catch (error) {
        // The files are out of the repository; only the record failed. Restore the
        // in-memory list so a retry re-runs (a block already gone is not an error).
        project.installedBlockLibraries = previous;
        throw error;
    }

    const outcome: BlockLibraryUninstallOutcome = {
        name: library.name,
        removedBlockIds: result.removedBlockIds,
        leftBlocks: result.leftBlocks,
        leftEntries: result.leftEntries,
        ...(daLiveError ? { daLiveError } : {}),
    };
    deps.logger.info(`[Updates] ${describeUninstallOutcome(outcome, project.name)}`);
    return outcome;
}

function describeLeftBlock(block: LeftBlock): string {
    if (block.reason === 'shared') return `${block.id} (also in ${block.sharedWith})`;
    if (block.reason === 'changed') return `${block.id} (changed since it was added)`;
    return `${block.id} (could not be compared with the library)`;
}

/**
 * What the SC is told after a removal ran: what went, and every block or entry
 * left in place with the reason.
 */
export function describeUninstallOutcome(
    outcome: BlockLibraryUninstallOutcome,
    projectName: string,
): string {
    const count = outcome.removedBlockIds.length;
    const sentences = [
        count === 0
            ? `${outcome.name} had no blocks left to remove from ${projectName}.`
            : `Removed ${count} block${count === 1 ? '' : 's'} that ${outcome.name} added to ${projectName}.`,
    ];
    if (outcome.leftBlocks.length > 0) {
        sentences.push(
            `Left ${outcome.leftBlocks.length} in place: ${outcome.leftBlocks.map(describeLeftBlock).join(', ')}.`,
        );
    }
    if (outcome.leftEntries.length > 0) {
        const noun = outcome.leftEntries.length === 1 ? 'entry' : 'entries';
        const named = outcome.leftEntries.map((entry) => `${entry.id} (${entry.file})`).join(', ');
        sentences.push(`Left ${outcome.leftEntries.length} authoring ${noun} changed by hand: ${named}.`);
    }
    if (outcome.daLiveError) {
        sentences.push(`The removed blocks were not taken off DA.live (${outcome.daLiveError}).`);
    }
    return sentences.join(' ');
}
