/**
 * After a save: delete the datapack's saves older than the new one and the one before it (Phase 2,
 * D3; owner, 2026-11-10: storage keeps two saves). Never a named version, never a save a project on
 * this machine uses, never one a project file shared (`sharedInFiles.ts`), and never anything when
 * the save was a Save As, which made a new datapack with one save.
 *
 * The library may not list the save just written yet, so the new save is counted in by name. A trim
 * that fails is logged and never fails the save: the save already happened.
 *
 * @module features/data-installer/handlers/trimSaves
 */

import { myVersions } from '../services/demoPack';
import { savesToTrim } from '../services/saveTrim';
import { sharedInFile } from '../services/sharedInFiles';
import type { DataInstallerAccess } from './dataInstallerHandlers';
import { savesInUse } from './datapackInUse';
import { deleteVersionWithLayer } from './datapackLibraryHandlers';
import type { DatapackId } from '@/types/datapack';
import type { HandlerContext } from '@/types/handlers';

const LOG_PREFIX = '[Data Installer]';

/**
 * Trim the saved datapack's old saves.
 *
 * @param context - the handler context
 * @param access - the library's access, already granted for the save
 * @param saved - the save just written
 * @returns the versions deleted
 */
export async function trimOldSaves(
    context: HandlerContext,
    access: Extract<DataInstallerAccess, { ok: true }>,
    saved: DatapackId,
): Promise<string[]> {
    const deleted: string[] = [];
    try {
        const listed = (await myVersions(access.client, saved.name)).map((id) => id.version);
        const versions = listed.includes(saved.version) ? listed : [...listed, saved.version];
        const keep = await savesInUse(context, saved.name);
        keep.add(saved.version);
        for (const version of versions) {
            if (sharedInFile(context.context.globalState, { name: saved.name, version })) keep.add(version);
        }
        for (const version of savesToTrim(versions, keep)) {
            if ((await deleteVersionWithLayer(context, access, { name: saved.name, version })) === 'deleted') deleted.push(version);
        }
        if (deleted.length > 0) context.logger.info(`${LOG_PREFIX} Kept two saves of ${saved.name}; deleted ${deleted.join(', ')}`);
    } catch (error) {
        context.debugLogger.debug(`${LOG_PREFIX} Could not delete the older saves of ${saved.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
    return deleted;
}
