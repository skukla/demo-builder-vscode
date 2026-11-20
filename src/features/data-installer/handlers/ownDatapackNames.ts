/**
 * The names of the SC's own datapacks, which a new one may not take (J3-1). Its own module so the file
 * load's Keep Both (step-07 F1, `datapackZipHandlers.ts`) can read it without importing the save,
 * which reaches the library handlers that import the file load (an import cycle).
 *
 * @module features/data-installer/handlers/ownDatapackNames
 */

import { resolveDataInstallerAccess } from './dataInstallerHandlers';
import type { HandlerContext } from '@/types/handlers';

const LOG_PREFIX = '[Data Installer]';

/**
 * The names of the SC's own datapacks in the library, as the Datapacks screen counts them
 * (`ownedOf`): a new one may not take one (J3-1). The projects list's save question reads it too
 * (`projectsBatch.ts`), and so does the file load's Keep Both. None when the library
 * cannot be asked: the library's own name is generated (`packIdFor`), so a repeated display name
 * overwrites nothing.
 */
export async function ownNames(context: HandlerContext): Promise<string[]> {
    return (await readOwnNames(context)) ?? [];
}

/**
 * The same names, or undefined when the library cannot be asked: for a caller that must not take an
 * unread library to mean a name is free (the file load's Keep Both, review of step-07 F1).
 */
export async function readOwnNames(context: HandlerContext): Promise<string[] | undefined> {
    const library = await resolveDataInstallerAccess(context, 'library');
    if (!library.ok) return undefined;
    try {
        const page = await library.client.findDatapacks({});
        return page.items.filter((item) => item.mine === true).map((item) => item.displayName);
    } catch (error) {
        context.debugLogger.debug(`${LOG_PREFIX} Could not read your datapacks' names: ${error instanceof Error ? error.message : String(error)}`);
        return undefined;
    }
}
