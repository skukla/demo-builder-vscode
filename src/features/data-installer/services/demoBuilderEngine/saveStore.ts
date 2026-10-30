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
 * Before anything is stored the version is checked by the install's own parsers (`packShape.ts`).
 * Its sentence says where it saved, what of the store it left out because nothing picked it, and
 * which ids it kept because the store could not name them (`saveOutcome.ts`).
 *
 * `listPickable` is the save's pick list: one kind of the store's items, less what the pack being
 * saved holds already.
 *
 * @module features/data-installer/services/demoBuilderEngine/saveStore
 */

import { type LeftOut, type PickableKind, type StoreItemPage, type StorePicks, pickCount } from '../../pickableKinds';
import type { PackWriteOutcome } from '../datapackTransfer';
import type { DatapackFile } from '../datapackZip';
import { capturePack } from './capture';
import { type InstallRecord, type RecordFiles, forgetInstallRecord, nodeRecordFiles, readInstallRecord, writeInstallRecord } from './installRecord';
import { shapeRefusals } from './packShape';
import { rebaseRecord } from './recordFingerprints';
import { leftOutLine, savedSentence, saveSentence, unnamedLine } from './saveOutcome';
import { type StoreChangesDeps, StoreChangesError, labelPack, openStore } from './storeAccess';
import { holdsOf, leftOutOf, listStoreItems, seedsOf } from './storeItems';
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
    /** The one sentence the SC reads. */
    sentence: string;
    /** Each id kept because the store could not name it, as "category 57" (step 14). */
    unnamed: string[];
    /** What the store has, of the kinds an SC adds by hand, that the new version does not hold. */
    leftOut: LeftOut[];
}

/** What a save starts from: the record and the installed version's rows, when there is a pack. */
interface SaveStart {
    record?: InstallRecord;
    installed: { rows: Record<string, unknown>; source?: DatapackStoreName };
}

async function startSave(deps: StoreChangesDeps, target: SaveTarget, files: RecordFiles): Promise<SaveStart> {
    const { pack } = target;
    if (!pack) {
        if (pickCount(target.picks ?? {}) === 0) throw new StoreChangesError('Pick at least one thing from the store to save. Nothing was saved.');
        return { installed: { rows: {} } };
    }
    const record = await readInstallRecord(files, deps.projectPath, pack);
    if (!record) throw new StoreChangesError(`Demo Builder did not install ${labelPack(pack)} in this project, so there are no store changes of it to save.`);
    return { record, installed: await readInstalled(deps, { pack, ...(target.source ? { source: target.source } : {}) }) };
}

/** Write the new version into the library; a version it took only part of stops the save. */
async function writeVersion(write: (file: DatapackFile) => Promise<PackWriteOutcome>, file: DatapackFile): Promise<void> {
    const outcome = await write(file);
    if (outcome.failed.length === 0) return;
    const reasons = outcome.failed.map((f) => `${f.dataType}: ${f.reason}`).join('; ');
    throw new StoreChangesError(`The library did not take all of ${labelPack(file.id)} (${reasons}). Delete that version from the library and try again.`);
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
    report: (stage: string) => void = () => undefined,
): Promise<SaveResult> {
    const { pack, saveAs } = target;
    const files = deps.files ?? nodeRecordFiles;
    const { record, installed } = await startSave(deps, target, files);
    report(OPERATION_STAGES.readingStoreChanges.label);
    const ctx = await openStore(deps, pack ?? saveAs.id, record);
    const captured = await capturePack(ctx, [...(record?.created ?? []), ...seedsOf(target.picks ?? {})], installed.rows);
    if (Object.keys(captured.items).length === 0) {
        throw new StoreChangesError(pack ? `The store no longer holds anything ${labelPack(pack)} made, so there is nothing to save.` : 'The store holds none of what was picked, so there is nothing to save.');
    }
    refuseUninstallable(captured.items);
    const leftOut = await leftOutOf(ctx, captured.items);
    const about = pack ? await deps.describe(pack) : undefined;
    report(OPERATION_STAGES.savingToLibrary.label);
    const items = Object.entries(captured.items).map(([dataType, records]) => ({ dataType, records }));
    const exportedAt = (deps.now ?? (() => new Date()))().toISOString();
    await writeVersion(write, { id: saveAs.id, displayName: saveAs.displayName, ...(about?.description ? { description: about.description } : {}), items, source: 'library', exportedAt });
    if (pack && record) {
        // Only what the engine made moves onto the new version: a pick it did not make stays the SC's.
        await writeInstallRecord(files, deps.projectPath, { ...record, pack: saveAs.id, created: await rebaseRecord(ctx, record.created, captured.items) });
        await forgetInstallRecord(files, deps.projectPath, pack);
    }
    const installedAs = pack && about ? { id: pack, displayName: about.displayName } : undefined;
    return {
        saved: saveAs.id,
        counts: captured.counts,
        ...(installed.source ? { readFrom: installed.source } : {}),
        sentence: saveSentence(savedSentence(saveAs, installedAs), leftOutLine(leftOut), unnamedLine(captured.unnamed)),
        unnamed: captured.unnamed,
        leftOut,
    };
}

/**
 * Stop before storing a version the install would refuse (step 14, item 13): it would fail at
 * the next install, on whichever store that is, long after this save.
 */
function refuseUninstallable(items: Record<string, unknown>): void {
    const refused = shapeRefusals(items);
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
    const record = pack ? await readInstallRecord(deps.files ?? nodeRecordFiles, deps.projectPath, pack) : undefined;
    const ctx = await openStore(deps, pack, record);
    const { items, excluded } = await listStoreItems(ctx, kind);
    const rows = pack ? await readInstalled(deps, { pack, ...(source ? { source } : {}) }).then((r) => r.rows, () => ({})) : {};
    const holds = holdsOf(kind, record?.created ?? [], rows);
    const offered = items.filter((item) => !holds(item));
    return { items: offered, totalCount: items.length, excludedCount: excluded, inPackCount: items.length - offered.length };
}
