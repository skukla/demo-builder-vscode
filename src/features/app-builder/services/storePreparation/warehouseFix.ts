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
 * The undo unlinks, deletes a stock this run created, and DISABLES a source this run created:
 * Commerce cannot delete a source, and the result says so.
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
}

/** What the fix would do, against the inventory as it stands. */
function planFor(inventory: Inventory, deps: FixDeps): Plan {
    const websiteCode = deps.websiteCode;
    if (!websiteCode) throw new Error('The project names no Commerce website, so no stock can sell to it.');
    const wanted = deps.erpNames.map(warehouseFor);
    const newSources = wanted.filter((w) => !inventory.sources.some((s) => s.source_code === w.code || s.name === w.name));
    const sourceCodes = wanted.map((w) => inventory.sources.find((s) => s.name === w.name)?.source_code ?? w.code);
    const existing = inventory.stocks.find((stock) => stock.stock_id !== DEFAULT_STOCK_ID && sellsTo(stock, websiteCode));
    const stock = existing ? { existing } : { create: `${websiteCode} Stock` };
    const linked = new Set(
        existing ? inventory.links.filter((link) => link.stock_id === existing.stock_id).map((link) => link.source_code) : [],
    );
    return { newSources, sourceCodes, stock, linksToAdd: sourceCodes.filter((code) => !linked.has(code)) };
}

function lines(plan: Plan): string[] {
    const stockName = 'existing' in plan.stock ? plan.stock.existing.name : plan.stock.create;
    return [
        ...plan.newSources.map((s) => `Create the source ${s.name} (${s.code})`),
        ...('create' in plan.stock ? [`Create the stock ${plan.stock.create}, selling to the website`] : []),
        ...plan.linksToAdd.map((code) => `Assign the source ${code} to the stock ${stockName}`),
    ];
}

export const warehouseFix: StepFix = {
    async preview(deps): Promise<FixPreview> {
        if (deps.erpNames.length === 0) return { changes: [], manual: 'The integration has no ERP yet, so there is no warehouse to make.' };
        const plan = planFor(await readInventory(deps.commerce.get), deps);
        return { changes: lines(plan), manual: MOVE_STOCK_MANUAL };
    },
    async apply(deps): Promise<FixApplied> {
        if (deps.erpNames.length === 0) return { changes: [], rejected: [], manual: 'The integration has no ERP yet, so there is no warehouse to make.' };
        const { get, send } = deps.commerce;
        const plan = planFor(await readInventory(get), deps);
        const changes: string[] = [];
        const rejected: string[] = [];
        const record: WarehouseStepRecord = { kind: 'warehouse', createdSources: [], links: [] };
        for (const source of plan.newSources) {
            try {
                await send('POST', 'inventory/sources', { source: { source_code: source.code, name: source.name, enabled: true, ...SOURCE_ADDRESS } });
                record.createdSources.push(source.code);
                changes.push(`Created the source ${source.name} (${source.code})`);
            } catch (error) {
                rejected.push(`Create the source ${source.name}: ${errorText(error)}`);
            }
        }
        const stockId = await ensureStock(deps, plan, record, changes, rejected);
        if (stockId !== undefined) {
            const made = new Set([...record.createdSources, ...plan.sourceCodes.filter((code) => !plan.newSources.some((s) => s.code === code))]);
            for (const [i, code] of plan.linksToAdd.filter((code) => made.has(code)).entries()) {
                try {
                    await send('POST', 'inventory/stock-source-links', { links: [{ stock_id: stockId, source_code: code, priority: i + 1 }] });
                    record.links.push({ stockId, sourceCode: code });
                    changes.push(`Assigned the source ${code} to the stock`);
                } catch (error) {
                    rejected.push(`Assign the source ${code} to the stock: ${errorText(error)}`);
                }
            }
        }
        const wrote = record.createdSources.length > 0 || record.createdStock || record.links.length > 0;
        return { changes, rejected, ...(wrote ? { record } : {}), manual: MOVE_STOCK_MANUAL };
    },
    async undo(deps, record: StorePreparationStepRecord): Promise<FixUndone> {
        if (record.kind !== 'warehouse') return { changes: [], rejected: [`The record is not a warehouse record (${record.kind}).`] };
        const { get, send } = deps.commerce;
        const changes: string[] = [];
        const rejected: string[] = [];
        if (record.links.length > 0) {
            try {
                await send('POST', 'inventory/stock-source-links-delete', { links: record.links.map((l) => ({ stock_id: l.stockId, source_code: l.sourceCode })) });
                changes.push(...record.links.map((l) => `Unassigned the source ${l.sourceCode} from the stock`));
            } catch (error) {
                rejected.push(`Unassign the sources: ${errorText(error)}`);
            }
        }
        if (record.createdStock) {
            try {
                await send('DELETE', `inventory/stocks/${record.createdStock.id}`, undefined);
                changes.push(`Deleted the stock ${record.createdStock.name}`);
            } catch (error) {
                rejected.push(`Delete the stock ${record.createdStock.name}: ${errorText(error)}`);
            }
        }
        for (const code of record.createdSources) {
            try {
                const row = (await get(`inventory/sources/${code}`)) as CommerceInventorySource | null;
                await send('PUT', `inventory/sources/${code}`, { source: { ...(row ?? { source_code: code, name: code, ...SOURCE_ADDRESS }), enabled: false } });
                changes.push(`Disabled the source ${code} (Commerce cannot delete a source; it is disabled, not gone)`);
            } catch (error) {
                rejected.push(`Disable the source ${code}: ${errorText(error)}`);
            }
        }
        return { changes, rejected };
    },
};

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
        changes.push(`Created the stock ${plan.stock.create}, selling to the website`);
        return id;
    } catch (error) {
        rejected.push(`Create the stock ${plan.stock.create}: ${errorText(error)}`);
        return undefined;
    }
}
