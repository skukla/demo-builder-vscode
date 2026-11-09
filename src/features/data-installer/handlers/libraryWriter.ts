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
import { rememberPackName } from '../services/packNames';
import { resolveDataInstallerAccess } from './dataInstallerHandlers';
import type { Project } from '@/types/base';
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
        inParts: true,
    });
    return { ok: true, client: access.client, writer };
}

/**
 * A library pack's display name, as the Datapacks screen shows it (F17: the reset confirm showed its
 * id, "kukla-justrite-a80dca"). Undefined for a pack outside the library, or a library that does not
 * answer: the caller falls back. Read by the Reset Selected confirm and the dashboard's Datapacks
 * card (owner, 2026-11-07). Every name read is remembered (`packNames`), so the card can show it at
 * once next time.
 *
 * @param context - a context with no `panel` reads without asking the SC to sign in
 */
export async function libraryDisplayName(context: HandlerContext, held: NonNullable<Project['datapack']>): Promise<string | undefined> {
    if (held.store !== 'library') return undefined;
    try {
        const library = await openLibraryWriter(context);
        if (!library.ok) return undefined;
        const page = await library.client.findDatapacks({ datapackName: held.name });
        const name = page.items.find((item) => item.id.name === held.name)?.displayName;
        if (name) await rememberPackName(context.context.globalState, held.name, name);
        return name;
    } catch (error) {
        context.debugLogger.debug(`[Data Installer] Could not read ${held.name}'s display name: ${error instanceof Error ? error.message : String(error)}`);
        return undefined;
    }
}
