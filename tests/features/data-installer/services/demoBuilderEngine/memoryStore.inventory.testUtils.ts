/**
 * The in-memory store's inventory (`memoryStore.testUtils.ts` is the one entry): sources, stocks, the
 * links between them and stock quantities, on the routes `stockKinds.ts`, `sourceItemsKind.ts`,
 * `warehouseFix.ts` (`readInventory`, `setSourceEnabled`) and `storeCopies.ts` read and write.
 *
 * A new store has the `default` source on the Default Stock (1), which sells to the one website,
 * `base`. As in Commerce a website sells from one stock, so a stock given `base` takes it from the
 * stock that had it. A source is switched off, never deleted, which is all Commerce allows.
 */

import {
    type IdSource,
    type StorePart,
    filtersOf,
    matches,
    notFound,
    page,
} from './memoryStore.routes.testUtils';
import type {
    CommerceInventorySource,
    CommerceInventoryStock,
    CommerceStockSourceLink,
} from '@/types/commerceWire';

/** One stock quantity, as `inventory/source-items` holds it. */
export interface SourceItem {
    sku: string;
    source_code: string;
    quantity: number;
    status: number;
}

type Channel = { type: string; code: string };
const channelsOf = (stock: CommerceInventoryStock): Channel[] =>
    stock.extension_attributes?.sales_channels ?? [];

/** The inventory, and its routes. */
export function inventoryPart(ids: IdSource): StorePart & {
    sources: Map<string, CommerceInventorySource>;
    stocks: Map<number, CommerceInventoryStock>;
    links: CommerceStockSourceLink[];
    sourceItems: SourceItem[];
} {
    const sources = new Map<string, CommerceInventorySource>([
        ['default', { source_code: 'default', name: 'Default Source', enabled: true }],
    ]);
    const stocks = new Map<number, CommerceInventoryStock>([
        [
            1,
            {
                stock_id: 1,
                name: 'Default Stock',
                extension_attributes: { sales_channels: [{ type: 'website', code: 'base' }] },
            },
        ],
    ]);
    const links: CommerceStockSourceLink[] = [{ stock_id: 1, source_code: 'default', priority: 1 }];
    const sourceItems: SourceItem[] = [];
    /** Give a stock its channels, taking each website from any other stock that sold to it. */
    const keep = (id: number, stock: CommerceInventoryStock) => {
        for (const channel of channelsOf(stock)) {
            for (const [otherId, other] of stocks) {
                if (otherId === id) continue;
                const left = channelsOf(other).filter(
                    (c) => !(c.type === channel.type && c.code === channel.code)
                );
                stocks.set(otherId, {
                    ...other,
                    extension_attributes: { ...other.extension_attributes, sales_channels: left },
                });
            }
        }
        stocks.set(id, { ...stock, stock_id: id });
    };
    const sameLink = (a: CommerceStockSourceLink, b: CommerceStockSourceLink) =>
        a.stock_id === b.stock_id && a.source_code === b.source_code;
    return {
        sources,
        stocks,
        links,
        sourceItems,
        reads: [
            [/^inventory\/sources\?/u, () => page([...sources.values()])],
            [
                /^inventory\/sources\/([^/?]+)$/u,
                (path, m) => sources.get(decodeURIComponent(m[1])) ?? notFound(path),
            ],
            [/^inventory\/stocks\?/u, () => page([...stocks.values()])],
            [
                /^inventory\/stocks\/(\d+)$/u,
                (path, m) => stocks.get(Number(m[1])) ?? notFound(path),
            ],
            [/^inventory\/stock-source-links\?/u, () => page([...links])],
            [
                /^inventory\/source-items\?/u,
                (path) =>
                    page(sourceItems.filter((i) => matches(filtersOf(path).get('sku'), i.sku))),
            ],
        ],
        writes: [
            [
                'POST',
                /^inventory\/sources$/u,
                (body) => {
                    const { source } = body as { source: CommerceInventorySource };
                    sources.set(source.source_code, source);
                    return true;
                },
            ],
            [
                'PUT',
                /^inventory\/sources\/([^/?]+)$/u,
                (body, m) => {
                    sources.set(
                        decodeURIComponent(m[1]),
                        (body as { source: CommerceInventorySource }).source
                    );
                    return true;
                },
            ],
            [
                'POST',
                /^inventory\/stocks$/u,
                (body) => {
                    const id = ids.next();
                    keep(id, (body as { stock: CommerceInventoryStock }).stock);
                    return id;
                },
            ],
            [
                'PUT',
                /^inventory\/stocks\/(\d+)$/u,
                (body, m) => {
                    keep(Number(m[1]), (body as { stock: CommerceInventoryStock }).stock);
                    return true;
                },
            ],
            [
                'DELETE',
                /^inventory\/stocks\/(\d+)$/u,
                (_body, m) => {
                    stocks.delete(Number(m[1]));
                    return true;
                },
            ],
            [
                'POST',
                /^inventory\/stock-source-links$/u,
                (body) => {
                    links.push(...(body as { links: CommerceStockSourceLink[] }).links);
                    return true;
                },
            ],
            [
                'POST',
                /^inventory\/stock-source-links-delete$/u,
                (body) => {
                    for (const gone of (body as { links: CommerceStockSourceLink[] }).links) {
                        const at = links.findIndex((l) => sameLink(l, gone));
                        if (at >= 0) links.splice(at, 1);
                    }
                    return true;
                },
            ],
            [
                'POST',
                /^inventory\/source-items$/u,
                (body) => {
                    sourceItems.push(...(body as { sourceItems: SourceItem[] }).sourceItems);
                    return [];
                },
            ],
        ],
    };
}
