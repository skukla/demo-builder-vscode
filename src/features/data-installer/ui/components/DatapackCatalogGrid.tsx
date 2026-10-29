/**
 * The catalog's body under its search band: the empty catalog, the empty filter, or the grid of
 * cards, one per pack name, each wearing the installed check when the pack is on this instance.
 *
 * Moved out of `DatapackCatalogView` unchanged (datapack-engine step 05), so the view could host
 * the progress window "Save store changes to this pack" opens without passing the size rule's
 * import limit; the view is its only caller.
 *
 * @module features/data-installer/ui/components/DatapackCatalogGrid
 */

import React from 'react';
import { type DatapackGroup, pickDefaultVersion } from '../../services/datapackCatalog';
import { DatapackCard } from './DatapackCard';
import { EmptyState } from '@/core/ui/components/feedback/EmptyState';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';

/**
 * Whether a card wears the installed check. Installed means the Data Installer put it
 * on this instance; a library pack of the same name is not that pack.
 */
function installedHere(group: DatapackGroup, installedPacks?: ReadonlySet<string>): boolean {
    return group.store === 'installer' && (installedPacks?.has(group.name) ?? false);
}

export interface DatapackCatalogGridProps {
    groups: DatapackGroup[];
    filtered: DatapackGroup[];
    query: string;
    versions: Record<string, string>;
    pickVersion: (name: string, version: string) => void;
    openDetail: (id: DatapackId, store: DatapackStoreName) => void;
    /** Every pack believed installed on this instance — one check per card. */
    installedPacks?: ReadonlySet<string>;
}

/** Pick the one body state to show under the header. */
export function DatapackCatalogGrid({
    groups,
    filtered,
    query,
    versions,
    pickVersion,
    openDetail,
    installedPacks,
}: DatapackCatalogGridProps): React.JSX.Element {
    if (groups.length === 0) {
        return (
            <EmptyState
                title="No datapacks found"
                description="The service returned no datapacks. Turn on community datapacks to include entries that are not shared."
            />
        );
    }

    if (filtered.length === 0) {
        return <div className="datapack-catalog-empty">No datapacks match &quot;{query}&quot;</div>;
    }

    return (
        <div className="datapack-grid">
            {filtered.map((group) => (
                <DatapackCard
                    key={group.key}
                    group={group}
                    selectedVersion={versions[group.key] ?? pickDefaultVersion(group) ?? ''}
                    onVersionChange={(version) => pickVersion(group.key, version)}
                    onOpen={openDetail}
                    isInstalled={installedHere(group, installedPacks)}
                />
            ))}
        </div>
    );
}
