/**
 * Actions on a datapack LIBRARY pack: remove or rename your own, or copy one into the
 * Data Installer so it can be installed.
 *
 * - `delete-library-datapack` — remove one of the caller's own library packs; the
 *   undo of loading a file into the library. Library only, by construction: the
 *   library lets only a pack's owner delete it, and the Data Installer has no such
 *   check, so deleting there is offered nowhere in the extension. A pack this SC shared
 *   in a project file says so, without confirm and with it (`sharedInFiles.ts`).
 * - `rename-library-datapack` — change the display name of every version of one of the
 *   caller's own packs (the name in the library cannot change). When it is this demo's
 *   own pack, the project records that the SC named it (datapack-engine step 07).
 * - `copy-library-datapack-to-installer` — make a library pack installable. Install
 *   runs through the Data Installer, which does not hold library packs, so this
 *   reads the whole pack from the library and writes it into the Data Installer;
 *   the existing Import takes over from there. That writes into the catalog other
 *   teams share, so it carries the same guards as loading a file there: the pack
 *   name sent back, and an existing pack is never overwritten.
 *
 * A copy into the Data Installer cannot be undone from the extension — deleting there
 * is withheld for the reason above.
 *
 * @module features/data-installer/handlers/datapackLibraryHandlers
 */

import { DatapackStoreWriter } from '../services/datapackStoreWriter';
import { readPackFromStore, writePackToStore } from '../services/datapackTransfer';
import { myVersions } from '../services/demoPack';
import { sharedInFile, sharedInFileWarning } from '../services/sharedInFiles';
import { resolveDataInstallerAccess } from './dataInstallerHandlers';
import { failure, installerEchoRefusal } from './datapackZipHandlers';
import type { DatapackId } from '@/types/datapack';
import { ErrorCode } from '@/types/errorCodes';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';

const LOG_PREFIX = '[Data Installer]';

export interface DeleteLibraryDatapackPayload {
    datapackName?: string;
    version?: string;
    /** Must be true. Nothing is deleted by default. */
    confirm?: boolean;
}

export interface RenameLibraryDatapackPayload {
    datapackName?: string;
    /** The new name the SC sees. */
    displayName?: string;
    /** Must be true. */
    confirm?: boolean;
}

export interface CopyLibraryDatapackPayload {
    datapackName?: string;
    version?: string;
    /** Must equal `datapackName`: the copy lands in a catalog other teams share. */
    confirmName?: string;
}

function idOf(payload?: { datapackName?: string; version?: string }): DatapackId | undefined {
    return payload?.datapackName && payload.version
        ? { name: payload.datapackName, version: payload.version }
        : undefined;
}

/** The warning a delete of this pack carries, when this SC shared it in a project file. */
function sharedWarning(context: HandlerContext, id: DatapackId): string | undefined {
    const entry = sharedInFile(context.context.globalState, id);
    return entry ? sharedInFileWarning(entry) : undefined;
}

/** When the renamed pack is this demo's own, the project records that the SC named it. */
async function recordRename(context: HandlerContext, name: string, displayName: string): Promise<void> {
    const project = await context.stateManager.getCurrentProject();
    if (project?.ownDatapack?.name !== name) return;
    project.ownDatapack = { name, displayName, renamed: true };
    await context.stateManager.saveProject(project);
}

/** Check the payload: a name, a non-blank new name, and confirm. */
function readRename(payload?: RenameLibraryDatapackPayload): { name: string; displayName: string } | HandlerResponse {
    const name = payload?.datapackName;
    const displayName = payload?.displayName?.trim();
    if (!name || !displayName) return { success: false, error: 'Name the library datapack and the name to give it.' };
    if (payload?.confirm !== true) {
        return {
            success: false,
            error: 'Renaming changes the name everyone sees for this pack. Send confirm:true to proceed.',
            code: ErrorCode.INVALID_OPERATION,
        };
    }
    return { name, displayName };
}

function writerFor(
    context: HandlerContext,
    access: { baseUrl: string; getToken: () => Promise<string>; orgCode?: string },
) {
    return new DatapackStoreWriter({
        baseUrl: access.baseUrl,
        getToken: access.getToken,
        ...(access.orgCode ? { orgCode: access.orgCode } : {}),
        log: (line) => context.debugLogger.debug(`${LOG_PREFIX} ${line}`),
    });
}

export const datapackLibraryHandlers = defineHandlers({
    'delete-library-datapack': async (
        context: HandlerContext,
        payload?: DeleteLibraryDatapackPayload,
    ): Promise<HandlerResponse> => {
        const id = idOf(payload);
        if (!id) {
            return {
                success: false,
                error: 'Name the library datapack and its version to delete.',
            };
        }
        const warning = sharedWarning(context, id);
        if (payload?.confirm !== true) {
            return {
                success: false,
                error: 'Deleting a library datapack cannot be undone. Send confirm:true to proceed.',
                code: ErrorCode.INVALID_OPERATION,
                ...(warning ? { data: { sharedInFile: warning } } : {}),
            };
        }
        const access = await resolveDataInstallerAccess(context, 'library');
        if (!access.ok) return access.response;
        try {
            const result = await writerFor(context, access).deleteDatapack(id);
            if (result === 'not-found') {
                return {
                    success: false,
                    error: `The datapack library has no pack of yours named ${id.name}@${id.version}.`,
                    code: ErrorCode.INVALID_OPERATION,
                };
            }
            context.logger.info(
                `${LOG_PREFIX} Deleted ${id.name}@${id.version} from the datapack library`,
            );
            return {
                success: true,
                data: { datapackName: id.name, version: id.version, deleted: true, ...(warning ? { warning } : {}) },
            };
        } catch (error) {
            return failure(context, error, 'The library datapack could not be deleted.');
        }
    },

    'rename-library-datapack': async (
        context: HandlerContext,
        payload?: RenameLibraryDatapackPayload,
    ): Promise<HandlerResponse> => {
        const input = readRename(payload);
        if ('success' in input) return input;
        const access = await resolveDataInstallerAccess(context, 'library');
        if (!access.ok) return access.response;
        try {
            const versions = await myVersions(access.client, input.name);
            if (versions.length === 0) {
                return {
                    success: false,
                    error: `The datapack library has no pack of yours named ${input.name}.`,
                    code: ErrorCode.INVALID_OPERATION,
                };
            }
            const writer = writerFor(context, access);
            for (const version of versions) await writer.updateDisplayName(version, input.displayName);
            await recordRename(context, input.name, input.displayName);
            context.logger.info(`${LOG_PREFIX} Renamed ${input.name} (${versions.length} versions) in the datapack library`);
            return { success: true, data: { datapackName: input.name, displayName: input.displayName, versions: versions.length } };
        } catch (error) {
            return failure(context, error, 'The library datapack could not be renamed.');
        }
    },

    'copy-library-datapack-to-installer': async (
        context: HandlerContext,
        payload?: CopyLibraryDatapackPayload,
    ): Promise<HandlerResponse> => {
        const id = idOf(payload);
        if (!id) {
            return { success: false, error: 'Name the library datapack and its version to copy.' };
        }
        if (payload?.confirmName !== id.name) {
            return {
                success: false,
                error: installerEchoRefusal(id.name),
                code: ErrorCode.INVALID_OPERATION,
                data: { sharedCatalog: true },
            };
        }
        const library = await resolveDataInstallerAccess(context, 'library');
        if (!library.ok) return library.response;
        const installer = await resolveDataInstallerAccess(context, 'installer');
        if (!installer.ok) return installer.response;
        try {
            const pack = await readPackFromStore(library.client, id, 'library');
            // No `update`: an existing pack in the shared catalog is refused, never replaced.
            const outcome = await writePackToStore(writerFor(context, installer), pack);
            const label = `${id.name}@${id.version}`;
            context.logger.info(
                `${LOG_PREFIX} Copied ${label} from the datapack library into the Data Installer: ${outcome.stored.length} of ${pack.items.length} data types`,
            );
            outcome.failed.forEach((f) =>
                context.logger.warn(`${LOG_PREFIX} ${label}: ${f.reason}`),
            );
            return {
                success: outcome.stored.length > 0,
                ...(outcome.stored.length === 0 ? { error: 'No data type could be copied.' } : {}),
                data: {
                    datapackName: id.name,
                    version: id.version,
                    target: 'installer',
                    ...outcome,
                },
            };
        } catch (error) {
            return failure(context, error, 'The library datapack could not be copied.');
        }
    },
});
