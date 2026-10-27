/**
 * Move a whole pack between a store and a datapack file.
 *
 * Reading uses the catalog client the panel already uses (`get-datapack-metadata`,
 * then `get-data-item` per type); writing uses {@link DatapackStoreWriter}. Both
 * work against either store, so this module never asks which one it is talking to.
 * The file itself is {@link buildDatapackZip} / {@link readDatapackZip}.
 *
 * @module features/data-installer/services/datapackTransfer
 */

import type { DatapackId, DatapackStoreName } from '../types';
import type { DataInstallerClient } from './dataInstallerClient';
import { DataInstallerApiError } from './dataInstallerErrors';
import type { DatapackStoreWriter } from './datapackStoreWriter';
import type { DatapackFile } from './datapackZip';

/** A pack that cannot be saved as it stands, in words an SC can act on. */
export class DatapackTransferError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DatapackTransferError';
    }
}

/**
 * Read a pack and every data type it holds.
 *
 * @param client - A catalog client on the store to read from
 * @param id - The pack
 * @param source - Which store that is, recorded in the file
 * @param now - When it was read (injected for tests)
 * @throws DatapackTransferError when the pack holds nothing, or a type's rows do not parse
 */
export async function readPackFromStore(
    client: Pick<DataInstallerClient, 'getDatapackDetail' | 'getDataItem'>,
    id: DatapackId,
    source: DatapackStoreName,
    now: () => Date = () => new Date(),
): Promise<DatapackFile> {
    const detail = await client.getDatapackDetail(id);
    if (detail.dataTypes.length === 0) {
        throw new DatapackTransferError(
            `${id.name}@${id.version} holds no data yet, so there is nothing to save.`,
        );
    }
    const items: DatapackFile['items'] = [];
    for (const dataType of detail.dataTypes) {
        const item = await client.getDataItem(id, dataType);
        if (item.records === undefined) {
            throw new DatapackTransferError(
                `The stored ${dataType} rows of ${id.name}@${id.version} are not valid JSON, so the pack cannot be saved.`,
            );
        }
        items.push({ dataType, records: item.records });
    }
    return {
        id: detail.id,
        displayName: detail.displayName,
        ...(detail.description ? { description: detail.description } : {}),
        items,
        source,
        exportedAt: now().toISOString(),
    };
}

/** What a write into a store did. */
export interface PackWriteOutcome {
    /** `created` a new pack, or `updated` one that was there. */
    pack: 'created' | 'updated';
    stored: string[];
    failed: Array<{ dataType: string; reason: string }>;
}

/**
 * Write a pack into a store.
 *
 * An existing pack with the same name and version is refused unless `update` is set;
 * then the types this file carries replace the stored ones and the rest are left as
 * they are. Each type is its own request: one that is refused (too large, say) is
 * reported by name, and the others still land.
 *
 * @throws DatapackTransferError when the pack exists and `update` is not set
 */
export async function writePackToStore(
    writer: Pick<DatapackStoreWriter, 'createDatapack' | 'addDataItem'>,
    pack: DatapackFile,
    opts: { update?: boolean } = {},
): Promise<PackWriteOutcome> {
    const created = await writer.createDatapack({
        id: pack.id,
        displayName: pack.displayName,
        ...(pack.description ? { description: pack.description } : {}),
    });
    if (created === 'exists' && !opts.update) {
        throw new DatapackTransferError(
            `${pack.id.name}@${pack.id.version} already exists in that store. Load it with update to replace the data types this file carries, or change the version.`,
        );
    }
    const outcome: PackWriteOutcome = {
        pack: created === 'created' ? 'created' : 'updated',
        stored: [],
        failed: [],
    };
    for (const item of pack.items) {
        try {
            await writer.addDataItem(pack.id, item.dataType, item.records);
            outcome.stored.push(item.dataType);
        } catch (error) {
            if (!(error instanceof DataInstallerApiError)) throw error;
            outcome.failed.push({ dataType: item.dataType, reason: error.message });
        }
    }
    return outcome;
}
