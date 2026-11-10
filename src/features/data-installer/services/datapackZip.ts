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
 *     settings/store_config.json   the pack's settings layer, when it has one (step 09)
 *
 * A zip whose files sit under one root folder (what macOS "Compress" makes of a
 * folder) reads the same. Saving and opening are the handler's.
 *
 * The layer is a second section, not one more data type, and the format version stays 1: an older
 * extension reads `data_types` and the `data/` folder, so it loads such a file's data as it always
 * did and leaves the section alone. A file with no section reads as before.
 *
 * @module features/data-installer/services/datapackZip
 */

import AdmZip from 'adm-zip';
import { STORE_CONFIG_KIND, settingsLayerName } from './datapackCatalog';
import { withoutCredentials } from './packCredentials';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';

export const DATAPACK_ZIP_FORMAT = 'demo-builder-datapack';
export const DATAPACK_ZIP_FORMAT_VERSION = 1;
const MANIFEST = 'datapack.json';
const DATA_DIR = 'data/';
const LAYER_FILE = `settings/${STORE_CONFIG_KIND}.json`;
/** A data type names a file, so it must be a plain name. The stores' codes all are. */
const DATA_TYPE_PATTERN = /^[a-z0-9_]+$/;
/** Unpacked size a file may claim before it is refused, checked before anything is unpacked. */
const DEFAULT_MAX_UNPACKED_BYTES = 256 * 1024 * 1024;

/** A pack's settings layer, as its file carries it: a library pack of store settings. */
export interface PackSettingsLayer {
    id: DatapackId;
    displayName: string;
    description?: string;
    /** The layer's `store_config` rows. */
    records: unknown;
}

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
    /** Its settings layer, the file's second section, when it has one. */
    settingsLayer?: PackSettingsLayer;
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
    /** What the file's second section is; absent on a file with none. */
    settings_layer?: { datapack_name?: unknown; version?: unknown; display_name?: unknown; description?: unknown };
}

function checkDataType(dataType: string): void {
    if (!DATA_TYPE_PATTERN.test(dataType)) {
        throw new DatapackZipError(`"${dataType}" is not a data type name.`);
    }
}

function json(value: unknown): Buffer {
    return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

function layerManifest(layer: PackSettingsLayer): NonNullable<Manifest['settings_layer']> {
    return {
        datapack_name: layer.id.name,
        version: layer.id.version,
        display_name: layer.displayName,
        ...(layer.description ? { description: layer.description } : {}),
    };
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
        ...(pack.settingsLayer ? { settings_layer: layerManifest(pack.settingsLayer) } : {}),
    };
    const zip = new AdmZip();
    zip.addFile(MANIFEST, json(manifest));
    for (const item of pack.items) {
        // A file can go to anyone: no customer password goes in one (step 08).
        zip.addFile(`${DATA_DIR}${item.dataType}.json`, json(withoutCredentials(item.dataType, item.records)));
    }
    if (pack.settingsLayer) zip.addFile(LAYER_FILE, json(pack.settingsLayer.records));
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
            "This datapack file does not say the datapack's name and a version.",
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
 * The file's second section, when its manifest names one. A file can come from anyone, so the
 * layer must be this pack's by name: it reaches the library under that name.
 */
function readLayer(zip: AdmZip, root: string, manifest: Manifest): PackSettingsLayer | undefined {
    const section = manifest.settings_layer;
    if (section === undefined) return undefined;
    const expected = settingsLayerName(manifest.datapack_name);
    if (section.datapack_name !== expected || typeof section.version !== 'string' || section.version === '') {
        throw new DatapackZipError(`This datapack file's settings layer must be named ${expected} and say its version.`);
    }
    let records: unknown;
    try {
        records = JSON.parse(zip.readAsText(`${root}${LAYER_FILE}`)) as unknown;
    } catch {
        throw new DatapackZipError("This datapack file's Store Settings are missing or not valid JSON.");
    }
    return {
        id: { name: expected, version: section.version },
        displayName: typeof section.display_name === 'string' && section.display_name !== '' ? section.display_name : expected,
        ...(typeof section.description === 'string' && section.description !== '' ? { description: section.description } : {}),
        records,
    };
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
    const settingsLayer = readLayer(zip, root, manifest);
    return {
        id: { name: manifest.datapack_name, version: manifest.version },
        displayName: manifest.display_name || manifest.datapack_name,
        ...(manifest.description ? { description: manifest.description } : {}),
        items: readItems(zip, root, manifest.data_types),
        ...(manifest.source ? { source: manifest.source } : {}),
        ...(manifest.exported_at ? { exportedAt: manifest.exported_at } : {}),
        ...(settingsLayer ? { settingsLayer } : {}),
    };
}

/** `<name>-<version>.datapack.zip`, with anything unsafe in a filename replaced. */
export function datapackZipName(id: DatapackId): string {
    const safe = (value: string): string => value.replace(/[^A-Za-z0-9._-]+/g, '_');
    return `${safe(id.name)}-${safe(id.version)}.datapack.zip`;
}
