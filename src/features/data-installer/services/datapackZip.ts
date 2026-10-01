/**
 * The datapack file: a pack saved to disk, and read back.
 *
 * Neither the Data Installer nor our datapack store has a file form — the
 * Data Installer's export writes into its own database, and both stores take
 * JSON over HTTP. So the zip is built and read here, over bytes, and the same
 * file comes out of (and goes into) either store:
 *
 *   <name>-<version>.datapack.zip
 *     datapack.json            what the pack is, in the stores' own field names
 *     data/<data_type>.json    one per data type: the rows, as the store holds them
 *
 * A zip whose files sit under one root folder (what macOS "Compress" makes of a
 * folder) reads the same. Saving and opening are the handler's.
 *
 * @module features/data-installer/services/datapackZip
 */

import AdmZip from 'adm-zip';
import type { DatapackId, DatapackStoreName } from '../types';

export const DATAPACK_ZIP_FORMAT = 'demo-builder-datapack';
export const DATAPACK_ZIP_FORMAT_VERSION = 1;
const MANIFEST = 'datapack.json';
const DATA_DIR = 'data/';
/** A data type names a file, so it must be a plain name. The stores' codes all are. */
const DATA_TYPE_PATTERN = /^[a-z0-9_]+$/;
/** Unpacked size a file may claim before it is refused, checked before anything is unpacked. */
const DEFAULT_MAX_UNPACKED_BYTES = 256 * 1024 * 1024;

/** A whole pack, as the file carries it. */
export interface DatapackFile {
    id: DatapackId;
    displayName: string;
    description?: string;
    /** One per data type, in the order the pack lists them. */
    items: Array<{ dataType: string; records: unknown }>;
    /** Which store it was saved from. */
    source?: DatapackStoreName;
    /** When it was saved (ISO 8601). */
    exportedAt?: string;
}

/** A file that is not a datapack file, explained in words an SC can act on. */
export class DatapackZipError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DatapackZipError';
    }
}

/** The manifest, in the stores' own snake_case field names. */
interface Manifest {
    format: string;
    formatVersion: number;
    datapack_name: string;
    version: string;
    display_name?: string;
    description?: string;
    data_types: string[];
    source?: DatapackStoreName;
    exported_at?: string;
}

function checkDataType(dataType: string): void {
    if (!DATA_TYPE_PATTERN.test(dataType)) {
        throw new DatapackZipError(`"${dataType}" is not a data type name.`);
    }
}

function json(value: unknown): Buffer {
    return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

/**
 * Build the file.
 *
 * @param pack - The pack and its rows
 * @returns The zip's bytes
 * @throws DatapackZipError when a data type is not a plain name
 */
export function buildDatapackZip(pack: DatapackFile): Buffer {
    pack.items.forEach((item) => checkDataType(item.dataType));
    const manifest: Manifest = {
        format: DATAPACK_ZIP_FORMAT,
        formatVersion: DATAPACK_ZIP_FORMAT_VERSION,
        datapack_name: pack.id.name,
        version: pack.id.version,
        display_name: pack.displayName,
        ...(pack.description ? { description: pack.description } : {}),
        data_types: pack.items.map((item) => item.dataType),
        ...(pack.source ? { source: pack.source } : {}),
        ...(pack.exportedAt ? { exported_at: pack.exportedAt } : {}),
    };
    const zip = new AdmZip();
    zip.addFile(MANIFEST, json(manifest));
    for (const item of pack.items) {
        zip.addFile(`${DATA_DIR}${item.dataType}.json`, json(item.records));
    }
    return zip.toBuffer();
}

/** Open the bytes as a zip, refusing an archive that claims more than the cap. */
function openZip(bytes: Buffer, maxUnpackedBytes: number): AdmZip {
    let zip: AdmZip;
    try {
        zip = new AdmZip(bytes);
    } catch {
        throw new DatapackZipError('This file is not a zip archive.');
    }
    const claimed = zip.getEntries().reduce((sum, entry) => sum + entry.header.size, 0);
    if (claimed > maxUnpackedBytes) {
        throw new DatapackZipError(
            `This file is too large to open: it unpacks to ${Math.round(claimed / 1024 / 1024)} MB.`,
        );
    }
    return zip;
}

/** Where the manifest is: the archive root, or inside one root folder. */
function findRoot(zip: AdmZip): string {
    const manifest = zip
        .getEntries()
        .map((entry) => entry.entryName)
        .filter((name) => name === MANIFEST || /^[^/]+\/datapack\.json$/.test(name))
        .sort((a, b) => a.length - b.length)[0];
    if (!manifest) {
        throw new DatapackZipError('This zip has no datapack.json, so it is not a datapack file.');
    }
    return manifest.slice(0, -MANIFEST.length);
}

function readManifest(zip: AdmZip, root: string): Manifest {
    let parsed: Partial<Manifest>;
    try {
        parsed = JSON.parse(zip.readAsText(`${root}${MANIFEST}`)) as Partial<Manifest>;
    } catch {
        throw new DatapackZipError('The datapack.json in this zip is not valid JSON.');
    }
    if (parsed.format !== DATAPACK_ZIP_FORMAT) {
        throw new DatapackZipError('This zip is not a Demo Builder datapack file.');
    }
    if (
        typeof parsed.formatVersion !== 'number' ||
        parsed.formatVersion > DATAPACK_ZIP_FORMAT_VERSION
    ) {
        throw new DatapackZipError(
            'This datapack file was made by a newer version of Demo Builder. Update the extension to open it.',
        );
    }
    if (!parsed.datapack_name || !parsed.version) {
        throw new DatapackZipError(
            "This datapack file does not say the pack's name and a version.",
        );
    }
    if (!Array.isArray(parsed.data_types)) {
        throw new DatapackZipError('This datapack file does not list its data types.');
    }
    parsed.data_types.forEach(checkDataType);
    return parsed as Manifest;
}

function readItems(zip: AdmZip, root: string, dataTypes: string[]): DatapackFile['items'] {
    const missing = dataTypes.filter((dt) => !zip.getEntry(`${root}${DATA_DIR}${dt}.json`));
    if (missing.length > 0) {
        throw new DatapackZipError(
            `This datapack file is missing the data for: ${missing.join(', ')}.`,
        );
    }
    return dataTypes.map((dataType) => {
        try {
            return {
                dataType,
                records: JSON.parse(
                    zip.readAsText(`${root}${DATA_DIR}${dataType}.json`),
                ) as unknown,
            };
        } catch {
            throw new DatapackZipError(`The ${dataType} data is not valid JSON.`);
        }
    });
}

/**
 * Read a file back into a pack.
 *
 * @param bytes - The zip's bytes
 * @param opts.maxUnpackedBytes - Refuse a file claiming more than this, before unpacking
 * @returns The pack
 * @throws DatapackZipError naming what is wrong with the file
 */
export function readDatapackZip(
    bytes: Buffer,
    opts: { maxUnpackedBytes?: number } = {},
): DatapackFile {
    const zip = openZip(bytes, opts.maxUnpackedBytes ?? DEFAULT_MAX_UNPACKED_BYTES);
    const root = findRoot(zip);
    const manifest = readManifest(zip, root);
    return {
        id: { name: manifest.datapack_name, version: manifest.version },
        displayName: manifest.display_name || manifest.datapack_name,
        ...(manifest.description ? { description: manifest.description } : {}),
        items: readItems(zip, root, manifest.data_types),
        ...(manifest.source ? { source: manifest.source } : {}),
        ...(manifest.exported_at ? { exportedAt: manifest.exported_at } : {}),
    };
}

/** `<name>-<version>.datapack.zip`, with anything unsafe in a filename replaced. */
export function datapackZipName(id: DatapackId): string {
    const safe = (value: string): string => value.replace(/[^A-Za-z0-9._-]+/g, '_');
    return `${safe(id.name)}-${safe(id.version)}.datapack.zip`;
}
