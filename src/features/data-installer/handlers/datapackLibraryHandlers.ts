/**
 * Actions on a datapack LIBRARY pack: remove or rename your own, or copy one into the
 * Data Installer so it can be installed.
 *
 * - `delete-library-datapack` — remove one of the caller's own library packs; the
 *   undo of loading a file into the library. Library only, by construction: the
 *   library lets only a pack's owner delete it, and the Data Installer has no such
 *   check, so deleting there is offered nowhere in the extension. A pack this SC shared
 *   in a project file says so, without confirm and with it (`sharedInFiles.ts`). A version takes
 *   its settings layer of the same version with it (step 09): a save writes the two together, and
 *   is undone by deleting the version.
 * - `rename-library-datapack` — change the display name of every version of one of the
 *   caller's own packs (the name in the library cannot change).
 * - `share-library-datapack` — share every version of one of the caller's own packs with everyone
 *   the library admits, or stop sharing it (owner, 2026-10-30): the library's owner-only
 *   `update-datapack-metadata`, its `shared` field. Confirm-gated, since a shared pack is seen and
 *   installed by the whole team. Its settings layer goes with it (step 09), or a colleague would
 *   install the pack without the settings its owner gets.
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

import { settingsLayerName } from '../services/datapackCatalog';
import { DatapackStoreWriter } from '../services/datapackStoreWriter';
import { readPackFromStore, writePackToStore } from '../services/datapackTransfer';
import { myVersions } from '../services/demoPack';
import { toInstallerForm } from '../services/installerForm';
import { myLayerVersions } from '../services/settingsLayer';
import { sharedInFileWarningFor } from '../services/sharedInFiles';
import { SHARE_CONSENT } from '../shareWording';
import { resolveDataInstallerAccess } from './dataInstallerHandlers';
import { failure, installerEchoRefusal } from './datapackZipHandlers';
import { packReadsFor } from './recordedPackHandlers';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';
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

export interface MarkTeamDatapackPayload {
    datapackName?: string;
    team?: boolean;
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
    store: DatapackStoreName,
) {
    return new DatapackStoreWriter({
        baseUrl: access.baseUrl,
        getToken: access.getToken,
        ...(access.orgCode ? { orgCode: access.orgCode } : {}),
        log: (line) => context.debugLogger.debug(`${LOG_PREFIX} ${line}`),
        // Only Demo Builder's own store takes a large list in parts (`itemParts.ts`).
        inParts: store === 'library',
    });
}

/**
 * After a delete: the SC's own settings layer of the same version goes too. A library that cannot
 * be asked leaves it; the delete itself already happened, and the answer says so.
 */
async function deleteLayerOf(
    context: HandlerContext,
    access: Parameters<typeof writerFor>[1] & { client: Parameters<typeof myLayerVersions>[0] },
    id: DatapackId,
): Promise<{ settingsLayerDeleted?: true; settingsLayerLeft?: string }> {
    try {
        const same = (await myLayerVersions(access.client, id.name)).find((row) => row.id.version === id.version);
        if (!same) return {};
        await writerFor(context, access, 'library').deleteDatapack(same.id);
        return { settingsLayerDeleted: true };
    } catch (error) {
        context.debugLogger.debug(`${LOG_PREFIX} Could not delete the settings layer of ${id.name}@${id.version}: ${String(error)}`);
        return { settingsLayerLeft: `${settingsLayerName(id.name)}@${id.version} may still be in the library: it could not be checked.` };
    }
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
            const result = await writerFor(context, access, 'library').deleteDatapack(id);
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
            const layer = await deleteLayerOf(context, access, id);
            return {
                success: true,
                data: {
                    datapackName: id.name,
                    version: id.version,
                    deleted: true,
                    ...(warning ? { warning } : {}),
                    ...layer,
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
            const writer = writerFor(context, access, 'library');
            for (const version of versions) await writer.updateDisplayName(version, input.displayName);
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
            const writer = writerFor(context, access, 'library');
            for (const version of versions) await writer.updateShared(version, input.shared);
            const layers = await myLayerVersions(access.client, input.name);
            for (const layer of layers) await writer.updateShared(layer.id, input.shared);
            context.logger.info(`${LOG_PREFIX} ${input.shared ? 'Shared' : 'Stopped sharing'} ${input.name} (${versions.length} versions) in the datapack library`);
            return { success: true, data: { datapackName: input.name, shared: input.shared, versions: versions.length, ...(layers.length > 0 ? { settingsLayerVersions: layers.length } : {}) } };
        } catch (error) {
            return failure(context, error, input.shared ? 'The library datapack could not be shared.' : 'The library datapack could not stop being shared.');
        }
    },

    'mark-team-datapack': async (
        context: HandlerContext,
        payload?: MarkTeamDatapackPayload,
    ): Promise<HandlerResponse> => {
        const name = payload?.datapackName;
        if (!name || typeof payload?.team !== 'boolean') {
            return { success: false, error: 'Name the datapack, and say whether it is a team datapack.' };
        }
        const access = await resolveDataInstallerAccess(context, 'library');
        if (!access.ok) return access.response;
        try {
            const versions = await myVersions(access.client, name);
            if (versions.length === 0) {
                return { success: false, error: `Demo Builder's datapack store has no pack of yours named ${name}.`, code: ErrorCode.INVALID_OPERATION };
            }
            const writer = writerFor(context, access, 'library');
            for (const version of versions) await writer.updateTeam(version, payload.team);
            context.logger.info(`${LOG_PREFIX} ${payload.team ? 'Marked' : 'Unmarked'} ${name} as a team datapack (${versions.length} versions).`);
            return { success: true, data: { datapackName: name, team: payload.team, versions: versions.length } };
        } catch (error) {
            return failure(context, error, 'The team datapack mark could not be changed.');
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
            // In the Data Installer's form, or refused, before anything is sent (`installerForm.ts`).
            const { pack, changes } = toInstallerForm(await readPackFromStore(library.client, id, 'library'));
            // No `update`: an existing pack in the shared catalog is refused, never replaced.
            const outcome = await writePackToStore(writerFor(context, installer, 'installer'), pack);
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
                    ...(changes.length > 0 ? { changed: changes } : {}),
                },
            };
        } catch (error) {
            return failure(context, error, 'The library datapack could not be copied.');
        }
    },
});
