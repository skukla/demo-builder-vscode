/**
 * The Show list on the Datapacks screen and the wizard's Datapacks step (owner, 2026-11-05): which
 * packs the catalog draws, and in what order. It replaced the Community and Data Installer switches, each of which asked the servers
 * again and showed its wait on the Refresh button. The catalog now loads once and this filters what
 * it holds, so changing it has nothing to wait for.
 *
 * @module features/data-installer/ui/catalogShow
 */

import type { DatapackGroup } from '../services/datapackCatalog';

/** Where a pack comes from, as an SC would say it. */
export type PackSource = 'yours' | 'team' | 'installer' | 'community';

/**
 * Where a pack comes from. Team before Yours (owner, 2026-11-03): a team pack is the store's,
 * whoever uploaded it. Every Data Installer pack is the Data Installer's, curated or not (owner,
 * 2026-11-05: its uncurated packs read as mislabelled under Community); Community is colleagues'.
 *
 * @param group - the pack
 * @returns its source
 */
export function packSource(group: DatapackGroup): PackSource {
    if (group.store === 'library') {
        if (group.team) return 'team';
        return group.mine ? 'yours' : 'community';
    }
    return 'installer';
}

export type CatalogShow = 'recommended' | PackSource | 'all';

/** Every pack each source has: the Show list filters what comes back. */
export const CATALOG_REQUEST = { includeCommunity: true };

/**
 * What the list opens on: your packs, the team's, and the Data Installer's curated ones. Not
 * Community, and not the Data Installer's uncurated packs: both are mostly people's test packs.
 */
export const DEFAULT_SHOW: CatalogShow = 'recommended';

const SHOW_OPTIONS: ReadonlyArray<{ key: CatalogShow; label: string }> = [
    { key: 'recommended', label: 'Recommended' },
    { key: 'yours', label: 'My Datapacks' },
    { key: 'team', label: 'Demo Builder Datapacks' },
    { key: 'installer', label: 'Data Installer Datapacks' },
    { key: 'community', label: 'Community Datapacks' },
    { key: 'all', label: 'All Datapacks' },
];

/**
 * The list's choices. An SC the Data Installer has not answered has no such packs to choose.
 *
 * @param installerAnswered - whether the Data Installer answered this load
 * @returns the choices, in order
 */
export function showOptions(installerAnswered: boolean): ReadonlyArray<{ key: CatalogShow; label: string }> {
    return installerAnswered ? SHOW_OPTIONS : SHOW_OPTIONS.filter((option) => option.key !== 'installer');
}

/** What a Show choice with nothing in it says. Recommended and All mean the catalog is empty. */
export const EMPTY_SHOW_TITLE: Partial<Record<CatalogShow, string>> = {
    yours: "You Don't Have Any Datapacks",
    team: 'No Demo Builder Datapacks',
    installer: 'No Data Installer Datapacks',
    community: 'No Community Datapacks',
};

/**
 * Whether a pack is in a choice.
 *
 * @param group - the pack
 * @param show - the choice
 * @returns whether to draw it
 */
export function inShow(group: DatapackGroup, show: CatalogShow): boolean {
    if (show === 'all') return true;
    const source = packSource(group);
    if (show === 'recommended') return source === 'installer' ? group.shared : source !== 'community';
    // The SC's own shared pack is where its share said it would be, too (owner, 2026-11-05).
    if (show === 'community' && source === 'yours' && group.shared) return true;
    return source === show;
}

/**
 * The order the cards draw in: the pack this demo uses, then Yours, then the rest, A to Z in each.
 *
 * @param groups - the packs
 * @param inUse - whether this demo uses a pack
 * @returns a new sorted array
 */
export function inShowOrder(groups: DatapackGroup[], inUse: (group: DatapackGroup) => boolean): DatapackGroup[] {
    const rank = (group: DatapackGroup): number => {
        if (inUse(group)) return 0;
        return packSource(group) === 'yours' ? 1 : 2;
    };
    return [...groups].sort((a, b) => rank(a) - rank(b) || a.displayName.localeCompare(b.displayName));
}
