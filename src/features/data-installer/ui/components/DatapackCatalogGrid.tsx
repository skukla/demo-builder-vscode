/**
 * The catalog's body under its search band: the empty catalog, the empty filter, or the grid of
 * cards, one per pack name, each wearing the installed check when the pack is on this instance.
 *
 * The demo's own pack (`project.datapack`) wears the check wherever it lives, the SC's library
 * included, opens on the version the demo uses, and marks a newer one (owner, 2026-11-04: it is
 * one of the library's cards, shown as selected, not a section of its own above them).
 *
 * Moved out of `DatapackCatalogView` unchanged (datapack-engine step 05), so the view could host
 * the progress window "Save store changes to this pack" opens without passing the size rule's
 * import limit; the view is its only caller.
 *
 * @module features/data-installer/ui/components/DatapackCatalogGrid
 */

import React from 'react';
import { type DatapackGroup, isHeld, pickDefaultVersion } from '../../services/datapackCatalog';
import { EMPTY_SHOW_TITLE, type CatalogShow } from '../catalogShow';
import { DatapackCard } from './DatapackCard';
import { newerVersionOf } from './projectPackNewer';
import { EmptyState } from '@/core/ui/components/feedback/EmptyState';
import type { DatapackId, DatapackStoreName, ProjectDatapack } from '@/types/datapack';

/** The version the demo uses, when the library still lists it. */
function listedVersion(group: DatapackGroup, held?: ProjectDatapack): string | undefined {
    return group.versions.some((version) => version.id.version === held?.version) ? held?.version : undefined;
}

/**
 * Whether a card wears the installed check: the demo's own pack, or a pack the Data Installer put
 * on this instance. A library pack of the same name as an installed one is not that pack.
 */
function installedHere(group: DatapackGroup, installedPacks?: ReadonlySet<string>, held?: ProjectDatapack): boolean {
    return isHeld(group, held) || (group.store === 'installer' && (installedPacks?.has(group.name) ?? false));
}

export interface DatapackCatalogGridProps {
    /** The packs the Show list leaves, before the filter box. */
    groups: DatapackGroup[];
    filtered: DatapackGroup[];
    /** Which Show choice they came from. */
    show: CatalogShow;
    query: string;
    versions: Record<string, string>;
    pickVersion: (name: string, version: string) => void;
    openDetail: (id: DatapackId, store: DatapackStoreName) => void;
    /** Every pack believed installed on this instance — one check per card. */
    installedPacks?: ReadonlySet<string>;
    /** The pack the open project installs from and resets to, as it records it. */
    held?: ProjectDatapack;
    /** When Demo Builder's engine installed it, when it did: what a newer version is newer than. */
    installedAt?: string;
}

/** Pick the one body state to show under the header. */
export function DatapackCatalogGrid({
    groups,
    filtered,
    show,
    query,
    versions,
    pickVersion,
    openDetail,
    installedPacks,
    held,
    installedAt,
}: DatapackCatalogGridProps): React.JSX.Element {
    if (groups.length === 0) {
        return (
            <EmptyState
                title={EMPTY_SHOW_TITLE[show] ?? 'No Datapacks Yet'}
                // Only your own or the whole catalog can be filled from here.
                description={
                    show === 'team' || show === 'installer' || show === 'community'
                        ? 'Choose another view'
                        : "Load a datapack .zip file, or save one from your demo's Commerce instance."
                }
            />
        );
    }

    if (filtered.length === 0) {
        return <div className="datapack-catalog-empty">No datapacks match &quot;{query}&quot;</div>;
    }

    return (
        <div className="datapack-grid">
            {filtered.map((group) => {
                const own = isHeld(group, held);
                const shown = versions[group.key] ?? (own ? listedVersion(group, held) : undefined) ?? pickDefaultVersion(group) ?? '';
                return (
                    <DatapackCard
                        key={group.key}
                        group={group}
                        selectedVersion={shown}
                        onVersionChange={(version) => pickVersion(group.key, version)}
                        onOpen={openDetail}
                        isInstalled={installedHere(group, installedPacks, held)}
                        newerAt={own ? newerVersionOf(group, held, installedAt)?.at : undefined}
                    />
                );
            })}
        </div>
    );
}
