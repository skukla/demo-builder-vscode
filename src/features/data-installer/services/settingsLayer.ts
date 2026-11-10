/**
 * Finding a pack's settings layer (datapack-engine step 09, decision 1, owner 2026-11-02): a
 * library pack named `<pack name>-settings` that holds only store settings, its newest version.
 * The service's catalog stays the source of the packs; a layer lives beside them, in our library.
 *
 * Reads only. What a layer does at install is `demoBuilderEngine/layerStep.ts`; both the engine and
 * the datapack file ask this one question.
 *
 * @module features/data-installer/services/settingsLayer
 */

import type { DatapackSummary, PackDetailLayer } from '../types';
import type { DataInstallerClient } from './dataInstallerClient';
import { STORE_CONFIG_KIND, isSettingsLayer, newestVersion, settingsLayerName } from './datapackCatalog';
import type { DatapackId } from '@/types/datapack';

/** A pack's settings layer as the library holds it. */
export interface SettingsLayer {
    id: DatapackId;
    displayName: string;
    description?: string;
    shared: boolean;
    /** True when the signed-in SC owns it, and so can remove it. */
    mine: boolean;
    /** The layer's `store_config` rows, unchecked: a pack is untrusted input. */
    records: unknown;
}

/** The two library reads a layer takes. */
export type LayerReads = Pick<DataInstallerClient, 'findDatapacks' | 'getDataItem'>;

/** The library's rows that are this pack's layer. */
async function layerRows(reads: Pick<LayerReads, 'findDatapacks'>, packName: string): Promise<DatapackSummary[]> {
    const name = settingsLayerName(packName);
    const page = await reads.findDatapacks({ datapackName: name });
    return page.items.filter((row) => row.id.name === name && isSettingsLayer(row));
}

/**
 * The pack's settings layer, or undefined when the library holds none.
 *
 * @param reads - the library's reads
 * @param packName - the pack's name, not the layer's
 * @throws when the library cannot be asked or the layer's rows cannot be read. A caller must not
 *   take that for "no layer": an install then puts recorded settings back
 */
export async function findSettingsLayer(reads: LayerReads, packName: string): Promise<SettingsLayer | undefined> {
    const row = newestVersion(await layerRows(reads, packName));
    if (!row) return undefined;
    const item = await reads.getDataItem(row.id, STORE_CONFIG_KIND);
    if (item.records === undefined) throw new Error(`The stored settings of ${row.id.name}@${row.id.version} are not valid JSON.`);
    return {
        id: row.id,
        displayName: row.displayName,
        ...(row.description ? { description: row.description } : {}),
        shared: row.shared,
        mine: row.mine === true,
        records: item.records,
    };
}

/** The signed-in SC's own versions of a pack's layer: what sharing and deleting that pack reach. */
export async function myLayerVersions(reads: Pick<LayerReads, 'findDatapacks'>, packName: string): Promise<DatapackSummary[]> {
    return (await layerRows(reads, packName)).filter((row) => row.mine === true);
}

/** Why a layer was not looked at, in the words the three surfaces share. */
export function layerNotAskedLine(consequence: string): string {
    return `My Datapacks couldn't be read, so this datapack's Store Settings, if any, ${consequence}.`;
}

/** A row of a layer as the flyout shows it; anything else in the rows is not shown. */
const isSettingRow = (row: unknown): row is { path: string; value: string } => {
    const fields = row as { path?: unknown; value?: unknown } | null;
    return typeof fields?.path === 'string' && typeof fields.value === 'string';
};

/**
 * What a pack's flyout says about its layer (`get-datapack-detail`), so an SC sees what Import will
 * set before pressing it, and can remove a layer of their own, whose card is not offered
 * (`withoutLayerCards`). Only for a pack holding no settings of its own. A library that cannot be
 * asked costs only the row.
 *
 * @param open - the library's reads, opened only when there is something to ask
 */
export async function layerForDetail(
    pack: Pick<DatapackSummary, 'id' | 'dataTypes'>,
    open: () => Promise<LayerReads>,
): Promise<PackDetailLayer | undefined> {
    if (pack.dataTypes.includes(STORE_CONFIG_KIND)) return undefined;
    try {
        const layer = await findSettingsLayer(await open(), pack.id.name);
        if (!layer) return undefined;
        const rows: unknown[] = Array.isArray(layer.records) ? layer.records : [];
        return {
            id: layer.id,
            mine: layer.mine,
            settings: rows.filter(isSettingRow).map(({ path, value }) => ({ path, value })),
        };
    } catch {
        return undefined;
    }
}
