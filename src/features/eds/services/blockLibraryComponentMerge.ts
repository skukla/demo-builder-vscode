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
 * SC's hand edits to these files survive an install, and each file is written
 * in the indentation it already had. An entry the extension added before and
 * the SC has since deleted is left out, not put back, and so is an HTML example
 * it filled before (the record and its reasoning: addedEntriesRecord.ts). Each
 * builder returns null when there is nothing to add, and the caller then leaves
 * that file out of the commit.
 *
 * Discovery and the commit itself live in blockCollectionHelpers.ts, which
 * calls these three builders with the blocks each library won.
 *
 * @module features/eds/services/blockLibraryComponentMerge
 */

import {
    claimMissingEntry,
    noteAddedEntry,
    type EntryOrigin,
    type EntryTracker,
} from './addedEntriesRecord';
import type { GitHubFileOperations } from './github/githubFileOperations';
import { stringifyJsonLike } from '@/core/utils/jsonFormatting';
import type { AddonSource } from '@/types/demoPackages';

/** The one read the merge needs: the current content of a file in a repo. */
export type FileContentReader = Pick<GitHubFileOperations, 'getFileContent'>;

/** Per-library block discovery result used by the merge builders */
export interface LibraryBlockData {
    source: AddonSource;
    blockIds: string[];
    files: Array<{ path: string; sha: string }>;
    /** The library's name and its record, for deciding missing entries */
    origin: EntryOrigin;
}

/** Where the merged authoring files go, and the run's record of what was added. */
export interface MergeContext {
    githubFileOps: FileContentReader;
    destOwner: string;
    destRepo: string;
    tracker: EntryTracker;
}

/**
 * Build a merged component-definition.json from multiple source repositories.
 *
 * For each source, extracts entries from ALL groups matching the blocks assigned
 * to that source (after cross-library dedup). Appends to the matching destination
 * group, creating new groups as needed.
 */
export async function buildMergedComponentDefinitionMultiSource(
    { githubFileOps, destOwner, destRepo, tracker }: MergeContext,
    libraryBlockFiles: LibraryBlockData[],
): Promise<string | null> {
    // Collect entries tagged by group from all source repos.
    // Cache parsed source definitions for the unsafeHTML enrichment pass below.
    const entriesByGroup: CollectedEntriesByGroup = new Map();
    const collectedIds = new Set<string>();
    const origins = new Map<string, EntryOrigin>();
    const sourceDefinitions: Array<{ def: SourceDefinition; origin: EntryOrigin }> = [];

    for (const libData of libraryBlockFiles) {
        const sourceFile = await githubFileOps.getFileContent(
            libData.source.owner, libData.source.repo, 'component-definition.json',
        );
        if (!sourceFile?.content) continue;

        const sourceDef = JSON.parse(sourceFile.content);
        if (!sourceDef.groups) continue;

        sourceDefinitions.push({ def: sourceDef, origin: libData.origin });

        for (const group of sourceDef.groups) {
            if (!group.components) continue;
            for (const entry of group.components) {
                if (collectedIds.has(entry.id)) continue;
                const matches = libData.blockIds.some(
                    (block: string) => entry.id === block || entry.id.startsWith(`${block}-`),
                );
                if (!matches) continue;

                collectedIds.add(entry.id);
                origins.set(entry.id, libData.origin);
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

    // Pass 1: merge component-definition entries for newly-installed (unique) blocks,
    // leaving out any the SC deleted after an earlier run added them. An added
    // entry's HTML example is recorded too, so stripping it later sticks.
    const addedCount = mergeNewComponentDefinitionEntries(destDef, entriesByGroup, (entry) => {
        const origin = origins.get(entry.id);
        if (!origin) return true;
        if (!claimMissingEntry(tracker, origin, 'definition', entry.id)) return false;
        if (entry.plugins?.da?.unsafeHTML) noteAddedEntry(tracker, origin, 'htmlExamples', entry.id);
        return true;
    });

    // Pass 2: enrich unsafeHTML for blocks already present in the destination but
    // without unsafeHTML. Covers deduplicated blocks whose component-definition entries
    // came from the template rather than the library — their block files were correctly
    // preserved, but their metadata may lack unsafeHTML that the library source has.
    // Additive only: never overwrites existing unsafeHTML, never touches block files,
    // and never refills an example it filled before that the SC has since stripped.
    const enrichedCount = enrichMissingUnsafeHtml(destDef, sourceDefinitions, (id, origin) =>
        claimMissingEntry(tracker, origin, 'htmlExamples', id));

    if (addedCount === 0 && enrichedCount === 0) return null;
    return stringifyJsonLike(destFile.content, destDef);
}

/** A component-definition entry, as far as the merge reads one. */
type DefinitionEntry = { id: string; plugins?: { da?: { unsafeHTML?: string } }; [key: string]: unknown };

/** Group entries collected from source repos, keyed by group id. */
type CollectedEntriesByGroup = Map<string, {
    title: string;
    entries: DefinitionEntry[];
}>;

/** Parsed source component-definition shape needed for unsafeHTML enrichment. */
type SourceDefinition = {
    groups: Array<{ components?: DefinitionEntry[] }>;
};

/**
 * Pass 1: append component-definition entries for newly-installed (unique) blocks
 * into the matching destination group, creating groups as needed. An entry that
 * is anywhere in the file — in any group — is left where it is; a missing one is
 * added only if `mayAdd` agrees. Returns the number of entries added.
 */
function mergeNewComponentDefinitionEntries(
    destDef: { groups: Array<{ id: string; title?: string; components?: Array<{ id: string }> }> },
    entriesByGroup: CollectedEntriesByGroup,
    mayAdd: (entry: DefinitionEntry) => boolean,
): number {
    const existingIds = new Set(
        destDef.groups.flatMap((g) => g.components?.map((c: { id: string }) => c.id) ?? []),
    );
    let addedCount = 0;
    for (const [groupId, groupData] of entriesByGroup) {
        const newEntries = groupData.entries.filter(
            (c) => !existingIds.has(c.id) && mayAdd(c),
        );
        if (newEntries.length === 0) continue;
        let destGroup = destDef.groups.find((g: { id: string }) => g.id === groupId);
        if (!destGroup) {
            destGroup = { id: groupId, title: groupData.title, components: [] };
            destDef.groups.push(destGroup);
        }
        destGroup.components = [...(destGroup.components || []), ...newEntries];
        addedCount += newEntries.length;
    }
    return addedCount;
}

/**
 * Pass 2: enrich unsafeHTML for blocks already present in the destination but
 * missing it, using the source definitions. Additive only — never overwrites
 * existing unsafeHTML, and fills an entry only if `mayFill` agrees. Each entry
 * id is decided once, by the first library that has an example for it, so a
 * second library cannot refill what the first left out. Returns the number of
 * entries enriched.
 */
function enrichMissingUnsafeHtml(
    destDef: { groups: Array<{ components?: DefinitionEntry[] }> },
    sourceDefinitions: Array<{ def: SourceDefinition; origin: EntryOrigin }>,
    mayFill: (id: string, origin: EntryOrigin) => boolean,
): number {
    const destEntries = destDef.groups.flatMap((g) => g.components ?? []);
    const decided = new Set<string>();
    let enrichedCount = 0;
    for (const { def, origin } of sourceDefinitions) {
        for (const entry of def.groups.flatMap((g) => g.components ?? [])) {
            const sourceUnsafeHTML = entry.plugins?.da?.unsafeHTML;
            if (!sourceUnsafeHTML || decided.has(entry.id)) continue;
            const missing = destEntries.filter(
                (c) => c.id === entry.id && !c.plugins?.da?.unsafeHTML,
            );
            if (missing.length === 0) continue;
            decided.add(entry.id);
            if (!mayFill(entry.id, origin)) continue;
            for (const destEntry of missing) {
                destEntry.plugins = destEntry.plugins ?? {};
                destEntry.plugins.da = destEntry.plugins.da ?? {};
                destEntry.plugins.da.unsafeHTML = sourceUnsafeHTML;
                enrichedCount++;
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
    { githubFileOps, destOwner, destRepo, tracker }: MergeContext,
    libraryBlockFiles: LibraryBlockData[],
): Promise<string | null> {
    const newSectionIds: Array<{ id: string; origin: EntryOrigin }> = [];
    const newSubFilters: Array<{ filter: { id: string; components: string[] }; origin: EntryOrigin }> = [];
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
                    newSectionIds.push({ id: componentId, origin: libData.origin });
                }
            }
        }

        // Collect sub-component filter entries whose id matches a block ID
        for (const filter of sourceFilters) {
            if (filter.id === 'main' || filter.id === 'section') continue;
            if (blockIdSet.has(filter.id) && !collectedSubFilterIds.has(filter.id)) {
                collectedSubFilterIds.add(filter.id);
                newSubFilters.push({ filter, origin: libData.origin });
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

    // Append new block IDs to destination's section filter (skip duplicates and
    // ids the SC removed after an earlier run added them)
    const destSection = destFilters.find(f => f.id === 'section');
    if (destSection) {
        const existingSectionIds = new Set(destSection.components);
        for (const { id, origin } of newSectionIds) {
            if (!existingSectionIds.has(id) && claimMissingEntry(tracker, origin, 'sectionFilter', id)) {
                destSection.components.push(id);
                changed = true;
            }
        }
    }

    // Append new sub-component filter entries (same two skips)
    const existingFilterIds = new Set(destFilters.map(f => f.id));
    for (const { filter, origin } of newSubFilters) {
        if (!existingFilterIds.has(filter.id) && claimMissingEntry(tracker, origin, 'filters', filter.id)) {
            destFilters.push(filter);
            changed = true;
        }
    }

    return changed ? stringifyJsonLike(destFile.content, destFilters) : null;
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
    { githubFileOps, destOwner, destRepo, tracker }: MergeContext,
    libraryBlockFiles: LibraryBlockData[],
): Promise<string | null> {
    const newModels: Array<{ model: { id: string; [key: string]: unknown }; origin: EntryOrigin }> = [];
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
            newModels.push({ model, origin: libData.origin });
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
    const entriesToAdd = newModels
        .filter(({ model, origin }) =>
            !existingIds.has(model.id) && claimMissingEntry(tracker, origin, 'models', model.id))
        .map(({ model }) => model);

    if (entriesToAdd.length === 0) return null;

    return stringifyJsonLike(destFile.content, [...destModels, ...entriesToAdd]);
}
