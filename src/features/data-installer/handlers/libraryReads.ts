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

/**
 * The sentence a removal answers when the Data Installer service installed the pack: Demo Builder
 * has no record of what it added, and never removes by name (step s4, DI-12).
 */
export const SERVICE_REMOVAL_UNAVAILABLE =
    'The Data Installer installed this datapack, so Demo Builder has no record of what it added. Use Clear Demo Data to remove it.';

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
