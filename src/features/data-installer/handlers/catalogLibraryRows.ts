/**
 * The catalog the Data Installer screen shows: the Data Installer's packs and the library's. They are
 * separate services, so either one's failure costs only its own rows, with the reason said.
 *
 * @module features/data-installer/handlers/catalogLibraryRows
 */

import type { DataInstallerClient } from '../services/dataInstallerClient';
import { selectedDatapackEngine } from '../services/dataInstallerConfig';
import type { CatalogPage, DatapackSummary, Page } from '../types';
import type { HandlerResponse } from '@/types/handlers';

export const LIBRARY_LIST_FAILED = 'Could not list the datapack library.';

/**
 * The library's catalog, each row tagged `library`.
 *
 * No curation filter: the library already answers each SC with the shared packs
 * plus their own, and their own are exactly what they came to find.
 */
export async function listLibrary(
    client: DataInstallerClient,
    paging: { limit?: number; skip?: number },
): Promise<Page<DatapackSummary>> {
    const listed = await client.findDatapacks(paging);
    return { ...listed, items: listed.items.map((item) => ({ ...item, store: 'library' as const })) };
}

/**
 * The Data Installer's page with the library's rows added.
 *
 * A library that cannot be reached costs only its own rows: the Data Installer's
 * catalog still shows, and the reason travels as `libraryError` so the panel can
 * say why the library is missing rather than silently showing less.
 */
export async function withLibraryRows(
    installer: Page<DatapackSummary>,
    askLibrary: () => Promise<HandlerResponse>,
): Promise<HandlerResponse> {
    const library = await askLibrary();
    if (!library.success) {
        const libraryError = library.error ?? LIBRARY_LIST_FAILED;
        return { success: true, data: { ...installer, libraryError, engine: selectedDatapackEngine() } satisfies CatalogPage };
    }
    const extra = (library.data as Page<DatapackSummary>).items;
    // No `total`: the two stores' totals do not add up to anything a caller can use.
    const merged: CatalogPage = {
        items: [...installer.items, ...extra],
        count: installer.count + extra.length,
        engine: selectedDatapackEngine(),
    };
    return { success: true, data: merged };
}

/**
 * The library's rows alone, when the Data Installer would not answer: a refused catalog costs only its
 * own rows, and the reason travels as `installerError` (owner, 2026-11-03). A library that cannot
 * answer either leaves the Data Installer's failure as it was.
 */
export async function libraryWithoutInstaller(
    installer: HandlerResponse,
    askLibrary: () => Promise<HandlerResponse>,
): Promise<HandlerResponse> {
    const library = await askLibrary();
    if (!library.success) return installer;
    const page: CatalogPage = {
        ...(library.data as Page<DatapackSummary>),
        installerError: installer.error ?? 'Could not list datapacks.',
        engine: selectedDatapackEngine(),
    };
    return { success: true, data: page };
}
