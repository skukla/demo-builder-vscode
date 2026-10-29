/**
 * The `erp-warehouse-in-website-stock` fix (AB-77): a source (warehouse) per ERP, a stock
 * for the project's website with that website as its sales channel, and the sources linked
 * to it, through the inventory routes the check already reads (`POST inventory/sources`,
 * `POST inventory/stocks`, `POST inventory/stock-source-links`; the bodies from Magento's
 * InventoryApi contracts and the data installer's processors).
 *
 * Moving product quantities to the new source is a separate step, said in the result: it is
 * a per-product decision (how much of what each ERP holds) that `POST inventory/source-items`
 * could write in bulk, but nothing here knows the quantities, so it is not offered.
 *
 * The undo unlinks, deletes a stock this run created, and DISABLES a source this run created
 * or switched back on: Commerce cannot delete a source, and the result says so. It keeps what
 * changed since (datapack-engine step 06, AB-83), by the one rule (`decideOwnedChange`) over one
 * read of the inventory's three lists: a stock holding a source the fix did not link is kept,
 * with the fix's own links still taken out; a source is switched off only while its row in the
 * sources list hashes as the apply left it (`sourceFingerprints`). What it kept, it says in one
 * line; a kept stock stays on the step's record (`remaining`), so a later undo deletes it once it
 * holds no source. A read that fails stops the undo before it writes anything.
 *
 * @module features/app-builder/services/storePreparation/warehouseFix
 */

import { errorText, type FixApplied, type FixDeps, type FixPreview, type FixUndone, type StepFix } from './fixContract';
import { andList } from '@/core/utils/andList';
import { decideOwnedChange } from '@/core/utils/ownedChange';
import { fingerprintRow } from '@/features/data-installer/services/demoBuilderEngine/fingerprint';
import type {
    CommerceGet,
    CommerceInventorySource,
    CommerceInventorySourceList,
    CommerceInventoryStock,
    CommerceInventoryStockList,
    CommerceStockSourceLink,
    CommerceStockSourceLinkList,
} from '@/types/commerceWire';
import type { StorePreparationStepRecord, WarehouseStepRecord } from '@/types/storePreparation';

const SOURCES_PATH = 'inventory/sources?searchCriteria[pageSize]=200';
const STOCKS_PATH = 'inventory/stocks?searchCriteria[pageSize]=200';
const LINKS_PATH = 'inventory/stock-source-links?searchCriteria[pageSize]=200';
const DEFAULT_STOCK_ID = 1;
/** A source needs a country and a postcode; the demo warehouse has no real address. */
const SOURCE_ADDRESS = { country_id: 'US', postcode: '00000' };
export const MOVE_STOCK_MANUAL =
    "Moving each product's quantities to the new warehouse is a separate step: Catalog > Products, or a datapack's source items.";

/** "Justrite ERP" → `justrite_warehouse` / "Justrite Warehouse". */
export function warehouseFor(erpName: string): { code: string; name: string } {
    const short = erpName.replace(/\s+ERP$/iu, '').trim() || erpName;
    const slug = short.toLowerCase().replace(/[^a-z0-9]+/gu, '_').replace(/^_+|_+$/gu, '') || 'erp';
    return { code: `${slug}_warehouse`, name: `${short} Warehouse` };
}

export interface Inventory {
    sources: CommerceInventorySource[];
    stocks: CommerceInventoryStock[];
    links: CommerceStockSourceLink[];
}

/** The store's sources, stocks and their links. Shared with the datapack engine (DI-5). */
export async function readInventory(get: CommerceGet): Promise<Inventory> {
    const sources = ((await get(SOURCES_PATH)) as CommerceInventorySourceList | null)?.items ?? [];
    const stocks = ((await get(STOCKS_PATH)) as CommerceInventoryStockList | null)?.items ?? [];
    const links = ((await get(LINKS_PATH)) as CommerceStockSourceLinkList | null)?.items ?? [];
    return { sources, stocks, links };
}

export const sellsTo = (stock: CommerceInventoryStock, websiteCode: string): boolean =>
    (stock.extension_attributes?.sales_channels ?? []).some((channel) => channel.type === 'website' && channel.code === websiteCode);

interface Plan {
    newSources: Array<{ code: string; name: string }>;
    /** Every ERP's warehouse, existing or new, by code. */
    sourceCodes: string[];
    stock: { existing: CommerceInventoryStock } | { create: string };
    linksToAdd: string[];
    /**
     * ERP warehouses that exist but are switched off, by code: what an undo leaves, since
     * Commerce cannot delete a source. The check counts a switched-off warehouse as not
     * done, so applying again must switch it back on (AB-82, Justrite 2026-10-26).
     */
    toEnable: string[];
}

/** What the fix would do, against the inventory as it stands. */
function planFor(inventory: Inventory, deps: FixDeps): Plan {
    const websiteCode = deps.websiteCode;
    if (!websiteCode) throw new Error('The project names no Commerce website, so no stock can sell to it.');
    const wanted = deps.erpNames.map(warehouseFor);
    const newSources = wanted.filter((w) => !inventory.sources.some((s) => s.source_code === w.code || s.name === w.name));
    const found = (w: { code: string; name: string }) => inventory.sources.find((s) => s.source_code === w.code || s.name === w.name);
    const sourceCodes = wanted.map((w) => found(w)?.source_code ?? w.code);
    const toEnable = wanted.flatMap((w) => {
        const source = found(w);
        return source?.enabled === false ? [source.source_code] : [];
    });
    const existing = inventory.stocks.find((stock) => stock.stock_id !== DEFAULT_STOCK_ID && sellsTo(stock, websiteCode));
    const stock = existing ? { existing } : { create: `${websiteCode} Stock` };
    const linked = new Set(
        existing ? inventory.links.filter((link) => link.stock_id === existing.stock_id).map((link) => link.source_code) : [],
    );
    return { newSources, sourceCodes, stock, linksToAdd: sourceCodes.filter((code) => !linked.has(code)), toEnable };
}

/** The stock the plan links to, by name. */
const stockNameOf = (plan: Plan): string => ('existing' in plan.stock ? plan.stock.existing.name : plan.stock.create);

/**
 * A source by the name the Admin shows, from the plan or the store; its code only when
 * neither has it. Codes read as code (owner, release test row 4.19, 2026-10-26).
 */
function sourceNamer(sources: CommerceInventorySource[], made: Array<{ code: string; name: string }> = []): (code: string) => string {
    return (code) => made.find((s) => s.code === code)?.name ?? sources.find((s) => s.source_code === code)?.name ?? code;
}

function lines(plan: Plan, inventory: Inventory): string[] {
    const nameOf = sourceNamer(inventory.sources, plan.newSources);
    return [
        ...plan.newSources.map((s) => `Create ${s.name}`),
        ...plan.toEnable.map((code) => `Switch ${nameOf(code)} back on`),
        ...('create' in plan.stock ? [`Create ${plan.stock.create}, a stock the website sells from`] : []),
        ...plan.linksToAdd.map((code) => `Add ${nameOf(code)} to ${stockNameOf(plan)}`),
    ];
}

/**
 * The plan in one sentence: "Add Test Warehouse to Justrite Stock", "Switch Test Warehouse
 * back on", or both. The step's title says "each ERP", which reads as all of them when one
 * is missing (Justrite, 2026-10-26).
 */
function summaryOf(plan: Plan, inventory: Inventory): string | undefined {
    const nameOf = sourceNamer(inventory.sources, plan.newSources);
    const stock = 'existing' in plan.stock ? plan.stock.existing.name : `a new stock, ${plan.stock.create}`;
    const parts = [
        ...(plan.linksToAdd.length > 0 ? [`Add ${andList(plan.linksToAdd.map(nameOf))} to ${stock}`] : []),
        ...(plan.toEnable.length > 0 ? [`switch ${andList(plan.toEnable.map(nameOf))} back on`] : []),
    ];
    if (parts.length === 0) return undefined;
    const sentence = parts.join(', and ');
    return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

export const warehouseFix: StepFix = {
    async preview(deps): Promise<FixPreview> {
        if (deps.erpNames.length === 0) return { changes: [], manual: 'The integration has no ERP yet, so there is no warehouse to make.' };
        const inventory = await readInventory(deps.commerce.get);
        const plan = planFor(inventory, deps);
        const summary = summaryOf(plan, inventory);
        return { changes: lines(plan, inventory), ...(summary ? { summary } : {}), manual: MOVE_STOCK_MANUAL };
    },
    async apply(deps): Promise<FixApplied> {
        if (deps.erpNames.length === 0) return { changes: [], rejected: [], manual: 'The integration has no ERP yet, so there is no warehouse to make.' };
        const { get, send } = deps.commerce;
        const inventory = await readInventory(get);
        const plan = planFor(inventory, deps);
        const nameOf = sourceNamer(inventory.sources, plan.newSources);
        const changes: string[] = [];
        const rejected: string[] = [];
        const record: WarehouseStepRecord = { kind: 'warehouse', createdSources: [], links: [] };
        for (const source of plan.newSources) {
            try {
                await send('POST', 'inventory/sources', { source: { source_code: source.code, name: source.name, enabled: true, ...SOURCE_ADDRESS } });
                record.createdSources.push(source.code);
                changes.push(`Created ${source.name}`);
            } catch (error) {
                rejected.push(`Create ${source.name}: ${errorText(error)}`);
            }
        }
        const outcome = { changes, rejected, nameOf };
        await enableSources(deps, plan, record, outcome);
        const stockId = await ensureStock(deps, plan, record, changes, rejected);
        if (stockId !== undefined) await linkSources(deps, { plan, inventory, stockId }, record, outcome);
        await recordSourcesAsLeft(get, record);
        const wrote =
            record.createdSources.length > 0 || record.createdStock || record.links.length > 0 || (record.enabledSources?.length ?? 0) > 0;
        return { changes, rejected, ...(wrote ? { record } : {}), manual: MOVE_STOCK_MANUAL };
    },
    async undo(deps, record: StorePreparationStepRecord): Promise<FixUndone> {
        if (record.kind !== 'warehouse') return { changes: [], rejected: [`The record is not a warehouse record (${record.kind}).`] };
        let inventory: Inventory;
        try {
            inventory = await readInventory(deps.commerce.get);
        } catch (error) {
            return { changes: [], rejected: [`Read the store's warehouses: ${errorText(error)}`] };
        }
        const undo: UndoRun = { commerce: deps.commerce, record, inventory, ...undoNamers(inventory, record), changes: [], rejected: [], kept: [] };
        await unlinkOwn(undo);
        await deleteStockUnlessHolding(undo);
        await switchOffUnchanged(undo);
        const { changes, rejected, kept, remaining } = undo;
        return { changes, rejected, ...(kept.length > 0 ? { kept: kept.join(' ') } : {}), ...(remaining ? { remaining } : {}) };
    },
};

/** One undo's state: what it read once, and the lines it is building. */
interface UndoRun {
    commerce: FixDeps['commerce'];
    record: WarehouseStepRecord;
    inventory: Inventory;
    sourceName: (code: string) => string;
    stockName: (id: number) => string;
    changes: string[];
    rejected: string[];
    kept: string[];
    /** A kept stock, still recorded so a later undo deletes it once it holds no source. */
    remaining?: WarehouseStepRecord;
}

/** Take out the links the fix made that are still there. */
async function unlinkOwn(undo: UndoRun): Promise<void> {
    const present = undo.record.links.filter((l) => undo.inventory.links.some((x) => x.stock_id === l.stockId && x.source_code === l.sourceCode));
    if (present.length === 0) return;
    try {
        await undo.commerce.send('POST', 'inventory/stock-source-links-delete', { links: present.map((l) => ({ stock_id: l.stockId, source_code: l.sourceCode })) });
        undo.changes.push(...present.map((l) => `Took ${undo.sourceName(l.sourceCode)} out of ${undo.stockName(l.stockId)}`));
    } catch (error) {
        undo.rejected.push(`Take the warehouses out of the stock: ${errorText(error)}`);
    }
}

/** Delete the stock the fix made, unless it holds a source the fix did not link to it. */
async function deleteStockUnlessHolding(undo: UndoRun): Promise<void> {
    const stock = undo.record.createdStock;
    if (!stock || !undo.inventory.stocks.some((s) => s.stock_id === stock.id)) return;
    const ownLink = (code: string) => undo.record.links.some((l) => l.stockId === stock.id && l.sourceCode === code);
    const others = undo.inventory.links.filter((l) => l.stock_id === stock.id && !ownLink(l.source_code)).map((l) => l.source_code);
    const outcome = decideOwnedChange({ recorded: fingerprintRow([]), current: fingerprintRow(others), wanted: undefined });
    if (outcome !== 'remove') {
        undo.kept.push(`Kept ${stock.name}: it holds ${andList(others.map(undo.sourceName))}, which Demo Builder did not add to it.`);
        // Its own links are gone and its sources are dealt with: only the stock stays recorded.
        undo.remaining = { kind: 'warehouse', createdSources: [], links: [], createdStock: stock };
        return;
    }
    try {
        await undo.commerce.send('DELETE', `inventory/stocks/${stock.id}`, undefined);
        undo.changes.push(`Deleted ${stock.name}`);
    } catch (error) {
        undo.rejected.push(`Delete ${stock.name}: ${errorText(error)}`);
    }
}

/**
 * Switch off each source the fix made or switched on, while its row still hashes as the apply
 * left it. One already off, or gone from the list, needs nothing.
 */
async function switchOffUnchanged(undo: UndoRun): Promise<void> {
    const edited: string[] = [];
    const untold: string[] = [];
    for (const code of [...undo.record.createdSources, ...(undo.record.enabledSources ?? [])]) {
        const row = undo.inventory.sources.find((s) => s.source_code === code);
        if (!row || row.enabled === false) continue;
        const outcome = decideOwnedChange({
            recorded: undo.record.sourceFingerprints?.[code],
            current: fingerprintRow(row),
            wanted: fingerprintRow({ ...row, enabled: false }),
        });
        if (outcome === 'leave-edited') edited.push(row.name);
        else if (outcome === 'leave-not-ours') untold.push(row.name);
        else await switchOff(undo, code);
    }
    const line = sourcesKeptLine(edited, untold);
    if (line) undo.kept.push(line);
}

async function switchOff(undo: UndoRun, code: string): Promise<void> {
    try {
        const name = await setSourceEnabled(undo.commerce, code, false);
        undo.changes.push(`Switched off ${name ?? undo.sourceName(code)} (Commerce can't delete a warehouse)`);
    } catch (error) {
        undo.rejected.push(`Switch off ${undo.sourceName(code)}: ${errorText(error)}`);
    }
}

/** The one line about the sources the undo left switched on, or nothing. */
function sourcesKeptLine(edited: string[], untold: string[]): string | undefined {
    const parts: string[] = [];
    if (edited.length === 1) parts.push(`Kept ${edited[0]} switched on: it was changed after Demo Builder set it up.`);
    if (edited.length > 1) parts.push(`Kept ${andList(edited)} switched on: they were changed after Demo Builder set them up.`);
    if (untold.length === 1) parts.push(`Kept ${untold[0]} switched on: Demo Builder cannot tell it is still as it left it.`);
    if (untold.length > 1) parts.push(`Kept ${andList(untold)} switched on: Demo Builder cannot tell they are still as it left them.`);
    return parts.length > 0 ? parts.join(' ') : undefined;
}

/**
 * Hash each source the apply made or switched on, as the sources list shows it after the writes,
 * so the undo can tell one changed since. A read that fails records no hash: the undo then keeps
 * the source on and says so, rather than guess.
 */
async function recordSourcesAsLeft(get: CommerceGet, record: WarehouseStepRecord): Promise<void> {
    const codes = [...record.createdSources, ...(record.enabledSources ?? [])];
    if (codes.length === 0) return;
    const sources = await get(SOURCES_PATH).then((answer) => (answer as CommerceInventorySourceList | null)?.items ?? [], (): CommerceInventorySource[] => []);
    const hashes = Object.fromEntries(sources.filter((s) => codes.includes(s.source_code)).map((s) => [s.source_code, fingerprintRow(s)]));
    if (Object.keys(hashes).length > 0) record.sourceFingerprints = hashes;
}

/** Where an apply's lines go, and how it names a source in them. */
interface Outcome {
    changes: string[];
    rejected: string[];
    nameOf: (code: string) => string;
}

/**
 * Switch a source on or off. Commerce saves a source whole, so the row is read and sent back
 * with only `enabled` changed. Shared with the datapack engine (DI-5).
 *
 * @returns the source's name, as the store has it
 */
export async function setSourceEnabled(
    commerce: { get: CommerceGet; send: FixDeps['commerce']['send'] },
    code: string,
    enabled: boolean,
): Promise<string | undefined> {
    const row = (await commerce.get(`inventory/sources/${encodeURIComponent(code)}`)) as CommerceInventorySource | null;
    await commerce.send('PUT', `inventory/sources/${encodeURIComponent(code)}`, {
        source: { ...(row ?? { source_code: code, name: code, ...SOURCE_ADDRESS }), enabled },
    });
    return row?.name;
}

/** Switch back on the ERP warehouses an undo switched off, and record them so the undo can again. */
async function enableSources(deps: FixDeps, plan: Plan, record: WarehouseStepRecord, outcome: Outcome): Promise<void> {
    for (const code of plan.toEnable) {
        try {
            await setSourceEnabled(deps.commerce, code, true);
            record.enabledSources = [...(record.enabledSources ?? []), code];
            outcome.changes.push(`Switched ${outcome.nameOf(code)} back on`);
        } catch (error) {
            outcome.rejected.push(`Switch ${outcome.nameOf(code)} back on: ${errorText(error)}`);
        }
    }
}

/**
 * Add the ERP warehouses to the stock, after the ones already there: each new link takes the
 * next priority past the stock's highest, never 1 beside a warehouse that already has it
 * (Justrite, 2026-10-26: test_warehouse went in at 1 next to justrite at 1).
 */
async function linkSources(
    deps: FixDeps,
    target: { plan: Plan; inventory: Inventory; stockId: number },
    record: WarehouseStepRecord,
    outcome: Outcome,
): Promise<void> {
    const { plan, inventory, stockId } = target;
    const made = new Set([...record.createdSources, ...plan.sourceCodes.filter((code) => !plan.newSources.some((s) => s.code === code))]);
    const highest = Math.max(0, ...inventory.links.filter((link) => link.stock_id === stockId).map((link) => link.priority ?? 0));
    for (const [i, code] of plan.linksToAdd.filter((code) => made.has(code)).entries()) {
        const line = `${outcome.nameOf(code)} to ${stockNameOf(plan)}`;
        try {
            await deps.commerce.send('POST', 'inventory/stock-source-links', { links: [{ stock_id: stockId, source_code: code, priority: highest + i + 1 }] });
            record.links.push({ stockId, sourceCode: code });
            outcome.changes.push(`Added ${line}`);
        } catch (error) {
            outcome.rejected.push(`Add ${line}: ${errorText(error)}`);
        }
    }
}

/** Names for the undo's lines: the record keeps codes and ids, the store has the names. */
function undoNamers(inventory: Inventory, record: WarehouseStepRecord): { sourceName: (code: string) => string; stockName: (id: number) => string } {
    const stockName = (id: number): string =>
        inventory.stocks.find((stock) => stock.stock_id === id)?.name ?? (record.createdStock?.id === id ? record.createdStock.name : `stock ${id}`);
    return { sourceName: sourceNamer(inventory.sources), stockName };
}

/** The stock the links go to: the existing one, or the one created here. Undefined when creation failed. */
async function ensureStock(deps: FixDeps, plan: Plan, record: WarehouseStepRecord, changes: string[], rejected: string[]): Promise<number | undefined> {
    if ('existing' in plan.stock) return plan.stock.existing.stock_id;
    const body: { stock: CommerceInventoryStock } = {
        stock: { name: plan.stock.create, extension_attributes: { sales_channels: [{ type: 'website', code: deps.websiteCode ?? '' }] } },
    };
    try {
        const id = Number(await deps.commerce.send('POST', 'inventory/stocks', body));
        if (!Number.isInteger(id)) throw new Error('Commerce did not answer the new stock id.');
        record.createdStock = { id, name: plan.stock.create };
        changes.push(`Created ${plan.stock.create}, a stock the website sells from`);
        return id;
    } catch (error) {
        rejected.push(`Create ${plan.stock.create}: ${errorText(error)}`);
        return undefined;
    }
}
