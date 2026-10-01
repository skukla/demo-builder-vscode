/**
 * Actions on a datapack LIBRARY pack: remove your own, or copy one into the Data
 * Installer so it can be installed.
 *
 * - `delete-library-datapack` — remove one of the caller's own library packs; the
 *   undo of loading a file into the library. Library only, by construction: the
 *   library lets only a pack's owner delete it, and the Data Installer has no such
 *   check, so deleting there is offered nowhere in the extension.
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
import type { DatapackId } from '../types';
import { resolveDataInstallerAccess } from './dataInstallerHandlers';
import { failure, installerEchoRefusal } from './datapackZipHandlers';
import { ErrorCode } from '@/types/errorCodes';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';

const LOG_PREFIX = '[Data Installer]';

export interface DeleteLibraryDatapackPayload {
    datapackName?: string;
    version?: string;
    /** Must be true. Nothing is deleted by default. */
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

function writerFor(
    context: HandlerContext,
    access: { baseUrl: string; getToken: () => Promise<string> },
) {
    return new DatapackStoreWriter({
        baseUrl: access.baseUrl,
        getToken: access.getToken,
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
        if (payload?.confirm !== true) {
            return {
                success: false,
                error: 'Deleting a library datapack cannot be undone. Send confirm:true to proceed.',
                code: ErrorCode.INVALID_OPERATION,
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
                data: { datapackName: id.name, version: id.version, deleted: true },
            };
        } catch (error) {
            return failure(context, error, 'The library datapack could not be deleted.');
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
