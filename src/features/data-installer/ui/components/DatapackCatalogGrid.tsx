/**
 * The catalog's body under its search band: the empty catalog, the empty filter, or the grid of
 * cards, one per pack name, each wearing the installed check when the pack is on this instance.
 *
 * The demo's own pack (`project.datapack`) wears the check wherever it lives, the SC's library
 * included, opens on the version the demo uses, and marks a newer version (owner, 2026-11-04: it is
 * one of the library's cards, shown as selected, not a section of its own above them).
 *
 * Moved out of `DatapackCatalogView` unchanged (datapack-engine step 05), so the view could host
 * the progress window "Save store changes to this pack" opens without passing the size rule's
 * import limit; the view is its only caller.
 *
 * @module features/data-installer/ui/components/DatapackCatalogGrid
 */

import React from 'react';
import { updateWaiting } from '../../packVersions';
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
     * newer version, since Update is not offered.
     */
    heldFailed?: boolean;
    /** An update left data types of `held` on the older version (step-07 U1): the dot stays. */
    updateBehind?: boolean;
    /** The catalog holds packs this choice leaves out, so an empty Recommended is not an empty catalog. */
    othersListed?: boolean;
}

/** An empty choice's title: Recommended with nothing anywhere is the empty catalog. */
function emptyTitle(show: CatalogShow, othersListed: boolean): string {
    if (show === 'recommended' && !othersListed) return 'No Datapacks Yet';
    return EMPTY_SHOW_TITLE[show] ?? 'No Datapacks Yet';
}

/** Where to look instead. Only your own, Recommended or the whole catalog can be filled from here. */
function emptyDescription(show: CatalogShow, othersListed: boolean): string {
    if (show === 'team' || show === 'installer' || show === 'community') return 'Try All Datapacks';
    if (show === 'recommended' && othersListed) return 'Try All Datapacks';
    if (show === 'yours') return 'Add one from a file.';
    return "Add one from a file, or save this demo's.";
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
    updateBehind = false,
    othersListed = false,
}: DatapackCatalogGridProps): React.JSX.Element {
    if (groups.length === 0) {
        return <EmptyState title={emptyTitle(show, othersListed)} description={emptyDescription(show, othersListed)} />;
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
                        newer={own && !failed ? newerOf(group, held, installedAt, updateBehind) : undefined}
                        installFailed={failed}
                    />
                );
            })}
        </div>
    );
}

/** The amber dot's hover (J9-1, owner 2026-11-14, in J4-1's form). */
const NEWER_VERSION = 'Newer version available';

/**
 * The dot's words for the demo's own pack: present exactly when Update is waiting (`updateWaiting`,
 * the rule the flyout's main button and the handler share): a newer version of the SC's own datapack
 * or Demo Builder's in the library, or types an update left behind. Update needs Demo Builder's
 * install record, so with no record (`installedAt`) there is nothing to update and no dot.
 */
function newerOf(group: DatapackGroup, held: ProjectDatapack | undefined, installedAt: string | undefined, behind: boolean): string | undefined {
    if (!held || installedAt === undefined) return undefined;
    return updateWaiting(held, group.versions, behind) ? NEWER_VERSION : undefined;
}
