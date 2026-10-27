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

import type { DatapackId } from '../../types';
import {
    installAssignments,
    installAttributeSets,
    parseAssignmentRows,
    parseAttributeSetRows,
    removeAssignment,
    removeAttributeSet,
} from './attributeSetsKind';
import { installAttributes, parseAttributeRows, removeAttribute, removeAttributeOption } from './attributesKind';
import { installCategories, parseCategoryPack, removeCategory } from './categoriesKind';
import {
    type CreatedObject,
    type RecordFiles,
    forgetInstallRecord,
    openInstallRecord,
    readInstallRecord,
    removalOrder,
} from './installRecord';
import type { KindContext } from './kindContext';
import { installProducts, parseProductRows, removeProduct } from './productsKind';
import { installSourceItems, parseSourceItems } from './sourceItemsKind';
import {
    installSources,
    installStockSourceLinks,
    installStocks,
    parseSources,
    parseStockSourceLinks,
    parseStocks,
    removeSource,
    removeStock,
    removeStockSourceLink,
} from './stockKinds';
import type { CommerceGet, CommerceSend } from '@/types/commerceWire';

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

/**
 * Install every kind the pack holds, in order.
 *
 * @param onKind - called as each kind starts, for progress
 * @throws UnsupportedKindsError before any write, when the pack holds a kind not listed above
 */
export async function installPack(ctx: KindContext, items: PackItems, onKind: (kind: string) => void = () => undefined): Promise<void> {
    const unsupported = unsupportedKinds(items);
    if (unsupported.length > 0) throw new UnsupportedKindsError(unsupported);
    for (const step of STEPS) {
        if (!(step.kind in items)) continue;
        onKind(step.kind);
        await step.install(ctx, items[step.kind]);
    }
}

/** Commerce access for removal. */
export interface RemovalAccess {
    get: CommerceGet;
    send: CommerceSend;
}

type Remover = (commerce: RemovalAccess, object: CreatedObject) => Promise<void>;

/** How each recorded kind is taken back. */
const REMOVERS: Record<string, Remover> = {
    attribute_sets: (c, o) => removeAttributeSet(c.send, o.id),
    product_attributes: (c, o) => removeAttribute(c.send, o.id),
    attribute_options: (c, o) => removeAttributeOption(c.send, o.id),
    attribute_assign_to_set: (c, o) => removeAssignment(c.send, o.id),
    categories: (c, o) => removeCategory(c.send, o.id),
    stocks: (c, o) => removeStock(c, o),
    sources: (c, o) => removeSource(c, o.id),
    stock_source_links: (c, o) => removeStockSourceLink(c.send, o.id),
    products: (c, o) => removeProduct(c.send, o.id),
};

/** What a removal did. */
export interface RemovalResult {
    /** Objects taken back. */
    removed: number;
    /** True when the pack had no record: this engine never installed it here. */
    noRecord: boolean;
}

/**
 * Take back everything the record lists, newest first, dropping each from the record as it
 * goes; delete the record once it is empty.
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
    if (!record) return { removed: 0, noRecord: true };
    const recorder = await openInstallRecord(files, target.projectPath, target.pack, () => record.startedAt);
    let removed = 0;
    for (const object of removalOrder(record)) {
        const remover = REMOVERS[object.kind];
        if (!remover) throw new Error(`The install record lists a ${object.kind}, which Demo Builder cannot take back.`);
        try {
            await remover(commerce, object);
        } catch (error) {
            throw new Error(`Could not take back ${object.kind} ${object.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
        await recorder.drop(object);
        removed += 1;
    }
    await forgetInstallRecord(files, target.projectPath, target.pack);
    return { removed, noRecord: false };
}
