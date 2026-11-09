/**
 * "Save store changes" (step 05, step 07, step 14; `saveStoreChanges`): the store's copy of a pack
 * Demo Builder installed (`capture.ts`: what the install record lists, and what the installed
 * version's own rows name), plus what the SC made by hand and picked, written into the library as
 * a new version of the demo's OWN pack (`demoPack.ts`). With no pack, a store Demo Builder did
 * not fill, the version holds what is picked alone (step 14, item 10).
 *
 * The pack installed is never written over, so a save is undone by deleting the new version. The
 * install record moves onto the new version, hashed afresh, so the store and it start out as one
 * another; a pick never joins it, since the engine did not make it and removal must leave it.
 *
 * Store settings go where they belong (step 09). A pack holding `store_config` keeps them. Any other
 * pack's are its settings layer's, so they go to a layer beside the new version, named for the
 * demo's own pack at the same version (`<own pack>-settings`), where the next install, the zip and a
 * colleague find it: never into the version, which would make it hold settings of its own and win
 * over its layer for good, and never onto the layer installed, which may be a colleague's and which
 * a save never writes over, as it never writes over the pack installed. Deleting the new version
 * takes that layer with it (`delete-library-datapack`).
 *
 * Before anything is stored the version is checked by the install's own parsers (`packRowRefusals`).
 * Its sentence says where it saved, what of the store it left out because nothing picked it, and
 * which ids it kept because the store could not name them (`saveOutcome.ts`).
 *
 * `listPickable` is the save's pick list: one kind of the store's items, less what the pack being
 * saved holds already. `countPickable` is what its cards are greyed by: how many of each kind.
 *
 * @module features/data-installer/services/demoBuilderEngine/saveStore
 */

import { type LeftOut, type PickableKind, type StoreItemPage, type StoreKindCounts, type StorePicks, pickCount } from '../../pickableKinds';
import { STORE_CONFIG_KIND, settingsLayerName } from '../datapackCatalog';
import type { PackWriteOutcome } from '../datapackTransfer';
import type { DatapackFile } from '../datapackZip';
import { capturePack } from './capture';
import { captureLines } from './capturePhases';
import { type InstallRecord, type RecordFiles, forgetInstallRecord, nodeRecordFiles, readInstallRecord, writeInstallRecord } from './installRecord';
import { lookUpLayer } from './layerStep';
import { rebaseRecord } from './recordFingerprints';
import { packRowRefusals } from './runPack';
import { layerLine, leftOutLine, resultLines, savedSentence, saveSentence, savingLine, unnamedLine } from './saveOutcome';
import { type StoreChangesDeps, StoreChangesError, labelPack, openStore } from './storeAccess';
import { countStoreItems, holdsOf, leftOutOf, listStoreItems, seedsOf } from './storeItems';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';

/**
 * The installed version's own rows: from the store named, else the library, else the Data
 * Installer. A save that cannot read them stops, rather than save a version missing the pack's
 * products the store already had.
 */
async function readInstalled(
    deps: StoreChangesDeps,
    target: { pack: DatapackId; source?: DatapackStoreName },
): Promise<{ rows: Record<string, unknown>; source: DatapackStoreName }> {
    const stores: DatapackStoreName[] = target.source ? [target.source] : ['library', 'installer'];
    for (const source of stores) {
        try {
            return { rows: await deps.readPack(target.pack, source), source };
        } catch (error) {
            deps.log(`could not read ${labelPack(target.pack)} from the ${source}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    throw new StoreChangesError(
        `${labelPack(target.pack)} cannot be read from the library or the Data Installer, so the products it holds that the store already had cannot be saved with it. Nothing was saved.`,
    );
}

/** Where a save writes: the demo's own pack, at a new version, and what the SC sees it called. */
export interface SaveAs {
    id: DatapackId;
    displayName: string;
}

/**
 * What a save is of. With `pack`, the store's copy of a pack Demo Builder installed here, plus
 * anything picked; without one, only what is picked, from a store Demo Builder did not fill
 * (step 14, items 10 and 11).
 */
export interface SaveTarget {
    pack?: DatapackId;
    source?: DatapackStoreName;
    saveAs: SaveAs;
    /** Things the SC made by hand, picked to go in too. Never put on the install record. */
    picks?: StorePicks;
}

/** What a save did. */
export interface SaveResult {
    /** The new version, now in the library (and on the install record, when there is one). */
    saved: DatapackId;
    /** How many of each kind it holds. */
    counts: Record<string, number>;
    /** The store the installed version's own rows were read from; none for a save of picks alone. */
    readFrom?: DatapackStoreName;
    /** The whole outcome in one sentence, names and all: what an agent reads. */
    sentence: string;
    /**
     * The result window's lines under the pack's data types: what a save into the demo's own pack
     * left out, counted, and the settings and ids it kept. A new pack holds what was picked, so
     * nothing it left out is worth a line.
     */
    details: string[];
    /** Each id kept because the store could not name it, as "category 57" (step 14). */
    unnamed: string[];
    /** What the store has, of the kinds an SC adds by hand, that the new version does not hold. */
    leftOut: LeftOut[];
    /** The settings layer it wrote beside the new version (step 09), when the pack has settings it does not hold. */
    settingsLayer?: { datapackName: string; version: string; settings: number };
}

/** What a save starts from: the record and the installed version's rows, when there is a pack. */
interface SaveStart {
    record?: InstallRecord;
    installed: { rows: Record<string, unknown>; source?: DatapackStoreName };
}

async function startSave(deps: StoreChangesDeps, target: SaveTarget, files: RecordFiles): Promise<SaveStart> {
    const { pack } = target;
    if (!pack) {
        if (pickCount(target.picks ?? {}) === 0) throw new StoreChangesError('Select at least one item from the store to save. Nothing was saved.');
        return { installed: { rows: {} } };
    }
    const record = await readInstallRecord(files, deps.projectPath, pack);
    if (!record) throw new StoreChangesError(`Demo Builder did not install ${labelPack(pack)} in this project, so there are no store changes of it to save.`);
    return { record, installed: await readInstalled(deps, { pack, ...(target.source ? { source: target.source } : {}) }) };
}

/**
 * Write the new version into the library; a version it took only part of stops the save.
 *
 * @param version - the version to delete to start again: the pack's, for its layer too, since
 *   deleting it takes the layer with it
 */
async function writeVersion(write: (file: DatapackFile) => Promise<PackWriteOutcome>, file: DatapackFile, version: DatapackId = file.id): Promise<void> {
    const outcome = await write(file);
    if (outcome.failed.length === 0) return;
    const reasons = outcome.failed.map((f) => `${f.dataType}: ${f.reason}`).join('; ');
    throw new StoreChangesError(`Some of ${labelPack(file.id)} could not be saved to the library (${reasons}). Delete ${labelPack(version)} from the library and try again.`);
}

/** The rows of a capture that are the version's, and the settings that go beside it, if any. */
function splitSettings(items: Record<string, unknown>, packHoldsSettings: boolean): { rows: Record<string, unknown>; layerRows?: unknown[] } {
    const settings = items[STORE_CONFIG_KIND];
    if (packHoldsSettings || !Array.isArray(settings) || settings.length === 0) return { rows: items };
    const { [STORE_CONFIG_KIND]: _settings, ...rows } = items;
    return { rows, layerRows: settings };
}

/** The file of the layer beside a saved version, at that version. */
function layerFile(saveAs: SaveAs, records: unknown[], exportedAt: string): DatapackFile {
    return {
        id: { name: settingsLayerName(saveAs.id.name), version: saveAs.id.version },
        displayName: `${saveAs.displayName} settings`,
        description: `Store settings for ${saveAs.displayName}, applied after its data when Demo Builder installs it.`,
        items: [{ dataType: STORE_CONFIG_KIND, records }],
        source: 'library',
        exportedAt,
    };
}

/**
 * What the installed version names, its settings layer's rows included: a setting the layer holds
 * that the store already had at that value is on no record, and the new layer must still carry it.
 */
async function namedByInstalled(deps: StoreChangesDeps, pack: DatapackId | undefined, rows: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!pack) return rows;
    const lookup = await lookUpLayer(deps.findLayer, pack, rows);
    return lookup.state === 'found' ? { ...rows, [STORE_CONFIG_KIND]: lookup.layer.records } : rows;
}

/**
 * Save the store's copy of a pack Demo Builder installed here, and anything picked, as a new
 * version of the demo's own pack; or, with no pack, what is picked alone.
 *
 * @param write - writes the new version into the library (`writePackToStore`, never `update`)
 * @param report - called as each stage starts, for the progress window
 * @throws StoreChangesError when Demo Builder did not install the pack here, nothing is picked
 *   and there is no pack, the store holds nothing to save, the install would refuse the version,
 *   or the library refused part of it (then the record stays where it was)
 */
export async function saveStoreChanges(
    deps: StoreChangesDeps,
    target: SaveTarget,
    write: (file: DatapackFile) => Promise<PackWriteOutcome>,
    report: (stage: string, step?: string) => void = () => undefined,
): Promise<SaveResult> {
    const { pack, saveAs } = target;
    const files = deps.files ?? nodeRecordFiles;
    const { record, installed } = await startSave(deps, target, files);
    const seeds = [...(record?.created ?? []), ...seedsOf(target.picks ?? {})];
    const lineFor = captureLines([...seeds.map((seed) => seed.kind), ...Object.keys(installed.rows)]);
    const reading = (at: number): void => report(OPERATION_STAGES.readingStoreChanges.label, lineFor(at));
    reading(0);
    const ctx = await openStore(deps, pack ?? saveAs.id, record);
    const named = await namedByInstalled(deps, pack, installed.rows);
    const captured = await capturePack(ctx, seeds, named, reading);
    const { rows, layerRows } = splitSettings(captured.items, STORE_CONFIG_KIND in installed.rows);
    if (Object.keys(rows).length === 0) {
        throw new StoreChangesError(pack ? `The store no longer holds anything ${labelPack(pack)} made, so there is nothing to save.` : 'The store holds none of what was picked, so there is nothing to save.');
    }
    refuseUninstallable(captured.items);
    const leftOut = await leftOutOf(ctx, captured.items);
    const about = pack ? await deps.describe(pack) : undefined;
    report(OPERATION_STAGES.savingToLibrary.label, savingLine(Object.keys(rows)));
    const items = Object.entries(rows).map(([dataType, records]) => ({ dataType, records }));
    const exportedAt = (deps.now ?? (() => new Date()))().toISOString();
    await writeVersion(write, { id: saveAs.id, displayName: saveAs.displayName, ...(about?.description ? { description: about.description } : {}), items, source: 'library', exportedAt });
    const layer = layerRows ? layerFile(saveAs, layerRows, exportedAt) : undefined;
    if (layer) await writeVersion(write, layer, saveAs.id);
    const settingsLayer = layer && layerRows ? { datapackName: layer.id.name, version: layer.id.version, settings: layerRows.length } : undefined;
    if (pack && record) {
        // Only what the engine made moves onto the new version: a pick it did not make stays the SC's.
        await writeInstallRecord(files, deps.projectPath, { ...record, pack: saveAs.id, created: await rebaseRecord(ctx, record.created, captured.items) });
        await forgetInstallRecord(files, deps.projectPath, pack);
    }
    const installedAs = pack && about ? { id: pack, displayName: about.displayName } : undefined;
    const counts = Object.fromEntries(Object.entries(captured.counts).filter(([kind]) => kind in rows));
    return {
        saved: saveAs.id,
        counts,
        ...(installed.source ? { readFrom: installed.source } : {}),
        sentence: saveSentence(savedSentence(saveAs, installedAs), layerLine(settingsLayer), leftOutLine(leftOut), unnamedLine(captured.unnamed)),
        details: resultLines(pack !== undefined && saveAs.id.name === pack.name ? leftOut : [], settingsLayer, captured.unnamed),
        unnamed: captured.unnamed,
        leftOut,
        ...(settingsLayer ? { settingsLayer } : {}),
    };
}

/** The website code a saved setting is checked for: a saved version installs on any website. */
const ANY_WEBSITE = 'website';

/**
 * Stop before storing a version the install would refuse (step 14, item 13; the service checked
 * every export against its JSON schema, `ProductsExportProcessor.js:232-234`): it would fail at
 * the next install, on whichever store that is, long after this save.
 */
function refuseUninstallable(items: Record<string, unknown>): void {
    const refused = packRowRefusals(items, ANY_WEBSITE);
    if (refused.length === 0) return;
    const reasons = refused.map((r) => `${r.kind}: ${r.reason}`).join(' ');
    throw new StoreChangesError(`The saved version could not be installed, so nothing was saved. ${reasons}`);
}

/**
 * One kind of the store's items a save can pick, less what the pack being saved holds already
 * (step 14, item 11): what the SC made by hand is what is left. Reads only.
 *
 * @param pack - the pack being saved, when there is one
 */
export async function listPickable(deps: StoreChangesDeps, kind: PickableKind, pack?: DatapackId, source?: DatapackStoreName): Promise<StoreItemPage> {
    const started = Date.now();
    const record = pack ? await readInstallRecord(deps.files ?? nodeRecordFiles, deps.projectPath, pack) : undefined;
    // Commerce and the pack are read at once; the pack once a visit (`packReadCache`, walk F81).
    const [store, held] = await Promise.all([
        openStore(deps, pack, record).then((ctx) => listStoreItems(ctx, kind)).then((listed) => ({ ...listed, ms: Date.now() - started })),
        pack ? packRowsOf(deps, pack, source) : Promise.resolve(undefined),
    ]);
    const { items, excluded } = store;
    const rows = held?.rows ?? {};
    deps.log(`Listed ${kind}: Commerce in ${store.ms} ms${held ? `, ${labelPack(held.pack)} in ${held.ms} ms` : ''}`);
    const holds = holdsOf(kind, record?.created ?? [], rows);
    const offered = items.filter((item) => !holds(item));
    return { items: offered, totalCount: items.length, excludedCount: excluded, inPackCount: items.length - offered.length };
}

/** The pack's rows for a list (read once a visit, `packReadCache`); none when it cannot be read, as before. */
async function packRowsOf(deps: StoreChangesDeps, pack: DatapackId, source: DatapackStoreName | undefined): Promise<{ pack: DatapackId; rows: Record<string, unknown>; ms: number }> {
    const started = Date.now();
    const rows = await readInstalled(deps, { pack, ...(source ? { source } : {}) }).then((r) => r.rows, () => ({}));
    return { pack, rows, ms: Date.now() - started };
}

/**
 * How many of each kind the store has, pointed where `listPickable` reads, so a count is of the
 * list's own website and root. Reads only.
 *
 * @param pack - the pack being saved, when there is one
 */
export async function countPickable(deps: StoreChangesDeps, pack?: DatapackId, source?: DatapackStoreName): Promise<StoreKindCounts> {
    // Asked as Create Datapack opens: the pack's read starts now, so the first list finds it read
    // (`packReadCache`, walk F82). Not waited for; a failure here is the list's to report.
    if (pack) void readInstalled(deps, { pack, ...(source ? { source } : {}) }).catch(() => undefined);
    const record = pack ? await readInstallRecord(deps.files ?? nodeRecordFiles, deps.projectPath, pack) : undefined;
    return countStoreItems(await openStore(deps, pack, record));
}
