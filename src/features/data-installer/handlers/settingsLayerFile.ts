/**
 * A pack's settings layer in its datapack file (datapack-engine step 09, decision 1): saving carries
 * the layer as the file's second section, and loading puts it in the library, wherever the data
 * goes, since the library is where an install looks for it.
 *
 * A file can come from anyone, so its layer is checked by the install's own rule before anything is
 * written. A file whose layer the install would refuse is refused whole, by path: a layer like that
 * in the library would stop every install of the pack.
 *
 * @module features/data-installer/handlers/settingsLayerFile
 */

import { STORE_CONFIG_KIND } from '../services/datapackCatalog';
import { DatapackTransferError, writePackToStore } from '../services/datapackTransfer';
import { type DatapackFile, DatapackZipError, type PackSettingsLayer } from '../services/datapackZip';
import { packSettings } from '../services/demoBuilderEngine/storeConfigKind';
import { findSettingsLayer, layerNotAskedLine } from '../services/settingsLayer';
import { resolveDataInstallerAccess } from './dataInstallerHandlers';
import { openLibraryWriter } from './libraryWriter';
import type { HandlerContext } from '@/types/handlers';

const LOG_PREFIX = '[Data Installer]';

/** The website code a file's settings are checked for: a file installs on any website. */
const ANY_WEBSITE = 'website';

/** What a file's layer holds, as the save, the open and the load answer it. */
export interface FileLayerFacts {
    datapackName: string;
    version: string;
    settings: number;
    paths: string[];
}

/** What loading a file's layer did. */
export interface LoadedLayer {
    datapackName: string;
    version: string;
    /** `left`: the library already holds that version, and nobody asked to replace it. */
    outcome: 'created' | 'updated' | 'left' | 'failed';
    reason?: string;
}

/**
 * The layer's rows, by the install's own rule.
 *
 * @throws DatapackZipError naming each path the install would refuse
 */
export function fileLayerFacts(layer: PackSettingsLayer): FileLayerFacts {
    try {
        const settings = packSettings(layer.records, ANY_WEBSITE);
        return { datapackName: layer.id.name, version: layer.id.version, settings: settings.length, paths: settings.map((setting) => setting.item.path) };
    } catch (error) {
        throw new DatapackZipError(`This file's settings layer cannot be used. ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * The pack with its layer from the library, unless it holds settings itself, which win. A library
 * that cannot be asked costs only the section, and the answer says so.
 */
export async function withFileLayer(context: HandlerContext, pack: DatapackFile): Promise<{ pack: DatapackFile; note?: string }> {
    if (pack.items.some((item) => item.dataType === STORE_CONFIG_KIND)) return { pack };
    try {
        const library = await resolveDataInstallerAccess(context, 'library');
        if (!library.ok) throw new Error(library.response.error ?? 'The datapack library is not reachable.');
        const layer = await findSettingsLayer(library.client, pack.id.name);
        if (!layer) return { pack };
        const { id, displayName, description, records } = layer;
        return { pack: { ...pack, settingsLayer: { id, displayName, ...(description ? { description } : {}), records } } };
    } catch (error) {
        context.debugLogger.debug(`${LOG_PREFIX} Could not look for ${pack.id.name}'s settings layer: ${String(error)}`);
        return { pack, note: layerNotAskedLine(pack.id.name, 'are not in this file') };
    }
}

/**
 * Put a file's layer in the library. The data is already written, so nothing here stops the load:
 * a layer that does not land is said in the answer.
 *
 * @param update - replace a version already there; otherwise it is left as it is
 */
export async function loadFileLayer(context: HandlerContext, layer: PackSettingsLayer, update: boolean): Promise<LoadedLayer> {
    const said = { datapackName: layer.id.name, version: layer.id.version };
    const library = await openLibraryWriter(context);
    if (!library.ok) return { ...said, outcome: 'failed', reason: library.reason };
    const file: DatapackFile = {
        id: layer.id,
        displayName: layer.displayName,
        ...(layer.description ? { description: layer.description } : {}),
        items: [{ dataType: STORE_CONFIG_KIND, records: layer.records }],
    };
    try {
        const written = await writePackToStore(library.writer, file, { update });
        if (written.failed.length > 0) return { ...said, outcome: 'failed', reason: written.failed[0].reason };
        return { ...said, outcome: written.pack };
    } catch (error) {
        if (error instanceof DatapackTransferError) {
            return { ...said, outcome: 'left', reason: `My Datapacks already holds ${said.datapackName}@${said.version}, so it was left as it is.` };
        }
        return { ...said, outcome: 'failed', reason: error instanceof Error ? error.message : String(error) };
    }
}
