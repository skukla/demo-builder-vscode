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
 * Where a pack comes from. Team (Demo Builder's) before Yours (owner, 2026-11-03): a team pack is the store's,
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
    // As its cards' tag says (step-04 S6, J8-2, owner 2026-11-12); the key stays `team`.
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

/** A choice's name, as the Show list reads it. */
function showLabel(show: CatalogShow): string {
    return SHOW_OPTIONS.find((option) => option.key === show)?.label ?? show;
}

/** Where a filter's matches sit when the current choice holds none of them. */
export interface ShowElsewhere {
    show: CatalogShow;
    count: number;
}

/** The choices a match can be filed under, most particular first. */
const SOURCE_SHOWS: readonly PackSource[] = ['yours', 'team', 'installer', 'community'];

/**
 * Where the filter's matches are, when the choice on view holds none (Clarity 1.13, step-04 S10):
 * the one source choice that holds them all, or All Datapacks when they are spread.
 *
 * @param matches - every pack the filter matches, before the Show list
 * @param show - the choice on view
 * @returns where they are, or nothing when there are none or the choice is already All
 */
export function matchesElsewhere(matches: readonly DatapackGroup[], show: CatalogShow): ShowElsewhere | undefined {
    if (show === 'all' || matches.length === 0) return undefined;
    const holder = SOURCE_SHOWS.find((source) => source !== show && matches.every((group) => inShow(group, source)));
    return { show: holder ?? 'all', count: matches.length };
}

/**
 * The note's sentence: where nothing matched, and where the matches are. The button after it is
 * `ShowElsewhereNote`'s, from a table of written-out labels the Title Case scan reads.
 *
 * @param show - the choice on view
 * @param elsewhere - where the matches are
 * @returns the sentence
 */
export function elsewhereWords(show: CatalogShow, elsewhere: ShowElsewhere): string {
    return `No matches in ${showLabel(show)}. ${elsewhere.count} in ${showLabel(elsewhere.show)}.`;
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
