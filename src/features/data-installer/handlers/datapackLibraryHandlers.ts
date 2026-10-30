/**
 * Actions on a datapack LIBRARY pack: remove or rename your own, or copy one into the
 * Data Installer so it can be installed.
 *
 * - `delete-library-datapack` — remove one of the caller's own library packs; the
 *   undo of loading a file into the library. Library only, by construction: the
 *   library lets only a pack's owner delete it, and the Data Installer has no such
 *   check, so deleting there is offered nowhere in the extension. A pack this SC shared
 *   in a project file says so, without confirm and with it (`sharedInFiles.ts`). Deleting the
 *   last version of this demo's own pack clears `project.ownDatapack` (`ownPackCleared`).
 * - `rename-library-datapack` — change the display name of every version of one of the
 *   caller's own packs (the name in the library cannot change). When it is this demo's
 *   own pack, the project records that the SC named it (datapack-engine step 07).
 * - `share-library-datapack` — share every version of one of the caller's own packs with everyone
 *   the library admits, or stop sharing it (owner, 2026-10-30): the library's owner-only
 *   `update-datapack-metadata`, its `shared` field. Confirm-gated, since a shared pack is seen and
 *   installed by the whole team.
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
import { sharedInFileWarningFor } from '../services/sharedInFiles';
import { SHARE_CONSENT } from '../shareWording';
import { resolveDataInstallerAccess } from './dataInstallerHandlers';
import { failure, installerEchoRefusal } from './datapackZipHandlers';
import { packReadsFor } from './recordedPackHandlers';
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

export interface ShareLibraryDatapackPayload {
    datapackName?: string;
    /** True to share, false to stop sharing. */
    shared?: boolean;
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
function sharedWarning(context: HandlerContext, id: DatapackId): Promise<string | undefined> {
    return sharedInFileWarningFor(context.context.globalState, id, packReadsFor(context));
}

/** When the renamed pack is this demo's own, the project records that the SC named it. */
async function recordRename(context: HandlerContext, name: string, displayName: string): Promise<void> {
    const project = await context.stateManager.getCurrentProject();
    if (project?.ownDatapack?.name !== name) return;
    project.ownDatapack = { name, displayName, renamed: true };
    await context.stateManager.saveProject(project);
}

/**
 * After a delete: when it was this demo's own pack and the library now holds no version of it
 * that is the SC's, the project stops naming it, so the dashboard's Datapacks tile drops its
 * "This demo's pack" line. The next save makes the pack again. A library that cannot be asked
 * leaves the project as it was; the delete itself already happened.
 *
 * @returns true when the project's own pack was cleared
 */
async function clearOwnPackIfGone(
    context: HandlerContext,
    client: Parameters<typeof myVersions>[0],
    name: string,
): Promise<boolean> {
    const project = await context.stateManager.getCurrentProject();
    if (project?.ownDatapack?.name !== name) return false;
    try {
        if ((await myVersions(client, name)).length > 0) return false;
    } catch (error) {
        context.debugLogger.debug(`${LOG_PREFIX} Could not check what is left of ${name}: ${String(error)}`);
        return false;
    }
    delete project.ownDatapack;
    await context.stateManager.saveProject(project);
    return true;
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

/** Check the payload: a name, whether to share, and confirm. */
function readShare(payload?: ShareLibraryDatapackPayload): { name: string; shared: boolean } | HandlerResponse {
    const name = payload?.datapackName;
    if (!name || typeof payload?.shared !== 'boolean') return { success: false, error: 'Name the library datapack, and whether to share it.' };
    if (payload.confirm !== true) {
        const why = payload.shared ? SHARE_CONSENT : 'Stopping sharing takes this pack out of everyone else\'s list.';
        return { success: false, error: `${why} Send confirm:true to proceed.`, code: ErrorCode.INVALID_OPERATION };
    }
    return { name, shared: payload.shared };
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
        const warning = await sharedWarning(context, id);
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
            const ownPackCleared = await clearOwnPackIfGone(context, access.client, id.name);
            return {
                success: true,
                data: {
                    datapackName: id.name,
                    version: id.version,
                    deleted: true,
                    ...(warning ? { warning } : {}),
                    ...(ownPackCleared ? { ownPackCleared } : {}),
                },
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

    'share-library-datapack': async (
        context: HandlerContext,
        payload?: ShareLibraryDatapackPayload,
    ): Promise<HandlerResponse> => {
        const input = readShare(payload);
        if ('success' in input) return input;
        const access = await resolveDataInstallerAccess(context, 'library');
        if (!access.ok) return access.response;
        try {
            const versions = await myVersions(access.client, input.name);
            if (versions.length === 0) {
                return { success: false, error: `The datapack library has no pack of yours named ${input.name}.`, code: ErrorCode.INVALID_OPERATION };
            }
            const writer = writerFor(context, access);
            for (const version of versions) await writer.updateShared(version, input.shared);
            context.logger.info(`${LOG_PREFIX} ${input.shared ? 'Shared' : 'Stopped sharing'} ${input.name} (${versions.length} versions) in the datapack library`);
            return { success: true, data: { datapackName: input.name, shared: input.shared, versions: versions.length } };
        } catch (error) {
            return failure(context, error, input.shared ? 'The library datapack could not be shared.' : 'The library datapack could not stop being shared.');
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
