/**
 * The catalog's body under its search band: the empty catalog, the empty filter, or the grid of
 * cards, one per pack name, each wearing the installed check when the pack is on this instance.
 *
 * The demo's own pack (`project.datapack`) wears the check wherever it lives, the SC's library
 * included, opens on the version the demo uses, and marks a newer save (owner, 2026-11-04: it is
 * one of the library's cards, shown as selected, not a section of its own above them).
 *
 * Moved out of `DatapackCatalogView` unchanged (datapack-engine step 05), so the view could host
 * the progress window "Save store changes to this pack" opens without passing the size rule's
 * import limit; the view is its only caller.
 *
 * @module features/data-installer/ui/components/DatapackCatalogGrid
 */

import React from 'react';
import { restoreIsNewer } from '../../packVersions';
import { type DatapackGroup, isHeld, pickDefaultVersion } from '../../services/datapackCatalog';
import { EMPTY_SHOW_TITLE, type CatalogShow, type ShowElsewhere } from '../catalogShow';
import { DatapackCard } from './DatapackCard';
import { ShowElsewhereNote } from './ShowElsewhereNote';
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
    /** The filter matches nothing here but something under another choice (Clarity 1.13). */
    elsewhere?: ShowElsewhere;
    /** Switch the Show list, from that note. */
    onShow: (show: CatalogShow) => void;
    query: string;
    versions: Record<string, string>;
    pickVersion: (name: string, version: string) => void;
    openDetail: (id: DatapackId, store: DatapackStoreName) => void;
    /** Every pack believed installed on this instance — one check per card. */
    installedPacks?: ReadonlySet<string>;
    /** The pack the open project installs from and resets to, as it records it. */
    held?: ProjectDatapack;
    /** When Demo Builder's engine installed it, when it did: none, no install record to restore by. */
    installedAt?: string;
    /**
     * Its install failed (step-04 S8, J6-1): its card says so, with no check and no border, and no
     * newer save, since Restore is not offered.
     */
    heldFailed?: boolean;
}

/** Pick the one body state to show under the header. */
export function DatapackCatalogGrid({
    groups,
    filtered,
    show,
    elsewhere,
    onShow,
    query,
    versions,
    pickVersion,
    openDetail,
    installedPacks,
    held,
    installedAt,
    heldFailed = false,
}: DatapackCatalogGridProps): React.JSX.Element {
    if (groups.length === 0) {
        return (
            <EmptyState
                title={EMPTY_SHOW_TITLE[show] ?? 'No Datapacks Yet'}
                // Only your own or the whole catalog can be filled from here.
                description={
                    show === 'team' || show === 'installer' || show === 'community'
                        ? 'Try All Datapacks'
                        : show === 'yours'
                          ? 'Add one from a file.'
                          : "Add one from a file, or save this demo's."
                }
            />
        );
    }

    if (filtered.length === 0 && elsewhere) {
        return (
            <div className="datapack-catalog-empty">
                <ShowElsewhereNote show={show} elsewhere={elsewhere} onShow={onShow} />
            </div>
        );
    }

    if (filtered.length === 0) {
        return <div className="datapack-catalog-empty">No datapacks match &quot;{query}&quot;</div>;
    }

    return (
        <div className="datapack-grid">
            {filtered.map((group) => {
                const own = isHeld(group, held);
                const failed = own && heldFailed;
                const shown = versions[group.key] ?? (own ? listedVersion(group, held) : undefined) ?? pickDefaultVersion(group) ?? '';
                return (
                    <DatapackCard
                        key={group.key}
                        group={group}
                        selectedVersion={shown}
                        onVersionChange={(version) => pickVersion(group.key, version)}
                        onOpen={openDetail}
                        isInstalled={!failed && installedHere(group, installedPacks, held)}
                        newer={own && !failed ? newerOf(group, held, installedAt) : undefined}
                        installFailed={failed}
                    />
                );
            })}
        </div>
    );
}

/** The amber dot's hover (J4-1, owner 2026-11-12). */
const NEWER_SAVE = 'Newer save available';

/**
 * The dot's words for the demo's own pack: present exactly when Restore would install a save newer
 * than the one it holds (`restoreIsNewer`, the rule the handler uses). Restore needs Demo Builder's
 * install record, so with no record (`installedAt`) there is nothing to restore and no dot.
 */
function newerOf(group: DatapackGroup, held: ProjectDatapack | undefined, installedAt: string | undefined): string | undefined {
    if (!held || installedAt === undefined) return undefined;
    return restoreIsNewer(held, group.versions) ? NEWER_SAVE : undefined;
}
