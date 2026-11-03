/**
 * The list of datapacks every surface shows: Demo Builder's datapack store first, then whatever
 * the Data Installer adds if it answers (owner, 2026-11-03). The store is the source we promise.
 * The Data Installer is an extra, asked at each load, so nothing has to change if access to it
 * comes or goes, and an SC can have it while a colleague does not.
 *
 * - A pack in both shows once, as the store's, so every SC gets the same data under one name.
 * - The store's own default is its team packs and the SC's own; a colleague's shared pack is
 *   community, behind the same switch as the Data Installer's non-curated packs.
 *
 * @module features/data-installer/handlers/catalogLibraryRows
 */

import type { DataInstallerClient } from '../services/dataInstallerClient';
import { resolveDataInstallerBaseUrl, selectedDatapackEngine } from '../services/dataInstallerConfig';
import type { CatalogPage, DatapackSummary, Page } from '../types';
import type { HandlerResponse } from '@/types/handlers';

export const LIBRARY_LIST_FAILED = 'Could not list the datapack store.';

/** The store's catalog, each row tagged `library`: shared packs plus the SC's own. */
export async function listLibrary(
    client: DataInstallerClient,
    paging: { limit?: number; skip?: number },
): Promise<Page<DatapackSummary>> {
    const listed = await client.findDatapacks(paging);
    return { ...listed, items: listed.items.map((item) => ({ ...item, store: 'library' as const })) };
}

/** Whether a store row is in the default list: a team pack or the SC's own. */
function inDefaultList(item: DatapackSummary): boolean {
    return item.team === true || item.mine === true;
}

/** Why the Data Installer's rows are absent: never asked, or asked and not answered. */
function whyMissing(): NonNullable<CatalogPage['installerMissing']> {
    const address = resolveDataInstallerBaseUrl();
    return !address.ok && address.reason === 'not-configured' ? 'no-address' : 'no-answer';
}

/**
 * The two answers as one list. Fails only when neither store answered, with the store's reason,
 * so a sign-in problem still reads as one.
 *
 * @param library - the store's answer
 * @param installer - the Data Installer's answer
 * @param includeCommunity - whether a colleague's shared pack is listed
 */
export function mergedCatalog(
    library: HandlerResponse,
    installer: HandlerResponse,
    includeCommunity: boolean,
): HandlerResponse {
    if (!library.success && !installer.success) return library;
    const own = library.success ? (library.data as Page<DatapackSummary>).items : [];
    const names = new Set(own.map((item) => item.id.name));
    const theirs = installer.success ? (installer.data as Page<DatapackSummary>).items : [];
    const items = [
        ...own.filter((item) => includeCommunity || inDefaultList(item)),
        ...theirs.filter((item) => !names.has(item.id.name)),
    ];
    const page: CatalogPage = {
        items,
        // No `total`: the two stores' totals do not add up to anything a caller can use.
        count: items.length,
        engine: selectedDatapackEngine(),
        ...(library.success ? {} : { storeMissing: true }),
        ...(installer.success ? {} : { installerMissing: whyMissing() }),
    };
    return { success: true, data: page };
}
