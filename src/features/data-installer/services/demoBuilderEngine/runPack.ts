/**
 * Install a whole pack, kind by kind in the order the store needs, and remove one from its
 * install record (DI-5).
 *
 * The order is the service's (catalog spec §0): sets before the attributes put in them,
 * categories and stock before the products that name them, products before their quantities.
 * A pack holding a kind this engine cannot install is refused before anything is written, so a
 * half-installed pack is never the answer to "we don't do customers yet".
 *
 * Removal walks the record in reverse, dropping each object from it as it goes, so a removal
 * that stops part way can be run again; the record goes once it is empty.
 *
 * @module features/data-installer/services/demoBuilderEngine/runPack
 */

import { installAssignments, installAttributeSets, parseAssignmentRows, parseAttributeSetRows } from './attributeSetsKind';
import { installAttributes, parseAttributeRows } from './attributesKind';
import { installCategories, parseCategoryPack } from './categoriesKind';
import {
    type RecordFiles,
    forgetInstallRecord,
    openInstallRecord,
    readInstallRecord,
    removalOrder,
} from './installRecord';
import type { KindContext } from './kindContext';
import { installProducts, parseProductRows } from './productsKind';
import { recordFingerprints } from './recordFingerprints';
import { type KeptContainer, type RemovalAccess, decideRemovals, takeBack } from './removers';
import { type KeptThing, applyRemovals, applyUpdates, keptOf, ownedFrom, planRepeat } from './repeatInstall';
import { installSourceItems, parseSourceItems } from './sourceItemsKind';
import {
    installSources,
    installStockSourceLinks,
    installStocks,
    parseSources,
    parseStockSourceLinks,
    parseStocks,
} from './stockKinds';
import type { DatapackId } from '@/types/datapack';

/** A pack's rows, by data kind, as its items hold them. */
export type PackItems = Record<string, unknown>;

/** One kind: how its rows are read, and how they are installed. */
interface KindStep {
    kind: string;
    install: (ctx: KindContext, records: unknown) => Promise<void>;
}

/** The kinds this engine installs, in the order it installs them. */
const STEPS: readonly KindStep[] = [
    { kind: 'attribute_sets', install: (ctx, r) => installAttributeSets(ctx, parseAttributeSetRows(r)) },
    { kind: 'product_attributes', install: (ctx, r) => installAttributes(ctx, parseAttributeRows(r)) },
    { kind: 'attribute_assign_to_set', install: (ctx, r) => installAssignments(ctx, parseAssignmentRows(r)) },
    { kind: 'categories', install: (ctx, r) => installCategories(ctx, parseCategoryPack(r)) },
    { kind: 'stocks', install: (ctx, r) => installStocks(ctx, parseStocks(r)) },
    { kind: 'sources', install: (ctx, r) => installSources(ctx, parseSources(r)) },
    { kind: 'stock_source_links', install: (ctx, r) => installStockSourceLinks(ctx, parseStockSourceLinks(r)) },
    { kind: 'products', install: (ctx, r) => installProducts(ctx, parseProductRows(r)) },
    { kind: 'source_items', install: (ctx, r) => installSourceItems(ctx, parseSourceItems(r)) },
];

/** The kinds this engine can install, in order. */
export const INSTALLABLE_KINDS: readonly string[] = STEPS.map((step) => step.kind);

/** A pack holds kinds this engine does not install yet; nothing was written. */
export class UnsupportedKindsError extends Error {
    constructor(readonly kinds: string[]) {
        super(`Demo Builder does not install ${kinds.join(', ')} yet, so nothing was installed.`);
        this.name = 'UnsupportedKindsError';
    }
}

/** The pack's kinds this engine cannot install. */
export function unsupportedKinds(items: PackItems): string[] {
    return Object.keys(items).filter((kind) => !INSTALLABLE_KINDS.includes(kind));
}

/** What an install did beyond writing the pack: the SC's own changes it kept. */
export interface InstallOutcome {
    /** What it kept because the SC changed or deleted it in the Admin. */
    kept: KeptThing[];
    /** Containers it did not take out because they hold what the engine did not make. */
    containers: KeptContainer[];
}

/**
 * Install every kind the pack holds, in order. Installing again brings what this engine made up
 * to the pack, takes out what the pack no longer has, and keeps the SC's own edits
 * (`repeatInstall.ts`); then everything made or changed is read back and hashed.
 *
 * @param onKind - called as each kind starts, for progress
 * @throws UnsupportedKindsError before any write, when the pack holds a kind not listed above
 */
export async function installPack(ctx: KindContext, items: PackItems, onKind: (kind: string) => void = () => undefined): Promise<InstallOutcome> {
    const unsupported = unsupportedKinds(items);
    if (unsupported.length > 0) throw new UnsupportedKindsError(unsupported);
    const plans = await planRepeat(ctx, items, ctx.recorder.created);
    ctx.session.owned = ownedFrom(plans);
    // Hashed means an earlier install finished with it; one that stopped part-way left its
    // products unhashed, and a re-run still sets their quantities.
    ctx.session.productsBefore = new Set(
        ctx.recorder.created.filter((o) => o.kind === 'products' && o.fingerprint !== undefined).map((o) => o.id),
    );
    for (const step of STEPS) {
        if (!(step.kind in items)) continue;
        onKind(step.kind);
        await applyUpdates(ctx, plans, step.kind);
        await step.install(ctx, items[step.kind]);
    }
    const containers = await applyRemovals(ctx, plans);
    await recordFingerprints(ctx, items);
    return { kept: keptOf(plans), containers };
}

/** What a removal did. */
export interface RemovalResult {
    /** Objects taken back. */
    removed: number;
    /** True when the pack had no record: this engine never installed it here. */
    noRecord: boolean;
    /**
     * Containers the pack made that were kept because they hold what the engine did not make
     * (step 05). They stay on the record, so a later removal takes them once they are empty.
     */
    kept: KeptContainer[];
}

/**
 * Take back everything the record lists, newest first, dropping each from the record as it
 * goes; keep a category or set that holds what the engine did not make (`decideRemovals`); delete
 * the record once it is empty.
 *
 * @throws Error naming the object when Commerce refuses one; what was taken back stays off the
 *   record, so running it again carries on from there
 */
export async function removePack(
    commerce: RemovalAccess,
    files: RecordFiles,
    target: { projectPath: string; pack: DatapackId },
): Promise<RemovalResult> {
    const record = await readInstallRecord(files, target.projectPath, target.pack);
    if (!record) return { removed: 0, noRecord: true, kept: [] };
    const recorder = await openInstallRecord(files, target.projectPath, target.pack, () => record.startedAt);
    const { take, kept } = await decideRemovals(commerce.get, removalOrder(record));
    for (const object of take) {
        await takeBack(commerce, object);
        await recorder.drop(object);
    }
    if (kept.length === 0) await forgetInstallRecord(files, target.projectPath, target.pack);
    return { removed: take.length, noRecord: false, kept };
}
