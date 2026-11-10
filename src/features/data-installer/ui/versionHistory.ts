/**
 * What the flyout's Version History needs from the catalog (walk F99): the open pack's saves, newest
 * first, and the one this demo uses. Pure, out of `DatapackCatalogView`, which was at its size and
 * complexity limits.
 *
 * @module features/data-installer/ui/versionHistory
 */

import { savesOf } from '../packVersions';
import type { DatapackGroup } from '../services/datapackCatalog';
import type { DatapackId, DatapackStoreName, ProjectDatapack } from '@/types/datapack';

/** The flyout's Version History props for the pack open in it. */
export function versionHistoryOf(
    groups: readonly DatapackGroup[],
    selected: DatapackId | undefined,
    store: DatapackStoreName | undefined,
    held: ProjectDatapack | undefined,
): { history: string[]; inUse?: string } {
    if (!selected) return { history: [] };
    const group = groups.find((each) => each.name === selected.name && each.store === store);
    const history = savesOf(group?.versions.map((version) => version.id.version) ?? []);
    return held?.name === selected.name ? { history, inUse: held.version } : { history };
}
