/**
 * The datapack library opened for writing: its reads and a writer signed in as the SC.
 *
 * Deleting a project's own pack and following a project rename into its pack (step 07) both
 * need the library's list of the SC's versions and its writes, opened the way every library
 * write opens it (`resolveDataInstallerAccess` with `library`, the org named on every write).
 *
 * @module features/data-installer/handlers/libraryWriter
 */

import type { DataInstallerClient } from '../services/dataInstallerClient';
import { DatapackStoreWriter } from '../services/datapackStoreWriter';
import { resolveDataInstallerAccess } from './dataInstallerHandlers';
import type { HandlerContext } from '@/types/handlers';

/** The library's reads and writes, or why it cannot be opened. */
export type OpenedLibrary =
    | { ok: true; client: DataInstallerClient; writer: DatapackStoreWriter }
    | { ok: false; reason: string };

/**
 * Open the datapack library as the signed-in SC.
 *
 * @param context - the handler context; its debug logger gets one line per library call
 */
export async function openLibraryWriter(context: HandlerContext): Promise<OpenedLibrary> {
    const access = await resolveDataInstallerAccess(context, 'library');
    if (!access.ok) return { ok: false, reason: access.response.error ?? 'The datapack library is not reachable.' };
    const writer = new DatapackStoreWriter({
        baseUrl: access.baseUrl,
        getToken: access.getToken,
        ...(access.orgCode ? { orgCode: access.orgCode } : {}),
        log: (line) => context.debugLogger.debug(`[Data Installer] ${line}`),
    });
    return { ok: true, client: access.client, writer };
}
