/**
 * A pack's settings layer at install (datapack-engine step 09, decisions 1 and 3, owner 2026-11-02).
 *
 * The layer is a library pack of `store_config` rows (`settingsLayer.ts`). It is applied here, after
 * the pack's data, by the kind's own `installStoreConfig`, on the pack's own install record, so
 * there is no second reader or writer of settings, and one removal takes both (`removePack` puts
 * the record's settings back first, by the fix's "changed since" rule). Only when the pack holds no
 * `store_config` itself: the pack wins, and is not even looked past.
 *
 * | The layer | What happens |
 * |---|---|
 * | holds a path a pack may not set | nothing at all is written; the dry run and the install name the path |
 * | a setting Commerce refuses, or one with no value anywhere | the data stays; the note names it by path |
 * | the library cannot be asked | the data goes in; the note says so; a recorded setting is left alone |
 * | no layer, and the record lists settings | they are put back, as for a pack that drops a setting |
 * | the install is of part of the pack (`settingsAsked`) | settings are left alone, set or not, and the note says a layer was not applied |
 *
 * @module features/data-installer/services/demoBuilderEngine/layerStep
 */

import { STORE_CONFIG_KIND } from '../datapackCatalog';
import { type SettingsLayer, layerNotAskedLine } from '../settingsLayer';
import { settingsAsked } from './askedKinds';
import type { CreatedObject } from './installRecord';
import type { KindContext } from './kindContext';
import type { KeptThing } from './repeatInstall';
import { installStoreConfig, packSettings, settingsLine } from './storeConfigKind';
import { errorText } from '@/features/app-builder/services/storePreparation/fixContract';
import type { DatapackId } from '@/types/datapack';

/** How the engine asks for a pack's layer: undefined when there is none. */
export type FindLayer = (pack: DatapackId) => Promise<SettingsLayer | undefined>;

/** What a pack's layer turned out to be, for this install. */
export type LayerLookup =
    /** Nothing looks here: no library to ask, or part of a pack that holds settings itself or has no layer. */
    | { state: 'off' }
    /** The pack has a layer, and this install is of part of the pack: left alone, set or not. */
    | { state: 'left-out'; layer: SettingsLayer }
    /** The pack holds `store_config`, and wins. */
    | { state: 'own' }
    | { state: 'none' }
    | { state: 'found'; layer: SettingsLayer }
    | { state: 'unasked'; pack: DatapackId };

/**
 * Look for the pack's layer. Never throws: a library that cannot be asked must not stop an install.
 *
 * @param items - the pack's rows, by kind
 */
export async function lookUpLayer(find: FindLayer | undefined, pack: DatapackId, items: Record<string, unknown>): Promise<LayerLookup> {
    if (!find) return { state: 'off' };
    if (STORE_CONFIG_KIND in items) return { state: 'own' };
    try {
        const layer = await find(pack);
        return layer ? { state: 'found', layer } : { state: 'none' };
    } catch {
        return { state: 'unasked', pack };
    }
}

/**
 * The layer as this request sees it: settings a request does not touch are neither set nor put back,
 * whatever the record lists (`settingsAsked`). A library that cannot be asked then costs nothing.
 *
 * @param all - every row the pack holds, not only the kinds asked for: a pack's own settings win
 *   over its layer whether or not they are asked for
 * @param dataTypes - the kinds asked for; all the pack holds when absent
 */
export async function lookUpAskedLayer(find: FindLayer | undefined, pack: DatapackId, all: Record<string, unknown>, dataTypes: readonly string[] | undefined): Promise<LayerLookup> {
    const lookup = await lookUpLayer(find, pack, all);
    if (settingsAsked(all, dataTypes)) return lookup;
    return lookup.state === 'found' ? { state: 'left-out', layer: lookup.layer } : { state: 'off' };
}

/** The pack's rows with the layer's beside them, for a check that names what a pack holds. */
export function withLayerRows(items: Record<string, unknown>, lookup: LayerLookup): Record<string, unknown> {
    return lookup.state === 'found' ? { ...items, [STORE_CONFIG_KIND]: lookup.layer.records } : items;
}

/**
 * Why the layer's rows cannot be installed, naming the layer and each path; none when they can.
 * Run with every kind's parser, before the first write.
 */
export function layerProblems(lookup: LayerLookup, websiteCode: string | undefined): string[] {
    if (lookup.state !== 'found') return [];
    try {
        packSettings(lookup.layer.records, websiteCode);
        return [];
    } catch (error) {
        return [`Store Settings: ${errorText(error)}`];
    }
}

/**
 * The rows the layer step applies: the layer's; none (`[]`), so the record's settings go back, when
 * the library says there is no layer and the record lists some; nothing to do otherwise.
 */
export function layerRowsToApply(lookup: LayerLookup, created: readonly CreatedObject[]): unknown {
    if (lookup.state === 'found') return lookup.layer.records;
    return lookup.state === 'none' && created.some((o) => o.kind === STORE_CONFIG_KIND) ? [] : undefined;
}

/**
 * Apply the layer, after the pack's data. A failure does not undo the data, which is installed
 * and on the record: it is said in the note.
 *
 * @returns why the layer stopped, when it did
 */
export async function applySettingsLayer(ctx: KindContext, lookup: LayerLookup): Promise<string | undefined> {
    const rows = layerRowsToApply(lookup, ctx.recorder.created);
    if (rows === undefined) return undefined;
    try {
        await installStoreConfig(ctx, rows);
        return undefined;
    } catch (error) {
        return errorText(error);
    }
}

/** The settings this step kept for the SC, for the "Kept N things" line; the pack's own are its. */
export function layerKept(lookup: LayerLookup, ctx: Pick<KindContext, 'session'>): KeptThing[] {
    if (lookup.state !== 'found' && lookup.state !== 'none') return [];
    return (ctx.session.settings?.kept ?? []).map((key) => ({ kind: STORE_CONFIG_KIND, key }));
}

/** What the settings did, in the note's words: whose they were, when they were a layer's. */
export function settingsDoneLine(lookup: LayerLookup, ctx: Pick<KindContext, 'session'>): string | undefined {
    const line = settingsLine(ctx.session.settings, 'Set');
    return line && lookup.state === 'found' ? `Store Settings: ${line}` : line;
}

/** Why a layer was not applied to an install of part of its pack. */
export function layerLeftOutLine(): string {
    return 'The Store Settings were left as they are: they go in when every data type is installed.';
}

/** The note's line when the layer was left out, could not be looked at, or stopped. */
export function layerTroubleLine(lookup: LayerLookup, stopped: string | undefined): string | undefined {
    if (lookup.state === 'left-out') return layerLeftOutLine();
    if (lookup.state === 'unasked') return layerNotAskedLine('were not applied');
    if (stopped === undefined) return undefined;
    return `The Store Settings were not all applied. ${stopped} The datapack's data is installed. Uninstalling the datapack takes it out, and puts back any setting that was applied.`;
}
