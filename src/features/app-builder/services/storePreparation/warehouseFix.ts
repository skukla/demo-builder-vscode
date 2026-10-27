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
 * or switched back on: Commerce cannot delete a source, and the result says so.
 *
 * @module features/app-builder/services/storePreparation/warehouseFix
 */

import type { CommerceGet } from '../erpFillReaders';
import { errorText, type FixApplied, type FixDeps, type FixPreview, type FixUndone, type StepFix } from './fixContract';
import type {
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

interface Inventory {
    sources: CommerceInventorySource[];
    stocks: CommerceInventoryStock[];
    links: CommerceStockSourceLink[];
}

async function readInventory(get: CommerceGet): Promise<Inventory> {
    const sources = ((await get(SOURCES_PATH)) as CommerceInventorySourceList | null)?.items ?? [];
    const stocks = ((await get(STOCKS_PATH)) as CommerceInventoryStockList | null)?.items ?? [];
    const links = ((await get(LINKS_PATH)) as CommerceStockSourceLinkList | null)?.items ?? [];
    return { sources, stocks, links };
}

const sellsTo = (stock: CommerceInventoryStock, websiteCode: string): boolean =>
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
     * done, so applying again must switch it back on (AB-81, Justrite 2026-10-26).
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

/** "A", "A and B", "A, B and C". */
const andList = (names: string[]): string =>
    names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

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
        const wrote =
            record.createdSources.length > 0 || record.createdStock || record.links.length > 0 || (record.enabledSources?.length ?? 0) > 0;
        return { changes, rejected, ...(wrote ? { record } : {}), manual: MOVE_STOCK_MANUAL };
    },
    async undo(deps, record: StorePreparationStepRecord): Promise<FixUndone> {
        if (record.kind !== 'warehouse') return { changes: [], rejected: [`The record is not a warehouse record (${record.kind}).`] };
        const { get, send } = deps.commerce;
        const changes: string[] = [];
        const rejected: string[] = [];
        const { sourceName, stockName } = await undoNamers(get, record);
        if (record.links.length > 0) {
            try {
                await send('POST', 'inventory/stock-source-links-delete', { links: record.links.map((l) => ({ stock_id: l.stockId, source_code: l.sourceCode })) });
                changes.push(...record.links.map((l) => `Took ${sourceName(l.sourceCode)} out of ${stockName(l.stockId)}`));
            } catch (error) {
                rejected.push(`Take the warehouses out of the stock: ${errorText(error)}`);
            }
        }
        if (record.createdStock) {
            try {
                await send('DELETE', `inventory/stocks/${record.createdStock.id}`, undefined);
                changes.push(`Deleted ${record.createdStock.name}`);
            } catch (error) {
                rejected.push(`Delete ${record.createdStock.name}: ${errorText(error)}`);
            }
        }
        for (const code of [...record.createdSources, ...(record.enabledSources ?? [])]) {
            try {
                const row = (await get(`inventory/sources/${code}`)) as CommerceInventorySource | null;
                await send('PUT', `inventory/sources/${code}`, { source: { ...(row ?? { source_code: code, name: code, ...SOURCE_ADDRESS }), enabled: false } });
                changes.push(`Switched off ${row?.name ?? sourceName(code)} (Commerce can't delete a warehouse)`);
            } catch (error) {
                rejected.push(`Switch off ${sourceName(code)}: ${errorText(error)}`);
            }
        }
        return { changes, rejected };
    },
};

/** Where an apply's lines go, and how it names a source in them. */
interface Outcome {
    changes: string[];
    rejected: string[];
    nameOf: (code: string) => string;
}

/** Switch back on the ERP warehouses an undo switched off, and record them so the undo can again. */
async function enableSources(deps: FixDeps, plan: Plan, record: WarehouseStepRecord, outcome: Outcome): Promise<void> {
    for (const code of plan.toEnable) {
        try {
            const row = (await deps.commerce.get(`inventory/sources/${code}`)) as CommerceInventorySource | null;
            await deps.commerce.send('PUT', `inventory/sources/${code}`, {
                source: { ...(row ?? { source_code: code, name: code, ...SOURCE_ADDRESS }), enabled: true },
            });
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

/**
 * Names for the undo's lines. The record keeps codes and ids; the store has the names. A
 * read that fails leaves the codes, since the undo itself must not wait on it.
 */
async function undoNamers(
    get: CommerceGet,
    record: WarehouseStepRecord,
): Promise<{ sourceName: (code: string) => string; stockName: (id: number) => string }> {
    const inventory = await readInventory(get).catch((): Inventory => ({ sources: [], stocks: [], links: [] }));
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
