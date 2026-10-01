/**
 * Datapack files: save a pack from a store to a zip, and load a zip into a store.
 *
 * Neither store has a file form (owner, 2026-10-01: "an optional export to zip …
 * Import should follow the same approach"), so the file is built and read here and
 * works the same for the Data Installer and the datapack library.
 *
 * Four message types:
 * - `save-datapack-zip` — read a pack from `source`, write the file.
 * - `open-datapack-zip` — read a file and say what is in it. Writes nothing; it is
 *   how the SC sees name, version and types before choosing where it goes.
 * - `load-datapack-zip` — write the file's pack into `target`.
 * - `delete-library-datapack` — the undo of a load: remove one of the caller's own
 *   packs from the datapack library. Library only, by construction: the library lets
 *   only a pack's owner delete it, and the Data Installer has no such check, so
 *   deleting there is not offered anywhere in the extension.
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

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { DataInstallerApiError } from '../services/dataInstallerErrors';
import { DatapackStoreWriter } from '../services/datapackStoreWriter';
import {
    DatapackTransferError,
    readPackFromStore,
    writePackToStore,
} from '../services/datapackTransfer';
import {
    buildDatapackZip,
    datapackZipName,
    DatapackZipError,
    readDatapackZip,
} from '../services/datapackZip';
import type { DatapackStoreName } from '../types';
import { resolveDataInstallerAccess } from './dataInstallerHandlers';
import { assertPathInsideSync } from '@/core/validation/PathSafetyValidator';
import { ErrorCode } from '@/types/errorCodes';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';

const LOG_PREFIX = '[Data Installer]';
const ZIP_FILTER = { 'Datapack file': ['zip'] };

export const INSTALLER_UPDATE_REFUSED =
    "Updating an existing pack in the Data Installer is not offered: it cannot tell whose pack it is, so an update could overwrite a colleague's data. Load it under a new version, or into the datapack library.";

/** Files the panel's open dialog returned this session — the only outside paths `load` accepts. */
const openedByDialog = new Set<string>();

export interface SaveDatapackZipPayload {
    source?: DatapackStoreName;
    datapackName?: string;
    version?: string;
    /** Agent: where to write, inside the project. Panel: omit to be asked. */
    path?: string;
}

export interface OpenDatapackZipPayload {
    /** Agent: the file, inside the project. Panel: omit to be asked. */
    path?: string;
}

export interface DeleteLibraryDatapackPayload {
    datapackName?: string;
    version?: string;
    /** Must be true. Nothing is deleted by default. */
    confirm?: boolean;
}

export interface LoadDatapackZipPayload {
    path?: string;
    target?: DatapackStoreName;
    /** Replace the types this file carries in a pack that already exists. Library only. */
    update?: boolean;
    /** Into the Data Installer only: must equal the pack's name, as proof of intent. */
    confirmName?: string;
}

/** The Data Installer's catalog is shared: a load into it names the pack back first. */
export function installerEchoRefusal(name: string): string {
    return `Loading into the Data Installer writes "${name}" into the catalog other teams share. To proceed, send confirmName:"${name}".`;
}

function storeLabel(store: DatapackStoreName): string {
    return store === 'library' ? 'the datapack library' : 'the Data Installer';
}

/**
 * A refusal this feature explains carries its own sentence (or the store's); anything
 * else is logged in full and the person reads the fallback, never a library's words.
 */
function failure(context: HandlerContext, error: unknown, fallback: string): HandlerResponse {
    const known =
        error instanceof DatapackZipError ||
        error instanceof DatapackTransferError ||
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

/** An agent's path, resolved inside the open project; a directory gets the default file name. */
async function projectPath(
    context: HandlerContext,
    given: string,
    defaultName?: string,
): Promise<string> {
    const project = await context.stateManager.getCurrentProject();
    if (!project)
        throw new DatapackTransferError(
            'Open a project first: a datapack file path must be inside it.',
        );
    let candidate = path.isAbsolute(given) ? given : path.join(project.path, given);
    if (defaultName && fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        candidate = path.join(candidate, defaultName);
    }
    return assertPathInsideSync(candidate, project.path);
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
        title: 'Save the datapack file',
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
        title: 'Open a datapack file',
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
            const pack = await readPackFromStore(access.client, id, source);
            const target = await saveTarget(context, payload.path, datapackZipName(id));
            if (!target) return { success: true, data: { cancelled: true } };
            const bytes = buildDatapackZip(pack);
            await fs.promises.writeFile(target, bytes);
            context.logger.info(
                `${LOG_PREFIX} Saved ${id.name}@${id.version} from ${storeLabel(source)} as ${target} (${pack.items.length} data types)`,
            );
            return {
                success: true,
                data: {
                    path: target,
                    bytes: bytes.length,
                    dataTypes: pack.items.map((i) => i.dataType),
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
            const pack = readDatapackZip(await fs.promises.readFile(file));
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
        if (target === 'installer' && payload.update) {
            // The library only lets a pack's owner write to it; the Data Installer
            // has no such check, so an update there could overwrite a colleague's pack.
            return {
                success: false,
                error: INSTALLER_UPDATE_REFUSED,
                code: ErrorCode.INVALID_OPERATION,
            };
        }
        try {
            const file = await openSource(context, payload.path);
            if (!file) return { success: false, error: 'Open a datapack file first.' };
            const pack = readDatapackZip(await fs.promises.readFile(file));
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
                log: (line) => context.debugLogger.debug(`${LOG_PREFIX} ${line}`),
            });
            const outcome = await writePackToStore(writer, pack, {
                update: payload.update === true,
            });
            const label = `${pack.id.name}@${pack.id.version}`;
            context.logger.info(
                `${LOG_PREFIX} Loaded ${label} into ${storeLabel(target)}: ${outcome.stored.length} of ${pack.items.length} data types`,
            );
            outcome.failed.forEach((f) =>
                context.logger.warn(`${LOG_PREFIX} ${label}: ${f.reason}`),
            );
            return {
                success: outcome.stored.length > 0,
                ...(outcome.stored.length === 0 ? { error: 'No data type could be stored.' } : {}),
                data: { datapackName: pack.id.name, version: pack.id.version, target, ...outcome },
            };
        } catch (error) {
            return failure(context, error, 'The datapack file could not be loaded.');
        }
    },

    'delete-library-datapack': async (
        context: HandlerContext,
        payload?: DeleteLibraryDatapackPayload,
    ): Promise<HandlerResponse> => {
        if (!payload?.datapackName || !payload.version) {
            return {
                success: false,
                error: 'Name the library datapack and its version to delete.',
            };
        }
        if (payload.confirm !== true) {
            return {
                success: false,
                error: 'Deleting a library datapack cannot be undone. Send confirm:true to proceed.',
                code: ErrorCode.INVALID_OPERATION,
            };
        }
        const id = { name: payload.datapackName, version: payload.version };
        const access = await resolveDataInstallerAccess(context, 'library');
        if (!access.ok) return access.response;
        try {
            const writer = new DatapackStoreWriter({
                baseUrl: access.baseUrl,
                getToken: access.getToken,
                log: (line) => context.debugLogger.debug(`${LOG_PREFIX} ${line}`),
            });
            const result = await writer.deleteDatapack(id);
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
});
