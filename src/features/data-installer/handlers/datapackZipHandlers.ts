/**
 * Datapack files: save a pack from a store to a zip, and load a zip into a store.
 *
 * Neither store has a file form (owner, 2026-10-01: "an optional export to zip …
 * Import should follow the same approach"), so the file is built and read here and
 * works the same for the Data Installer and the datapack library.
 *
 * Three message types:
 * - `save-datapack-zip` — read a pack from `source`, write the file.
 * - `open-datapack-zip` — read a file and say what is in it. Writes nothing; it is
 *   how the SC sees name, version and types before choosing where it goes.
 * - `load-datapack-zip` — write the file's pack into `target`; with `saveAs` (Keep Both, step-07 F1)
 *   as a new datapack of the SC's under that name, the one already there left as it is.
 *
 * A pack's settings layer travels with it (step 09, `settingsLayerFile.ts`): the save carries it as
 * the file's second section, and the load puts it in the library, wherever the data goes.
 *
 * Removing a library pack (the undo of a load) and copying one into the Data
 * Installer act on packs, not files: `datapackLibraryHandlers.ts`.
 *
 * Where files go, by surface (the demo bundle export's rule): from the panel, VS
 * Code's own save/open dialogs; from an agent, a path that must resolve inside the
 * open project. A path the panel sends back to `load` must be one its open dialog
 * returned, or inside the project — the webview cannot name an arbitrary file.
 *
 * Writing into the Data Installer writes into the catalog other teams share; the
 * agent tool guards that with a name echo, the panel with its own confirm step.
 *
 * @module features/data-installer/handlers/datapackZipHandlers
 */

import * as vscode from 'vscode';
import { nameProblem } from '../saveAsName';
import { DataInstallerApiError } from '../services/dataInstallerErrors';
import { layerWords, settingsLayerName } from '../services/datapackCatalog';
import { DatapackStoreWriter } from '../services/datapackStoreWriter';
import {
    DatapackTransferError,
    readPackFromStore,
    writePackToStore,
} from '../services/datapackTransfer';
import {
    buildDatapackZip,
    type DatapackFile,
    datapackZipName,
    DatapackZipError,
    readDatapackZip,
} from '../services/datapackZip';
import { packIdFor } from '../services/demoPack';
import { InstallerFormError, toInstallerForm } from '../services/installerForm';
import { resolveDataInstallerAccess } from './dataInstallerHandlers';
import { projectPath, readPackFile, writeZip } from './datapackFiles';
import { readOwnNames } from './ownDatapackNames';
import { fileLayerFacts, loadFileLayer, withFileLayer } from './settingsLayerFile';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';
import { ErrorCode } from '@/types/errorCodes';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';

const LOG_PREFIX = '[Data Installer]';
const ZIP_FILTER = { 'Datapack file': ['zip'] };

/** Keep Both makes a datapack of the SC's own, which only My Datapacks can hold. */
export const KEEP_BOTH_LIBRARY_ONLY = 'Keep Both adds a datapack to My Datapacks only.';

/** Keep Both's name could not be checked against the SC's datapacks, so nothing was written. */
export const KEEP_BOTH_NAMES_UNREAD = "My Datapacks couldn't be read to check the name, so nothing was added. Try again.";

export const INSTALLER_UPDATE_REFUSED =
    "Updating an existing datapack in the Data Installer is not offered: it cannot tell whose datapack it is, so an update could overwrite a colleague's data. Load it under a new version, or into the datapack library.";

/** Files the panel's open dialog returned this session — the only outside paths `load` accepts. */
const openedByDialog = new Set<string>();

export interface SaveDatapackZipPayload {
    source?: DatapackStoreName;
    datapackName?: string;
    version?: string;
    /** Agent: where to write, inside the project. Panel: omit to be asked. */
    path?: string;
    /** Save only these data types; omit to save them all. Each must be one the pack holds. */
    dataTypes?: string[];
}

export interface OpenDatapackZipPayload {
    /** Agent: the file, inside the project. Panel: omit to be asked. */
    path?: string;
}

export interface LoadDatapackZipPayload {
    path?: string;
    target?: DatapackStoreName;
    /** Replace the types this file carries in a pack that already exists. Library only. */
    update?: boolean;
    /** Into the Data Installer only: must equal the pack's name, as proof of intent. */
    confirmName?: string;
    /**
     * Keep Both (step-07 F1): add the file as a new datapack of the SC's under this name, leaving the
     * one already there as it is. Library only, never with `update`; a name the SC has is refused.
     */
    saveAs?: string;
}

/**
 * The file's pack as a new datapack under the name the SC gave: the library's own name is made from
 * it (`packIdFor`), and its settings layer follows that name and is named for it (`layerWords`, as a
 * save names its layer), so nothing already there is written.
 */
function asNewDatapack(pack: DatapackFile, displayName: string): DatapackFile {
    const name = packIdFor(displayName);
    const layer = pack.settingsLayer;
    return {
        ...pack,
        id: { name, version: pack.id.version },
        displayName,
        ...(layer ? { settingsLayer: { ...layer, id: { name: settingsLayerName(name), version: layer.id.version }, ...layerWords(displayName) } } : {}),
    };
}

/**
 * A datapack this load created in My Datapacks and could put nothing in is deleted before the load
 * answers (review of step-07 F1/F2): left, it was an empty datapack with no Delete offered, holding
 * the name Keep Both took. Never in the Data Installer, which this feature never deletes from; never
 * a pack the load only updated. No layer was loaded for it (`loadFileLayer` runs only after a type
 * landed), so there is nothing else to take.
 */
async function removeIfEmpty(
    context: HandlerContext,
    load: { writer: DatapackStoreWriter; target: DatapackStoreName; id: DatapackId; outcome: { pack: string; stored: string[] } },
): Promise<{ removed?: true; removedNot?: string }> {
    const { writer, target, id, outcome } = load;
    if (target !== 'library' || outcome.pack !== 'created' || outcome.stored.length > 0) return {};
    try {
        await writer.deleteDatapack(id);
        return { removed: true };
    } catch (error) {
        context.logger.warn(`${LOG_PREFIX} Could not delete the empty ${id.name}@${id.version}: ${error instanceof Error ? error.message : String(error)}`);
        return { removedNot: `${id.name}@${id.version} may still be in My Datapacks, empty: it could not be deleted.` };
    }
}

/** Keep Both's pack under its new name, or the refusal of a name the SC already has. */
async function keptBoth(context: HandlerContext, pack: DatapackFile, name: string): Promise<DatapackFile | HandlerResponse> {
    const names = await readOwnNames(context);
    // Unread is never taken to mean free: the new datapack could share a name the SC already has.
    if (!names) return { success: false, error: KEEP_BOTH_NAMES_UNREAD, code: ErrorCode.INVALID_OPERATION };
    const taken = nameProblem(name, names);
    return taken ? { success: false, error: taken, code: ErrorCode.INVALID_OPERATION } : asNewDatapack(pack, name);
}

/** Why the load cannot run as sent, before the file is read: Replace or Keep Both where it cannot go. */
function refusedBeforeReading(payload: LoadDatapackZipPayload, target: DatapackStoreName): HandlerResponse | undefined {
    if (target === 'installer' && payload.update) {
        // The library only lets a pack's owner write to it; the Data Installer
        // has no such check, so an update there could overwrite a colleague's pack.
        return { success: false, error: INSTALLER_UPDATE_REFUSED, code: ErrorCode.INVALID_OPERATION };
    }
    if (payload.saveAs === undefined) return undefined;
    if (payload.update) return { success: false, error: 'Choose Replace or Keep Both, not both.', code: ErrorCode.INVALID_OPERATION };
    if (target !== 'library') return { success: false, error: KEEP_BOTH_LIBRARY_ONLY, code: ErrorCode.INVALID_OPERATION };
    return undefined;
}

/** The Data Installer's catalog is shared: any write into it names the pack back first. */
export function installerEchoRefusal(name: string): string {
    return `This writes "${name}" into the Data Installer's catalog, which other teams share. To proceed, send confirmName:"${name}".`;
}

function storeLabel(store: DatapackStoreName): string {
    return store === 'library' ? 'My Datapacks' : 'the Data Installer';
}

/**
 * A refusal this feature explains carries its own sentence (or the store's); anything
 * else is logged in full and the person reads the fallback, never a library's words.
 */
/** What the Data Installer's refusal of a write for who we are says (owner, 2026-11-06: our accounts cannot write to it yet). */
export const INSTALLER_WRITE_REFUSED =
    "Your Adobe account can't add datapacks to the Data Installer: its owners grant that access. " +
    "Datapacks stay in Demo Builder's datapack store, where Demo Builder installs them.";

/** The Data Installer turned a write down for who we are (401 or 403): said plainly, not in its words. */
export function installerWriteRefusal(error: unknown): HandlerResponse | undefined {
    if (!(error instanceof DataInstallerApiError) || (error.status !== 401 && error.status !== 403)) return undefined;
    return { success: false, error: INSTALLER_WRITE_REFUSED, code: ErrorCode.INVALID_OPERATION, data: { sharedCatalog: true } };
}

export function failure(
    context: HandlerContext,
    error: unknown,
    fallback: string,
): HandlerResponse {
    const known =
        error instanceof DatapackZipError ||
        error instanceof DatapackTransferError ||
        error instanceof InstallerFormError ||
        error instanceof DataInstallerApiError;
    if (!known)
        context.logger.error(
            `${LOG_PREFIX} ${fallback}`,
            error instanceof Error ? error : undefined,
        );
    const message = known ? (error as Error).message : fallback;
    return {
        success: false,
        error: message,
        code: known ? ErrorCode.INVALID_OPERATION : ErrorCode.UNKNOWN,
    };
}

async function saveTarget(
    context: HandlerContext,
    given: string | undefined,
    name: string,
): Promise<string | undefined> {
    if (given || !context.panel) return projectPath(context, given ?? name, name);
    const picked = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(name),
        filters: ZIP_FILTER,
        title: 'Save the Datapack File',
    });
    return picked?.fsPath;
}

async function openSource(
    context: HandlerContext,
    given: string | undefined,
): Promise<string | undefined> {
    if (given) {
        if (context.panel && openedByDialog.has(given)) return given;
        return projectPath(context, given);
    }
    if (!context.panel)
        throw new DatapackTransferError('Give the path of a datapack file inside the project.');
    const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: ZIP_FILTER,
        title: 'Open a Datapack File',
    });
    const chosen = picked?.[0]?.fsPath;
    if (chosen) openedByDialog.add(chosen);
    return chosen;
}

export const datapackZipHandlers = defineHandlers({
    'save-datapack-zip': async (
        context: HandlerContext,
        payload?: SaveDatapackZipPayload,
    ): Promise<HandlerResponse> => {
        const source = payload?.source ?? 'installer';
        if (!payload?.datapackName || !payload.version) {
            return { success: false, error: 'Name the datapack and its version to save.' };
        }
        const id = { name: payload.datapackName, version: payload.version };
        const access = await resolveDataInstallerAccess(context, source);
        if (!access.ok) return access.response;
        try {
            const read = await readPackFromStore(access.client, id, source, { dataTypes: payload.dataTypes });
            const target = await saveTarget(context, payload.path, datapackZipName(id));
            if (!target) return { success: true, data: { cancelled: true } };
            const { pack, note } = await withFileLayer(context, read);
            // Before the file is written: a layer the load would refuse makes a file nobody can load.
            const layer = pack.settingsLayer ? fileLayerFacts(pack.settingsLayer) : undefined;
            const bytes = buildDatapackZip(pack);
            await writeZip(target, bytes);
            context.logger.info(
                `${LOG_PREFIX} Saved ${id.name}@${id.version} from ${storeLabel(source)} as ${target} (${pack.items.length} data types)`,
            );
            return {
                success: true,
                data: {
                    path: target,
                    bytes: bytes.length,
                    dataTypes: pack.items.map((i) => i.dataType),
                    ...(layer ? { settingsLayer: layer } : {}),
                    ...(note ? { settingsLayerNote: note } : {}),
                },
            };
        } catch (error) {
            return failure(context, error, 'The datapack could not be saved.');
        }
    },

    'open-datapack-zip': async (
        context: HandlerContext,
        payload?: OpenDatapackZipPayload,
    ): Promise<HandlerResponse> => {
        try {
            const file = await openSource(context, payload?.path);
            if (!file) return { success: true, data: { cancelled: true } };
            const pack = readDatapackZip(await readPackFile(context, file));
            const layer = pack.settingsLayer ? fileLayerFacts(pack.settingsLayer) : undefined;
            return {
                success: true,
                data: {
                    path: file,
                    datapackName: pack.id.name,
                    version: pack.id.version,
                    displayName: pack.displayName,
                    ...(pack.description ? { description: pack.description } : {}),
                    dataTypes: pack.items.map((i) => i.dataType),
                    ...(pack.source ? { savedFrom: pack.source } : {}),
                    ...(pack.exportedAt ? { savedAt: pack.exportedAt } : {}),
                    ...(layer ? { settingsLayer: layer } : {}),
                },
            };
        } catch (error) {
            return failure(context, error, 'The datapack file could not be opened.');
        }
    },

    'load-datapack-zip': async (
        context: HandlerContext,
        payload?: LoadDatapackZipPayload,
    ): Promise<HandlerResponse> => {
        const target = payload?.target ?? 'library';
        if (!payload?.path) return { success: false, error: 'Open a datapack file first.' };
        const refused = refusedBeforeReading(payload, target);
        if (refused) return refused;
        try {
            const file = await openSource(context, payload.path);
            if (!file) return { success: false, error: 'Open a datapack file first.' };
            const opened = readDatapackZip(await readPackFile(context, file));
            const newName = typeof payload.saveAs === 'string' ? payload.saveAs.trim() : undefined;
            const read = newName === undefined ? opened : await keptBoth(context, opened, newName);
            if ('success' in read) return read;
            // In the Data Installer's form, or refused, before anything is sent (`installerForm.ts`).
            const { pack, changes } = target === 'installer' ? toInstallerForm(read) : { pack: read, changes: [] as string[] };
            if (pack.settingsLayer) fileLayerFacts(pack.settingsLayer);
            if (target === 'installer' && payload.confirmName !== pack.id.name) {
                return {
                    success: false,
                    error: installerEchoRefusal(pack.id.name),
                    code: ErrorCode.INVALID_OPERATION,
                    data: { sharedCatalog: true },
                };
            }
            const access = await resolveDataInstallerAccess(context, target);
            if (!access.ok) return access.response;
            const writer = new DatapackStoreWriter({
                baseUrl: access.baseUrl,
                getToken: access.getToken,
                ...(access.orgCode ? { orgCode: access.orgCode } : {}),
                log: (line) => context.debugLogger.debug(`${LOG_PREFIX} ${line}`),
                // Only Demo Builder's own store takes a large list in parts (`itemParts.ts`).
                inParts: target === 'library',
            });
            const outcome = await writePackToStore(writer, pack, {
                update: payload.update === true,
            }).catch((error: unknown) => {
                // My Datapacks also takes Keep Both, which the shared words cannot offer (live run 5).
                if (target !== 'library' || !(error instanceof DatapackTransferError) || !error.exists) throw error;
                throw new DatapackTransferError(
                    `${pack.id.name}@${pack.id.version} is already in My Datapacks. Send update to replace the data types this file carries, or saveAs with a new name to keep both.`,
                    true,
                );
            });
            const label = `${pack.id.name}@${pack.id.version}`;
            context.logger.info(
                `${LOG_PREFIX} Loaded ${label} into ${storeLabel(target)}: ${outcome.stored.length} of ${pack.items.length} data types`,
            );
            outcome.failed.forEach((f) =>
                context.logger.warn(`${LOG_PREFIX} ${label}: ${f.reason}`),
            );
            const settingsLayer = pack.settingsLayer && outcome.stored.length > 0 ? await loadFileLayer(context, pack.settingsLayer, payload.update === true) : undefined;
            const emptied = await removeIfEmpty(context, { writer, target, id: pack.id, outcome });
            return {
                success: outcome.stored.length > 0,
                ...(outcome.stored.length === 0 ? { error: 'No data type could be stored.' } : {}),
                data: {
                    datapackName: pack.id.name,
                    version: pack.id.version,
                    ...(newName !== undefined ? { displayName: pack.displayName } : {}),
                    target,
                    ...outcome,
                    ...(settingsLayer ? { settingsLayer } : {}),
                    ...emptied,
                    ...(changes.length > 0 ? { changed: changes } : {}),
                },
            };
        } catch (error) {
            return (target === 'installer' ? installerWriteRefusal(error) : undefined) ?? failure(context, error, 'The datapack file could not be loaded.');
        }
    },
});
