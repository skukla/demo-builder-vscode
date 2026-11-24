/**
 * The blocks still waiting for an example (EDS-71 step 4c): the listed blocks whose DA.live
 * example page is the placeholder shaped by their code, as the last library build left them
 * (`BlockLibraryResult.needsExample`).
 *
 * Kept on the storefront instance's free-form metadata,
 * `componentInstances['eds-storefront'].metadata.blocksNeedingExamples`, as block ids. The
 * dashboard's Draft Examples tile wears its dot while there are any and says how many;
 * `promote_block_to_library` takes a block off once it has written its example; every build
 * (creation, reset, Refresh Blocks, Configure) replaces the record. A project made before this
 * has no record, which reads as none known.
 *
 * Vscode-free: the file-based MCP tools edit the manifest with it too.
 *
 * @module features/eds/services/blockLibrary/examplesNeededRecord
 */

import { isBlockName } from './blockTable';
import { CORE_CONTENT_BLOCKS } from './storefrontBlockList';
import { COMPONENT_IDS } from '@/core/constants';

const KEY = 'blocksNeedingExamples';

/** The part of a project (or its manifest as read from disk) the record lives on. */
export interface ManifestWithInstances {
    componentInstances?: Record<string, { metadata?: Record<string, unknown> } | undefined>;
}

const storefrontOf = (project: ManifestWithInstances) =>
    project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];

/**
 * A block an example can be written for: a block name, and not a core content structure
 * (`metadata`, `section-metadata`), which has no folder in the code.
 */
const isExampleBlock = (id: unknown): id is string =>
    typeof id === 'string' && isBlockName(id) && !CORE_CONTENT_BLOCKS.has(id);

/**
 * The record as kept: the blocks the last build left on a placeholder, `[]` when it left none,
 * or undefined when no build has recorded anything (a project made before the record, which
 * must not read as "every block has an example"). Anything that is not such a block is dropped.
 *
 * @param project - the project, or its manifest
 */
export function readBlocksNeedingExamplesRecord(project: ManifestWithInstances): string[] | undefined {
    const raw = storefrontOf(project)?.metadata?.[KEY];
    return Array.isArray(raw) ? raw.filter(isExampleBlock) : undefined;
}

/**
 * The blocks the last build left on a placeholder; none when there is no record.
 *
 * @param project - the project, or its manifest
 * @returns the block ids, or none
 */
export function readBlocksNeedingExamples(project: ManifestWithInstances): string[] {
    return readBlocksNeedingExamplesRecord(project) ?? [];
}

/**
 * Keep what the last build found (the caller saves the project). A project with no storefront
 * has nothing to keep it on and is left alone.
 *
 * @param project - the project, changed in place
 * @param ids - the build's blocks with no example; `[]` records that every block has one;
 *   undefined (the build could not say) leaves the record as it was
 */
export function writeBlocksNeedingExamples(
    project: ManifestWithInstances,
    ids: string[] | undefined,
): void {
    const instance = storefrontOf(project);
    if (!instance || ids === undefined) return;
    instance.metadata = { ...(instance.metadata ?? {}), [KEY]: ids.filter(isExampleBlock) };
}

/**
 * Take a block off the record once it has an example.
 *
 * @param project - the project, changed in place
 * @param blockId - the block that now has an example
 * @returns true when the record changed (the caller saves), false when the block was not on it
 */
export function dropBlockNeedingExample(project: ManifestWithInstances, blockId: string): boolean {
    const ids = readBlocksNeedingExamples(project);
    if (!ids.includes(blockId)) return false;
    writeBlocksNeedingExamples(project, ids.filter((id) => id !== blockId));
    return true;
}
