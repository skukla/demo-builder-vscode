/**
 * Block Library Component Merge
 *
 * Builds the merged authoring config a block library install commits into the
 * storefront's repository: component-definition.json (block entries and their
 * DA.live preview HTML), component-filters.json (the section allowlist and
 * sub-component filters) and component-models.json (field models).
 *
 * Every merge starts from the destination's CURRENT file and only adds to it:
 * an entry whose id is already there is left exactly as it is, and the only
 * field ever written into an existing entry is a missing unsafeHTML. So an
 * SC's hand edits to these files survive an install; the file is re-serialised
 * with two-space indentation. Each builder returns null when there is nothing
 * to add, and the caller then leaves that file out of the commit.
 *
 * Discovery and the commit itself live in blockCollectionHelpers.ts, which
 * calls these three builders with the blocks each library won.
 *
 * @module features/eds/services/blockLibraryComponentMerge
 */

import type { GitHubFileOperations } from './github/githubFileOperations';
import type { AddonSource } from '@/types/demoPackages';

/** The one read the merge needs: the current content of a file in a repo. */
export type FileContentReader = Pick<GitHubFileOperations, 'getFileContent'>;

/** Per-library block discovery result used by the merge builders */
export interface LibraryBlockData {
    source: AddonSource;
    blockIds: string[];
    files: Array<{ path: string; sha: string }>;
}

/**
 * Build a merged component-definition.json from multiple source repositories.
 *
 * For each source, extracts entries from ALL groups matching the blocks assigned
 * to that source (after cross-library dedup). Appends to the matching destination
 * group, creating new groups as needed.
 */
export async function buildMergedComponentDefinitionMultiSource(
    githubFileOps: FileContentReader,
    destOwner: string,
    destRepo: string,
    libraryBlockFiles: LibraryBlockData[],
): Promise<string | null> {
    // Collect entries tagged by group from all source repos.
    // Cache parsed source definitions for the unsafeHTML enrichment pass below.
    const entriesByGroup = new Map<string, {
        title: string;
        entries: Array<{ id: string; [key: string]: unknown }>;
    }>();
    const collectedIds = new Set<string>();
    const sourceDefinitions: Array<{ groups: Array<{ components?: Array<{ id: string; plugins?: { da?: { unsafeHTML?: string } } }> }> }> = [];

    for (const libData of libraryBlockFiles) {
        const sourceFile = await githubFileOps.getFileContent(
            libData.source.owner, libData.source.repo, 'component-definition.json',
        );
        if (!sourceFile?.content) continue;

        const sourceDef = JSON.parse(sourceFile.content);
        if (!sourceDef.groups) continue;

        sourceDefinitions.push(sourceDef);

        for (const group of sourceDef.groups) {
            if (!group.components) continue;
            for (const entry of group.components) {
                if (collectedIds.has(entry.id)) continue;
                const matches = libData.blockIds.some(
                    (block: string) => entry.id === block || entry.id.startsWith(`${block}-`),
                );
                if (!matches) continue;

                collectedIds.add(entry.id);
                let groupData = entriesByGroup.get(group.id);
                if (!groupData) {
                    groupData = { title: group.title, entries: [] };
                    entriesByGroup.set(group.id, groupData);
                }
                groupData.entries.push(entry);
            }
        }
    }

    // Fetch destination — needed for both the new-entry merge and the enrichment pass.
    const destFile = await githubFileOps.getFileContent(
        destOwner, destRepo, 'component-definition.json',
    );
    if (!destFile?.content) return null;

    const destDef = JSON.parse(destFile.content);
    if (!destDef.groups) return null;

    // Pass 1: merge component-definition entries for newly-installed (unique) blocks.
    const addedCount = mergeNewComponentDefinitionEntries(destDef, entriesByGroup);

    // Pass 2: enrich unsafeHTML for blocks already present in the destination but
    // without unsafeHTML. Covers deduplicated blocks whose component-definition entries
    // came from the template rather than the library — their block files were correctly
    // preserved, but their metadata may lack unsafeHTML that the library source has.
    // Additive only: never overwrites existing unsafeHTML, never touches block files.
    const enrichedCount = enrichMissingUnsafeHtml(destDef, sourceDefinitions);

    if (addedCount === 0 && enrichedCount === 0) return null;
    return JSON.stringify(destDef, null, 2);
}

/** Group entries collected from source repos, keyed by group id. */
type CollectedEntriesByGroup = Map<string, {
    title: string;
    entries: Array<{ id: string; [key: string]: unknown }>;
}>;

/** Parsed source component-definition shape needed for unsafeHTML enrichment. */
type SourceDefinition = {
    groups: Array<{ components?: Array<{ id: string; plugins?: { da?: { unsafeHTML?: string } } }> }>;
};

/**
 * Pass 1: append component-definition entries for newly-installed (unique) blocks
 * into the matching destination group, creating groups as needed. Returns the
 * number of entries added.
 */
function mergeNewComponentDefinitionEntries(
    destDef: { groups: Array<{ id: string; title?: string; components?: Array<{ id: string }> }> },
    entriesByGroup: CollectedEntriesByGroup,
): number {
    let addedCount = 0;
    for (const [groupId, groupData] of entriesByGroup) {
        let destGroup = destDef.groups.find((g: { id: string }) => g.id === groupId);
        if (!destGroup) {
            destGroup = { id: groupId, title: groupData.title, components: [] };
            destDef.groups.push(destGroup);
        }
        const existingIds = new Set(
            destGroup.components?.map((c: { id: string }) => c.id) ?? [],
        );
        const newEntries = groupData.entries.filter((c: { id: string }) => !existingIds.has(c.id));
        if (newEntries.length > 0) {
            destGroup.components = [...(destGroup.components || []), ...newEntries];
            addedCount += newEntries.length;
        }
    }
    return addedCount;
}

/**
 * Pass 2: enrich unsafeHTML for blocks already present in the destination but
 * missing it, using the source definitions. Additive only — never overwrites
 * existing unsafeHTML. Returns the number of entries enriched.
 */
function enrichMissingUnsafeHtml(
    destDef: { groups: Array<{ components?: Array<{ id: string; plugins?: { da?: { unsafeHTML?: string } } }> }> },
    sourceDefinitions: SourceDefinition[],
): number {
    let enrichedCount = 0;
    for (const sourceDef of sourceDefinitions) {
        for (const group of sourceDef.groups) {
            if (!group.components) continue;
            for (const entry of group.components) {
                const sourceUnsafeHTML = entry.plugins?.da?.unsafeHTML;
                if (!sourceUnsafeHTML) continue;

                for (const destGroup of destDef.groups) {
                    const destEntry = destGroup.components?.find(
                        (c: { id: string }) => c.id === entry.id,
                    );
                    if (!destEntry || destEntry.plugins?.da?.unsafeHTML) continue;
                    destEntry.plugins = destEntry.plugins ?? {};
                    destEntry.plugins.da = destEntry.plugins.da ?? {};
                    destEntry.plugins.da.unsafeHTML = sourceUnsafeHTML;
                    enrichedCount++;
                }
            }
        }
    }
    return enrichedCount;
}

/**
 * Build a merged component-filters.json from multiple source repositories.
 *
 * For each source, extracts filter entries (section allowlist + sub-component
 * filters) matching the blocks assigned to that source. Combines all entries
 * and appends to the destination's component-filters.json.
 */
export async function buildMergedComponentFiltersMultiSource(
    githubFileOps: FileContentReader,
    destOwner: string,
    destRepo: string,
    libraryBlockFiles: LibraryBlockData[],
): Promise<string | null> {
    const newSectionIds: string[] = [];
    const newSubFilters: Array<{ id: string; components: string[] }> = [];
    const collectedSectionIds = new Set<string>();
    const collectedSubFilterIds = new Set<string>();

    for (const libData of libraryBlockFiles) {
        const sourceFile = await githubFileOps.getFileContent(
            libData.source.owner, libData.source.repo, 'component-filters.json',
        );
        if (!sourceFile?.content) continue;

        const sourceFilters: Array<{ id: string; components: string[] }> =
            JSON.parse(sourceFile.content);
        const blockIdSet = new Set(libData.blockIds);

        // Extract block IDs from source's section filter that match installed blocks
        const sourceSection = sourceFilters.find(f => f.id === 'section');
        if (sourceSection) {
            for (const componentId of sourceSection.components) {
                if (blockIdSet.has(componentId) && !collectedSectionIds.has(componentId)) {
                    collectedSectionIds.add(componentId);
                    newSectionIds.push(componentId);
                }
            }
        }

        // Collect sub-component filter entries whose id matches a block ID
        for (const filter of sourceFilters) {
            if (filter.id === 'main' || filter.id === 'section') continue;
            if (blockIdSet.has(filter.id) && !collectedSubFilterIds.has(filter.id)) {
                collectedSubFilterIds.add(filter.id);
                newSubFilters.push(filter);
            }
        }
    }

    if (newSectionIds.length === 0 && newSubFilters.length === 0) return null;

    // Merge into destination
    const destFile = await githubFileOps.getFileContent(
        destOwner, destRepo, 'component-filters.json',
    );
    if (!destFile?.content) return null;

    const destFilters: Array<{ id: string; components: string[] }> =
        JSON.parse(destFile.content);

    let changed = false;

    // Append new block IDs to destination's section filter (skip duplicates)
    const destSection = destFilters.find(f => f.id === 'section');
    if (destSection) {
        const existingSectionIds = new Set(destSection.components);
        for (const id of newSectionIds) {
            if (!existingSectionIds.has(id)) {
                destSection.components.push(id);
                changed = true;
            }
        }
    }

    // Append new sub-component filter entries (skip entries already present)
    const existingFilterIds = new Set(destFilters.map(f => f.id));
    for (const subFilter of newSubFilters) {
        if (!existingFilterIds.has(subFilter.id)) {
            destFilters.push(subFilter);
            changed = true;
        }
    }

    return changed ? JSON.stringify(destFilters, null, 2) : null;
}

/**
 * Build a merged component-models.json from multiple source repositories.
 *
 * component-models.json is a flat array of model objects (each with an `id`
 * and `fields` array). Collects models matching installed block IDs
 * (including sub-component models like tabs-item for tabs), deduplicates
 * across libraries, and appends to the destination.
 */
export async function buildMergedComponentModelsMultiSource(
    githubFileOps: FileContentReader,
    destOwner: string,
    destRepo: string,
    libraryBlockFiles: LibraryBlockData[],
): Promise<string | null> {
    const newModels: Array<{ id: string; [key: string]: unknown }> = [];
    const collectedIds = new Set<string>();

    for (const libData of libraryBlockFiles) {
        const sourceFile = await githubFileOps.getFileContent(
            libData.source.owner, libData.source.repo, 'component-models.json',
        );
        if (!sourceFile?.content) continue;

        const sourceModels: Array<{ id: string; [key: string]: unknown }> =
            JSON.parse(sourceFile.content);

        for (const model of sourceModels) {
            if (collectedIds.has(model.id)) continue;
            const matches = libData.blockIds.some(
                (block: string) => model.id === block || model.id.startsWith(`${block}-`),
            );
            if (!matches) continue;

            collectedIds.add(model.id);
            newModels.push(model);
        }
    }

    if (newModels.length === 0) return null;

    // Merge into destination
    const destFile = await githubFileOps.getFileContent(
        destOwner, destRepo, 'component-models.json',
    );
    if (!destFile?.content) return null;

    const destModels: Array<{ id: string; [key: string]: unknown }> =
        JSON.parse(destFile.content);

    const existingIds = new Set(destModels.map(m => m.id));
    const entriesToAdd = newModels.filter(m => !existingIds.has(m.id));

    if (entriesToAdd.length === 0) return null;

    return JSON.stringify([...destModels, ...entriesToAdd], null, 2);
}
