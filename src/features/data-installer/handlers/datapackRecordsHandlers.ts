/**
 * `get-datapack-records` (datapack simplification step 03, S4): the records an install of a pack
 * puts in Commerce, named by `keyOf`, for the install window's Review Records (rule 19: the spot
 * check only looks). Reads the pack, never the store; writes nothing.
 *
 * Webview-only, as `get-datapack-import-target` is: merged into `importHandlers`, not the read map
 * the MCP read descriptors mirror. An agent reads a pack's rows with the pack tools it has.
 *
 * @module features/data-installer/handlers/datapackRecordsHandlers
 */

import { readPackItems } from '../services/buildDatapackEngine';
import type { DataInstallerClient } from '../services/dataInstallerClient';
import type { PackItems } from '../services/demoBuilderEngine/runPack';
import { recordNames } from '../services/packRecords';
import { resolveDataInstallerAccess } from './dataInstallerHandlers';
import { libraryReads } from './libraryReads';
import { failure } from './packSave';
import { readPayload, type StoreChangesPayload } from './storeChangesHandlers';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';
import type { DatapackRecordsResult } from '@/types/webviewRequests';

/** Reads a pack's rows by kind from the store named. */
export type PackReader = (id: DatapackId, source: DatapackStoreName) => Promise<PackItems>;

/**
 * The pack read as the engine reads it (`readPackItems`): the library first, then the Data
 * Installer, which is opened only when a pack is read from it.
 */
function engineReader(context: HandlerContext): PackReader {
    const installer = async (): Promise<DataInstallerClient> => {
        const access = await resolveDataInstallerAccess(context);
        if (!access.ok)
            throw new Error(access.response.error ?? 'The Data Installer cannot be reached.');
        return access.client;
    };
    const catalog: Pick<DataInstallerClient, 'getDatapackDetail' | 'getDataItem'> = {
        getDatapackDetail: async (id) => (await installer()).getDatapackDetail(id),
        getDataItem: async (id, dataType) => (await installer()).getDataItem(id, dataType),
    };
    return (id, source) =>
        readPackItems({ catalog, libraryCatalog: libraryReads(context) }, id, source);
}

/**
 * The records of the pack named, or why they could not be read.
 *
 * @param read - the pack read; the engine's by default
 */
export async function readDatapackRecords(
    context: HandlerContext,
    payload: StoreChangesPayload | undefined,
    read: PackReader = engineReader(context),
): Promise<HandlerResponse> {
    const input = readPayload(payload);
    if ('error' in input) return { success: false, error: input.error };
    try {
        const data: DatapackRecordsResult = {
            records: recordNames(await read(input.pack, input.source ?? 'installer')),
        };
        return { success: true, data };
    } catch (error) {
        return failure(context, error, 'The records could not be read.');
    }
}

export const datapackRecordsHandlers = defineHandlers({
    'get-datapack-records': (
        context: HandlerContext,
        payload?: StoreChangesPayload,
    ): Promise<HandlerResponse> => readDatapackRecords(context, payload),
});
