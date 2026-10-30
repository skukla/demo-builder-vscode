/**
 * The two actions step 05 adds beside install and removal (owner, 2026-10-27):
 *
 * - **What installing again would change** (`previewChanges`): for each kind, how many things
 *   this engine made would be brought up to the pack, taken out, or kept because the SC changed
 *   them, and how many rows are new, with a few names each. Reads only.
 * - **Save store changes** (`saveStoreChanges`): the store's copy of the pack (`capture.ts`:
 *   what the install record lists, and what the installed version's own rows name) written
 *   into the library as a new version of the demo's OWN pack (step 07, `demoPack.ts`); the pack
 *   installed is never written over, so the save is undone by deleting the new version. The install record then moves
 *   onto the new version, hashed afresh, so the store and it start out as one another.
 *
 * Both open the same read access the engine installs with: the project's own signed Commerce
 * client and the install target's ids (`resolveEngineTarget`).
 *
 * @module features/data-installer/services/demoBuilderEngine/storeChanges
 */

import type { PackWriteOutcome } from '../datapackTransfer';
import type { DatapackFile } from '../datapackZip';
import { loadStoreSets } from './attributeSetsKind';
import { capturePack } from './capture';
import {
    type CreatedObject,
    type RecordFiles,
    forgetInstallRecord,
    nodeRecordFiles,
    openInstallRecord,
    readInstallRecord,
    writeInstallRecord,
} from './installRecord';
import { type TargetCodes, resolveEngineTarget, sessionFor } from './installTarget';
import type { KindContext } from './kindContext';
import { productLookups } from './productLookups';
import { rebaseRecord } from './recordFingerprints';
import { type KeptContainer, containersLine, decideRemovals, keptObjects } from './removers';
import { type KindPlan, type PlannedObject, keptLine, keptOf, planRepeat, removalsOf } from './repeatInstall';
import { LINK_KIND, SOURCE_KIND, STOCK_KIND } from './stockKinds';
import { STORE_CONFIG_KIND, type SettingOutcome, packSettings, planSettings } from './storeConfigKind';
import { onceInventory, readProducts } from './storeCopies';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import type { Inventory } from '@/features/app-builder/services/storePreparation/warehouseFix';
import type { CommerceGet, CommerceSend } from '@/types/commerceWire';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';

/** What both actions need: the project's store, where its packs are read, and its path. */
export interface StoreChangesDeps {
    /** The project's signed Commerce access, or why there is none. */
    commerce: () => Promise<{ get: CommerceGet; send: CommerceSend } | { refusal: string }>;
    /** The pack's rows by kind, from the store that holds it. */
    readPack: (id: DatapackId, source: DatapackStoreName) => Promise<Record<string, unknown>>;
    /** What the pack is called and says, for the new version's catalog entry. */
    describe: (id: DatapackId) => Promise<{ displayName: string; description?: string }>;
    projectPath: string;
    /** The website and store view the project installs into. */
    target: TargetCodes | undefined;
    log: (line: string) => void;
    files?: RecordFiles;
    now?: () => Date;
}

/** A save or preview that cannot go ahead, in words an SC can act on. */
export class StoreChangesError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'StoreChangesError';
    }
}

/** How many, and at most a few of their names. */
export interface Named {
    count: number;
    names: string[];
}

/** What installing again would do to one kind. */
export interface KindChanges {
    kind: string;
    update: Named;
    /** Rows the store lacks: installing adds them. */
    add: Named;
    /**
     * Rows the store already has that this engine did not make: installing leaves them as they
     * are. Told apart for products, attributes and sets (which a save then takes into the new
     * version, as it reads them by the pack's own names) and for sources, stocks and their links
     * (which install uses as they are, `stockKinds.ts`; a switched-off source is switched on, so it
     * counts under `add`). For categories they count under `add`.
     */
    inStore: Named;
    remove: Named;
    keep: Named;
}

/** What installing a pack again would change. */
export interface ChangePreview {
    /** False when Demo Builder never installed the pack here: every row would be new. */
    installed: boolean;
    kinds: KindChanges[];
    /** The one line the install would end with, when it would keep something. */
    kept?: string;
}

/** The names shown per count: enough to recognise, never the rows. */
const NAMES_SHOWN = 3;

const named = (names: string[]): Named => ({ count: names.length, names: names.slice(0, NAMES_SHOWN) });
const labelPack = (pack: DatapackId) => `${pack.name}@${pack.version}`;

/** The engine's read access to the project's store, pointed at its install target. */
async function openStore(deps: StoreChangesDeps, pack: DatapackId): Promise<KindContext> {
    if (!deps.target) throw new StoreChangesError('Choose the website and store view to install into first.');
    const commerce = await deps.commerce();
    if ('refusal' in commerce) throw new StoreChangesError(commerce.refusal);
    const target = await resolveEngineTarget(commerce.get, deps.target);
    // Opened to read what it lists; neither action records anything through it.
    const recorder = await openInstallRecord(deps.files ?? nodeRecordFiles, deps.projectPath, pack, () => (deps.now ?? (() => new Date()))().toISOString());
    return { ...commerce, recorder, session: sessionFor(target), log: deps.log };
}

/**
 * Which of these inventory rows the store already has, matched the way install matches them
 * (`stockKinds.ts`): a source by code, and only while switched on; a stock by name; a link by its
 * stock's name and source code.
 */
async function inventoryInStore(inventory: () => Promise<Inventory>, kind: string, keys: string[]): Promise<Set<string>> {
    const { sources, stocks, links } = await inventory();
    const present = new Set<string>();
    if (kind === SOURCE_KIND) for (const s of sources) if (s.enabled !== false) present.add(s.source_code);
    if (kind === STOCK_KIND) for (const s of stocks) present.add(s.name);
    if (kind === LINK_KIND) {
        const nameOf = new Map(stocks.map((s) => [s.stock_id, s.name]));
        for (const l of links) present.add(`${nameOf.get(l.stock_id) ?? ''}/${l.source_code}`);
    }
    return new Set(keys.filter((key) => present.has(key)));
}

const INVENTORY_KINDS = new Set([SOURCE_KIND, STOCK_KIND, LINK_KIND]);

/** Which of these pack rows the store already has, for the kinds told apart (see `inStore`). */
async function alreadyInStore(ctx: KindContext, kind: string, keys: string[], inventory: () => Promise<Inventory>): Promise<Set<string>> {
    if (keys.length === 0) return new Set();
    if (INVENTORY_KINDS.has(kind)) return inventoryInStore(inventory, kind, keys);
    if (kind === 'products') {
        // Commerce matches a SKU whatever its case (install's own lookup does too).
        const found = new Set((await readProducts(ctx, keys)).map((p) => p.sku.toLowerCase()));
        return new Set(keys.filter((sku) => found.has(sku.toLowerCase())));
    }
    if (kind === 'product_attributes') {
        const lk = productLookups(ctx);
        const present = await Promise.all(keys.map((code) => lk.attribute(code).then(() => true, () => false)));
        return new Set(keys.filter((_code, i) => present[i]));
    }
    if (kind === 'attribute_sets') {
        await loadStoreSets(ctx);
        return new Set(keys.filter((name) => ctx.session.setIds.has(name)));
    }
    return new Set();
}

const keyOfObject = (object: CreatedObject) => object.key ?? object.id;

async function summarize(ctx: KindContext, plans: readonly KindPlan[], kept: readonly KeptContainer[]): Promise<KindChanges[]> {
    const keptHere = new Set(keptObjects(kept));
    const inventory = onceInventory(ctx);
    return Promise.all(
        plans.map(async ({ kind, objects, added }) => {
            const keyed = (test: (o: PlannedObject) => boolean) => objects.filter(test).map((o) => keyOfObject(o.object));
            const there = await alreadyInStore(ctx, kind, added, inventory);
            return {
                kind,
                update: named(keyed((o) => o.outcome === 'update')),
                add: named(added.filter((key) => !there.has(key))),
                inStore: named(added.filter((key) => there.has(key))),
                remove: named(keyed((o) => o.outcome === 'remove' && !keptHere.has(o.object))),
                keep: named(keyed((o) => o.outcome === 'leave-edited' || o.outcome === 'create' || keptHere.has(o.object))),
            };
        }),
    );
}

/** What installing would do to the pack's store settings (step 09), planned as the install plans them. */
async function settingsChanges(ctx: KindContext, records: unknown, created: readonly CreatedObject[]): Promise<KindChanges> {
    const plan = await planSettings(ctx.get, packSettings(records, ctx.session.websiteCode), created, ctx.session.websiteCode);
    const keys = (...outcomes: SettingOutcome[]) => named(plan.filter((p) => outcomes.includes(p.outcome)).map((p) => p.key));
    return { kind: STORE_CONFIG_KIND, update: keys('update'), add: keys('set', 'unknown-before'), inStore: keys('already'), remove: keys('remove'), keep: keys('kept') };
}

/**
 * What installing the pack again would do, by kind. Writes nothing to the store or the record.
 *
 * @param dataTypes - the kinds to look at; all the pack holds when absent
 */
export async function previewChanges(deps: StoreChangesDeps, pack: DatapackId, source: DatapackStoreName, dataTypes?: string[]): Promise<ChangePreview> {
    const all = await deps.readPack(pack, source);
    const items = dataTypes ? Object.fromEntries(Object.entries(all).filter(([kind]) => dataTypes.includes(kind))) : all;
    const record = await readInstallRecord(deps.files ?? nodeRecordFiles, deps.projectPath, pack);
    const ctx = await openStore(deps, pack);
    const plans = await planRepeat(ctx, items, record?.created ?? []);
    // The containers an install would keep, decided the way it decides them, read-only.
    const { kept: containers } = await decideRemovals(ctx.get, removalsOf(plans));
    const settings = STORE_CONFIG_KIND in items ? await settingsChanges(ctx, items[STORE_CONFIG_KIND], record?.created ?? []) : undefined;
    const keptThings = [...keptOf(plans), ...(settings?.keep.names ?? []).map((key) => ({ kind: STORE_CONFIG_KIND, key }))];
    const kept = [keptLine(keptThings), containersLine(containers)].filter(Boolean).join(' ');
    const kinds = [...(await summarize(ctx, plans, containers)), ...(settings ? [settings] : [])];
    return { installed: record !== undefined, kinds, ...(kept ? { kept } : {}) };
}

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

/** What a save did. */
export interface SaveResult {
    /** The new version, now in the library and on the install record. */
    saved: DatapackId;
    /** How many of each kind it holds. */
    counts: Record<string, number>;
    /** The store the installed version's own rows were read from. */
    readFrom: DatapackStoreName;
    /** The one sentence the SC reads. */
    sentence: string;
}

/**
 * Save the store's copy of a pack Demo Builder installed here as a new version of it.
 *
 * @param write - writes the new version into the library (`writePackToStore`, never `update`)
 * @param report - called as each stage starts, for the progress window
 * @throws StoreChangesError when Demo Builder did not install the pack here, the store holds
 *   nothing of it, or the library refused part of it (then the record stays where it was)
 */
export async function saveStoreChanges(
    deps: StoreChangesDeps,
    target: { pack: DatapackId; source?: DatapackStoreName; saveAs: SaveAs },
    write: (file: DatapackFile) => Promise<PackWriteOutcome>,
    report: (stage: string) => void = () => undefined,
): Promise<SaveResult> {
    const { pack } = target;
    const files = deps.files ?? nodeRecordFiles;
    const record = await readInstallRecord(files, deps.projectPath, pack);
    if (!record) throw new StoreChangesError(`Demo Builder did not install ${labelPack(pack)} in this project, so there are no store changes of it to save.`);
    report(OPERATION_STAGES.readingStoreChanges.label);
    const installed = await readInstalled(deps, target);
    const ctx = await openStore(deps, pack);
    const captured = await capturePack(ctx, record.created, installed.rows);
    if (Object.keys(captured.items).length === 0) throw new StoreChangesError(`The store no longer holds anything ${labelPack(pack)} made, so there is nothing to save.`);
    const now = (deps.now ?? (() => new Date()))();
    const saved = target.saveAs.id;
    const about = await deps.describe(pack);
    report(OPERATION_STAGES.savingToLibrary.label);
    const outcome = await write({
        id: saved,
        displayName: target.saveAs.displayName,
        ...(about.description ? { description: about.description } : {}),
        items: Object.entries(captured.items).map(([dataType, records]) => ({ dataType, records })),
        source: 'library',
        exportedAt: now.toISOString(),
    });
    if (outcome.failed.length > 0) {
        const reasons = outcome.failed.map((f) => `${f.dataType}: ${f.reason}`).join('; ');
        throw new StoreChangesError(`The library did not take all of ${labelPack(saved)} (${reasons}). Delete that version from the library and try again.`);
    }
    const created = await rebaseRecord(ctx, record.created, captured.items);
    await writeInstallRecord(files, deps.projectPath, { ...record, pack: saved, created });
    await forgetInstallRecord(files, deps.projectPath, pack);
    return {
        saved,
        counts: captured.counts,
        readFrom: installed.source,
        sentence: savedSentence(target.saveAs, pack, about.displayName),
    };
}

/** "Saved to the Acme Demo pack.", and that the pack it came from is unchanged when it is another. */
function savedSentence(saveAs: SaveAs, installed: DatapackId, installedName: string): string {
    const where = `Saved to the ${saveAs.displayName} pack.`;
    return saveAs.id.name === installed.name ? where : `${where} ${installedName} is unchanged.`;
}
