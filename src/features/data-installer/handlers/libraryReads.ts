/**
 * The datapack library's reads, opened when a pack is first read from it.
 *
 * Every engine build that may read a library pack takes this (the screen's import, the
 * preview and save of store changes, and creation's install), so it was written out three
 * times before it lived here.
 *
 * @module features/data-installer/handlers/libraryReads
 */

import type { DatapackEngineAccess } from '../services/buildDatapackEngine';
import { resolveDataInstallerAccess } from './dataInstallerHandlers';
import type { HandlerContext } from '@/types/handlers';

/** The sentence an engine build answers when a library pack meets the service engine. */
export const SERVICE_INSTALLS_ONLY_ITS_OWN =
    'The Data Installer service installs only packs in its own catalog. Copy this one to the Data Installer first, ' +
    'or set demoBuilder.dataInstaller.engine to demo-builder.';

/**
 * Open the library's reads for this context.
 *
 * @throws Error when the library cannot be reached
 */
export function libraryReads(context: HandlerContext): NonNullable<DatapackEngineAccess['libraryCatalog']> {
    return async () => {
        const library = await resolveDataInstallerAccess(context, 'library');
        if (!library.ok) throw new Error('The datapack library is not reachable.');
        return library.client;
    };
}
