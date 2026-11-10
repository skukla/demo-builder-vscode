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
 * A save from a pack takes everything this demo uses (`demoUses.ts`, owner, 2026-11-09, walk F85),
 * with nothing to tick: the pack's data as the store holds it now, and whatever of the demo's the
 * pack does not hold yet. Picks add what the demo does not use yet (Add Items). So nothing of what
 * the demo uses is left out, and the left-out list is a save from nothing's alone.
 *
 * `listPickable` is the pick list: one kind of the store's items, less what the pack being saved
 * holds already; or, for Add Items, what this demo does not use. `countPickable` is what its cards
 * are greyed by: how many of each kind.
 *
 * @module features/data-installer/services/demoBuilderEngine/saveStore
 */

import { type LeftOut, PICKABLE_KINDS, type PickableKind, type StoreItemPage, type StoreKindCounts, type StorePicks, pickCount } from '../../pickableKinds';
import { STORE_CONFIG_KIND, settingsLayerName } from '../datapackCatalog';
import type { PackWriteOutcome } from '../datapackTransfer';
import type { DatapackFile } from '../datapackZip';
import { capturePack } from './capture';
import { captureLines, captureRows } from './capturePhases';
import { demoUses } from './demoUses';
import { type CreatedObject, type InstallRecord, type RecordFiles, forgetInstallRecord, nodeRecordFiles, readInstallRecord, writeInstallRecord } from './installRecord';
import { jobClock } from './jobClock';
import type { KindContext } from './kindContext';
import { lookUpLayer } from './layerStep';
import { rebaseRecord } from './recordFingerprints';
import { packRowRefusals } from './runPack';
import { layerLine, leftOutLine, resultLines, savedSentence, saveSentence, savingLine, unnamedLine } from './saveOutcome';
import { NOTHING_TO_SAVE, unchangedPack } from './saveUnchanged';
import { type StoreChangesDeps, StoreChangesError, labelPack, openStore } from './storeAccess';
import { countStoreItems, holdsOf, leftOutOf, listStoreItems, readWebsiteProductsWhole, seedsOf } from './storeItems';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import type { CommerceProduct } from '@/types/commerceWire';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';
import type { OperationPosition, OperationRow } from '@/types/webviewPayloads';

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
        `${labelPack(target.pack)} cannot be read from the library or the Data Installer, so the products it holds that Commerce already had cannot be saved with it. Nothing was saved.`,
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
    /**
     * Things picked to go in too: from nothing, all there is; from a pack, what the demo does not use
     * yet (Add Items). Never put on the install record.
     */
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
    /** The name the SC knows the installed pack by, when the save started from one. */
    installedName?: string;
    /** Nothing changed since the version the demo uses, so nothing was written (walk F89): `saved` is that version. */
    unchanged?: true;
}

/** What a save starts from: the record and the installed version's rows, when there is a pack. */
interface SaveStart {
    record?: InstallRecord;
    installed: { rows: Record<string, unknown>; source?: DatapackStoreName };
}

async function startSave(deps: StoreChangesDeps, target: SaveTarget, files: RecordFiles): Promise<SaveStart> {
    const { pack } = target;
    if (!pack) {
        if (pickCount(target.picks ?? {}) === 0) throw new StoreChangesError('Select at least one item from Commerce to save. Nothing was saved.');
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
    throw new StoreChangesError(`Some of ${labelPack(file.id)} could not be saved to My Datapacks (${reasons}). Delete ${labelPack(version)} from My Datapacks and try again.`);
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
    report: (stage: string, step?: string, position?: OperationPosition, rows?: OperationRow[]) => void = () => undefined,
): Promise<SaveResult> {
    const { pack, saveAs } = target;
    const files = deps.files ?? nodeRecordFiles;
    // At once, so the window leaves "Starting" as the save begins, saying what it does first (walk F90).
    report(OPERATION_STAGES.readingStoreChanges.label, firstStep(target));
    const { record, installed } = await startSave(deps, target, files);
    // The rows from here (walk F91), the data types known so far; what the demo uses may add some.
    report(OPERATION_STAGES.readingStoreChanges.label, firstStep(target), undefined, preparingRows(record, installed.rows, target));
    // Each step's time in Debug Logs (walk F87: a save from Luma took 4 minutes and said nothing of where).
    const took = jobClock(deps.log, `Save of ${saveAs.displayName}`);
    const ctx = await openStore(deps, pack ?? saveAs.id, record);
    const { picks, products } = await picksOf(ctx, record, installed.rows, target.picks);
    took(`found what the demo uses, ${pickCount(picks)} not in the pack`);
    const seeds = [...(record?.created ?? []), ...seedsOf(picks)];
    const seeded = [...seeds.map((seed) => seed.kind), ...Object.keys(installed.rows)];
    const lineFor = captureLines(seeded);
    const progress = captureRows(seeded);
    const reading = (at: number): void => {
        took(`reading ${lineFor(at)}`);
        report(OPERATION_STAGES.readingStoreChanges.label, lineFor(at), undefined, progress.reading(at));
    };
    reading(0);
    const named = await namedByInstalled(deps, pack, installed.rows);
    const captured = await capturePack(ctx, seeds, named, reading, products);
    const { rows, layerRows } = splitSettings(captured.items, STORE_CONFIG_KIND in installed.rows);
    if (Object.keys(rows).length === 0) {
        throw new StoreChangesError(pack ? `Commerce no longer holds anything ${labelPack(pack)} made, so there is nothing to save.` : 'Commerce holds none of what was picked, so there is nothing to save.');
    }
    took('read the store');
    refuseUninstallable(captured.items);
    const counts = Object.fromEntries(Object.entries(captured.counts).filter(([kind]) => kind in rows));
    // Into the demo's own pack, with nothing changed: nothing written, the version the demo uses stays (F89).
    const unchanged = unchangedPack(pack, saveAs.id.name, installed.rows, rows, layerRows !== undefined);
    if (unchanged) {
        took('nothing changed: nothing written');
        return { saved: unchanged, counts, sentence: NOTHING_TO_SAVE, details: [], unnamed: [], leftOut: [], unchanged: true };
    }
    // From a pack, everything the demo uses is in: only a save from nothing leaves anything out.
    const leftOut = pack ? [] : await leftOutOf(ctx, captured.items);
    const about = pack ? await deps.describe(pack) : undefined;
    report(OPERATION_STAGES.savingToLibrary.label, savingLine(Object.keys(rows)), undefined, progress.finishing(SAVING_STEP));
    const items = Object.entries(rows).map(([dataType, records]) => ({ dataType, records }));
    const exportedAt = (deps.now ?? (() => new Date()))().toISOString();
    await writeVersion(write, { id: saveAs.id, displayName: saveAs.displayName, ...(about?.description ? { description: about.description } : {}), items, source: 'library', exportedAt });
    const layer = layerRows ? layerFile(saveAs, layerRows, exportedAt) : undefined;
    if (layer) await writeVersion(write, layer, saveAs.id);
    took('saved to the library');
    const settingsLayer = layer && layerRows ? { datapackName: layer.id.name, version: layer.id.version, settings: layerRows.length } : undefined;
    if (pack && record) {
        report(OPERATION_STAGES.savingToLibrary.label, RECORD_STEP, undefined, progress.finishing(RECORD_STEP));
        // Only what the engine made moves onto the new version: a pick it did not make stays the SC's.
        await writeInstallRecord(files, deps.projectPath, { ...record, pack: saveAs.id, created: await rebaseRecord(ctx, record.created, captured.items, captured) });
        await forgetInstallRecord(files, deps.projectPath, pack);
    }
    const installedAs = installedAsOf(pack, about);
    return {
        saved: saveAs.id,
        counts,
        ...(installed.source ? { readFrom: installed.source } : {}),
        sentence: saveSentence(savedSentence(saveAs, installedAs), layerLine(settingsLayer), leftOutLine(leftOut), unnamedLine(captured.unnamed)),
        details: resultLines(pack !== undefined && saveAs.id.name === pack.name ? leftOut : [], settingsLayer, captured.unnamed),
        unnamed: captured.unnamed,
        leftOut,
        ...(settingsLayer ? { settingsLayer } : {}),
        ...(installedAs ? { installedName: installedAs.displayName } : {}),
    };
}

/** The last row's line while the save writes: the write, then the record moved onto the new version (`rebaseRecord`). */
const SAVING_STEP = 'Saving to My Datapacks';
const RECORD_STEP = "Updating this demo's record";

/** The rows before what the demo uses is known: the kinds the record, the pack and the picks name. */
function preparingRows(record: InstallRecord | undefined, rows: Record<string, unknown>, target: SaveTarget): OperationRow[] {
    const kinds = [...(record?.created ?? []).map((o) => o.kind), ...Object.keys(rows), ...seedsOf(target.picks ?? {}).map((o) => o.kind)];
    return captureRows(kinds).preparing(firstStep(target) ?? 'Reading what was selected');
}

/**
 * Everything this demo uses that the pack does not hold yet, by kind (walk F85): what the SC added
 * in the Admin. A kind the store cannot list stops the save, rather than save the demo without it.
 */
async function demoPicks(ctx: KindContext, created: readonly CreatedObject[], rows: Record<string, unknown>, websiteProducts: Promise<CommerceProduct[]> | undefined): Promise<StorePicks> {
    const uses = demoUses(ctx, websiteProducts);
    const added = await Promise.all(
        PICKABLE_KINDS.map(async (kind) => {
            const started = Date.now();
            const holds = holdsOf(kind, created, rows);
            const ids = (await uses.of(kind)).used.filter((item) => !holds(item)).map((item) => item.id);
            ctx.log(`what the demo uses: ${kind} in ${Date.now() - started} ms, ${ids.length} not in the pack`);
            return [kind, ids] as const;
        }),
    );
    return Object.fromEntries(added.filter(([, ids]) => ids.length > 0));
}

/**
 * What a save takes beyond the record: from a pack, all the demo uses and Add Unused Items's picks;
 * from nothing, the picks. From a pack, the website's products are read whole once, both to find
 * what the demo uses and as the products capture turns into rows (walk F90).
 */
async function picksOf(ctx: KindContext, record: InstallRecord | undefined, rows: Record<string, unknown>, chosen: StorePicks | undefined): Promise<{ picks: StorePicks; products: CommerceProduct[] }> {
    if (!record) return { picks: chosen ?? {}, products: [] };
    const websiteProducts = readWebsiteProductsWhole(ctx);
    void websiteProducts.catch(() => undefined); // its failure reaches whoever awaits it, never as an unhandled one
    const picks = withPicks(await demoPicks(ctx, record.created, rows, websiteProducts), chosen);
    return { picks, products: await websiteProducts };
}

/** The demo's picks and the SC's, each id once. */
function withPicks(demo: StorePicks, chosen: StorePicks | undefined): StorePicks {
    const all: StorePicks = { ...demo };
    for (const kind of PICKABLE_KINDS) {
        const more = chosen?.[kind] ?? [];
        if (more.length > 0) all[kind] = [...new Set([...(all[kind] ?? []), ...more])];
    }
    return all;
}

/** What the window's second row says before the data types are known: from a pack, the demo's data is found first. */
function firstStep(target: SaveTarget): string | undefined {
    return target.pack ? 'Finding what this demo uses' : undefined;
}

/** The installed pack as the SC knows it, when the save started from one. */
function installedAsOf(pack: DatapackId | undefined, about: { displayName: string } | undefined): { id: DatapackId; displayName: string } | undefined {
    return pack && about ? { id: pack, displayName: about.displayName } : undefined;
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
 * @param unused - Add Items: only what this demo does not use (`demoUses.ts`)
 */
export async function listPickable(deps: StoreChangesDeps, kind: PickableKind, pack?: DatapackId, source?: DatapackStoreName, unused = false): Promise<StoreItemPage> {
    const started = Date.now();
    const record = pack ? await readInstallRecord(deps.files ?? nodeRecordFiles, deps.projectPath, pack) : undefined;
    const listOf = (ctx: KindContext) => (unused ? demoUses(ctx).of(kind).then((use) => ({ items: use.unused, excluded: 0 })) : listStoreItems(ctx, kind));
    // Commerce and the pack are read at once; the pack once a visit (`packReadCache`, walk F81).
    const [store, held] = await Promise.all([
        openStore(deps, pack, record).then(listOf).then((listed) => ({ ...listed, ms: Date.now() - started })),
        pack ? packRowsOf(deps, pack, source) : Promise.resolve(undefined),
    ]);
    const { items, excluded } = store;
    const rows = held?.rows ?? {};
    deps.log(`Listed ${kind}: Commerce in ${store.ms} ms${held ? `, ${labelPack(held.pack)} in ${held.ms} ms` : ''}`);
    const holds = holdsOf(kind, record?.created ?? [], rows);
    const offered = items.filter((item) => !holds(item));
    // Add Items says nothing of the pack: what it holds is not what the SC is choosing among.
    return { items: offered, totalCount: items.length, excludedCount: excluded, inPackCount: unused ? 0 : items.length - offered.length };
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
