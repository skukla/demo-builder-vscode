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

import type { DataInstallerClient } from './dataInstallerClient';
import { DataInstallerApiError } from './dataInstallerErrors';
import type { DatapackStoreWriter } from './datapackStoreWriter';
import type { DatapackFile } from './datapackZip';
import { withoutCredentials } from './packCredentials';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';

/** A pack that cannot be saved as it stands, in words an SC can act on. */
export class DatapackTransferError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DatapackTransferError';
    }
}

/** How to read a pack: all of it unless some data types are named. */
export interface ReadPackOptions {
    /** Read only these data types, in this order. Each must be one the pack holds. */
    dataTypes?: string[];
    /** When it was read (injected for tests). */
    now?: () => Date;
}

/**
 * Read a pack and every data type it holds, or only the ones named.
 *
 * Naming types is how a pack with one item the store cannot return (the Data Installer answers 400
 * for an item too large to send) can still be saved without it.
 *
 * @param client - A catalog client on the store to read from
 * @param id - The pack
 * @param source - Which store that is, recorded in the file
 * @param opts - Which data types to read, and the clock
 * @throws DatapackTransferError when the pack holds nothing, a named type is not in it, or a type's
 *   rows do not parse
 */
export async function readPackFromStore(
    client: Pick<DataInstallerClient, 'getDatapackDetail' | 'getDataItem'>,
    id: DatapackId,
    source: DatapackStoreName,
    opts: ReadPackOptions = {},
): Promise<DatapackFile> {
    const detail = await client.getDatapackDetail(id);
    if (detail.dataTypes.length === 0) {
        throw new DatapackTransferError(
            `${id.name}@${id.version} holds no data yet, so there is nothing to save.`,
        );
    }
    const wanted = typesToRead(id, detail.dataTypes, opts.dataTypes);
    const items: DatapackFile['items'] = [];
    for (const dataType of wanted) {
        const item = await client.getDataItem(id, dataType);
        if (item.records === undefined) {
            throw new DatapackTransferError(
                `The stored ${dataType} rows of ${id.name}@${id.version} are not valid JSON, so the datapack cannot be saved.`,
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
        exportedAt: (opts.now ?? (() => new Date()))().toISOString(),
    };
}

/** The named types, refused when one is not in the pack; every type when none are named. */
function typesToRead(id: DatapackId, held: string[], named: string[] | undefined): string[] {
    if (named === undefined) return held;
    if (named.length === 0) {
        throw new DatapackTransferError('Name at least one data type to save, or leave dataTypes out to save them all.');
    }
    const missing = named.filter((dataType) => !held.includes(dataType));
    if (missing.length > 0) {
        throw new DatapackTransferError(
            `${id.name}@${id.version} holds no ${missing.join(', ')}. It holds ${held.join(', ')}.`,
        );
    }
    return named;
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
 * An existing pack with the same name and version is refused unless `update` is set; `shared`
 * creates it shared, as a save into a shared pack must be (Phase 2);
 * then the types this file carries replace the stored ones and the rest are left as
 * they are. Each type is its own request: one the store refuses is reported by name, and the
 * others still land.
 *
 * @throws DatapackTransferError when the pack exists and `update` is not set, or a type is too large
 *   for that store (`DatapackStoreWriter.oversized`), before anything is written
 */
export async function writePackToStore(
    writer: Pick<DatapackStoreWriter, 'createDatapack' | 'addDataItem'> & Partial<Pick<DatapackStoreWriter, 'oversized'>>,
    pack: DatapackFile,
    opts: { update?: boolean; shared?: boolean } = {},
): Promise<PackWriteOutcome> {
    // Before anything is written: a type the store cannot take would leave half a pack behind.
    const tooLarge = writer.oversized?.(pack.items) ?? [];
    if (tooLarge.length > 0) {
        throw new DatapackTransferError(
            `${tooLarge.join(', ')} ${tooLarge.length === 1 ? 'is' : 'are'} too large to send to that store, so nothing was written. ` +
                'Demo Builder\'s datapack store takes large data types in parts; the Data Installer does not.',
        );
    }
    const created = await writer.createDatapack({
        id: pack.id,
        displayName: pack.displayName,
        ...(pack.description ? { description: pack.description } : {}),
        ...(opts.shared ? { shared: true } : {}),
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
            // Never a customer password into a store, whichever store (step 08).
            await writer.addDataItem(pack.id, item.dataType, withoutCredentials(item.dataType, item.records));
            outcome.stored.push(item.dataType);
        } catch (error) {
            if (!(error instanceof DataInstallerApiError)) throw error;
            outcome.failed.push({ dataType: item.dataType, reason: error.message });
        }
    }
    return outcome;
}
