/**
 * The `sources`, `stocks` and `stock_source_links` kinds: a pack's warehouses, the stocks a
 * website sells from, and which warehouses each stock draws on (DI-5; catalog spec §5-7).
 *
 * What the store already has is used and left alone. What this engine makes is recorded, and
 * removal takes it back:
 * - a source cannot be deleted in Commerce, so removal switches it off (the ERP warehouse step
 *   learned the same, `warehouseFix.ts`); a source the store had switched off and the pack
 *   needs is switched on, and switched off again on removal;
 * - a new stock sells to the install target's website, which takes that website off the stock
 *   it sold from, so the record keeps that stock and removal puts the website back on it. The
 *   service leaves the website with no stock at all (spec §5, Remove);
 * - a link is taken out again. The service removes none (spec §7).
 *
 * Commerce answers a new stock with its id alone, a bare number (the ERP warehouse step, live).
 * Putting the website back on the stock it came from has not yet run against a live store.
 *
 * @module features/data-installer/services/demoBuilderEngine/stockKinds
 */

import { z } from 'zod';
import type { CreatedObject } from './installRecord';
import { MissingNameError, SOURCE_CODE, deleteIfPresent, type KindContext, parseRows, ownedId, readOrNull, segment } from './kindContext';
import { createOne } from './pendingCreates';
import { needsUnskipped, tryRow } from './refusedRows';
import { readInventory, sellsTo, setSourceEnabled } from '@/features/app-builder/services/storePreparation/warehouseFix';
import type { CommerceGet, CommerceInventoryStock, CommerceSend } from '@/types/commerceWire';

export const SOURCE_KIND = 'sources';
export const STOCK_KIND = 'stocks';
export const LINK_KIND = 'stock_source_links';

const sourcesSchema = z.object({
    sources: z.array(z.object({ source: z.object({ source_code: z.string().regex(SOURCE_CODE, 'is not a source code'), name: z.string() }).passthrough() })),
});
const stocksSchema = z.object({ stocks: z.array(z.object({ stock: z.object({ name: z.string().min(1) }).passthrough() })) });
/** `stock_id` holds the stock's NAME (spec §7). */
const linksSchema = z.object({
    stockSourceLinks: z.array(
        z.object({ stockSourceLink: z.object({ stock_id: z.string().min(1), source_code: z.string().regex(SOURCE_CODE, 'is not a source code'), priority: z.number().optional() }) }),
    ),
});

export type SourcesPack = z.infer<typeof sourcesSchema>;
export type StocksPack = z.infer<typeof stocksSchema>;
export type LinksPack = z.infer<typeof linksSchema>;

/** What removal needs to put a website back on the stock it sold from before. */
interface StockPrevious {
    websiteCode: string;
    stockId?: number;
}

export const parseSources = (records: unknown) => parseRows(sourcesSchema, records, 'sources');
export const parseStocks = (records: unknown) => parseRows(stocksSchema, records, 'stocks');
export const parseStockSourceLinks = (records: unknown) => parseRows(linksSchema, records, 'stock source links');

/** Make the sources the store lacks; switch on one it has switched off. */
export async function installSources(ctx: KindContext, pack: SourcesPack): Promise<void> {
    const { sources } = await readInventory(ctx.get);
    for (const { source } of pack.sources) {
        // A source, stock or link this engine made and the SC deleted since stays deleted (step 05).
        if (ownedId(ctx.session, SOURCE_KIND, source.source_code) === null) continue;
        const existing = sources.find((s) => s.source_code === source.source_code);
        if (!existing) {
            const code = source.source_code;
            // Step 14 item 3: a row Commerce refuses is skipped, and the rest go on.
            const made = await tryRow(ctx, { kind: SOURCE_KIND, key: code }, () =>
                createOne(ctx, { kind: SOURCE_KIND, key: code, id: code }, async () => {
                    await ctx.send('POST', 'inventory/sources', { source });
                    return { kind: SOURCE_KIND, id: code };
                }),
            );
            if (made) ctx.log(`created source ${source.name}`);
        } else if (existing.enabled === false) {
            const code = source.source_code;
            const made = await tryRow(ctx, { kind: SOURCE_KIND, key: code }, () =>
                createOne(ctx, { kind: SOURCE_KIND, key: code, id: code, previous: { enabled: false } }, async () => {
                    await setSourceEnabled(ctx, code, true);
                    return { kind: SOURCE_KIND, id: code, previous: { enabled: false } };
                }),
            );
            if (made) ctx.log(`switched source ${source.name} back on`);
        }
    }
}

/** Make the stocks the store lacks, each selling to the install target's website. */
export async function installStocks(ctx: KindContext, pack: StocksPack): Promise<void> {
    const websiteCode = ctx.session.websiteCode;
    if (!websiteCode) throw new Error('The install target names no website, so the pack\'s stocks have nothing to sell to.');
    const { stocks } = await readInventory(ctx.get);
    for (const { stock } of pack.stocks) {
        if (ownedId(ctx.session, STOCK_KIND, stock.name) === null) continue;
        if (stocks.some((s) => s.name === stock.name)) continue;
        const previous: StockPrevious = { websiteCode, stockId: stocks.find((s) => sellsTo(s, websiteCode))?.stock_id };
        const body: { stock: CommerceInventoryStock } = {
            stock: { ...stock, extension_attributes: { sales_channels: [{ type: 'website', code: websiteCode }] } },
        };
        const made = await tryRow(ctx, { kind: STOCK_KIND, key: stock.name }, () =>
            createOne(ctx, { kind: STOCK_KIND, key: stock.name, previous }, async () => {
                const answer = Number(await ctx.send('POST', 'inventory/stocks', body));
                if (!Number.isInteger(answer)) throw new Error(`Commerce did not answer the new stock ${stock.name}'s id.`);
                return { kind: STOCK_KIND, id: String(answer), previous };
            }),
        );
        if (!made) continue;
        const id = Number(made.id);
        stocks.push({ ...body.stock, stock_id: id });
        ctx.log(`created stock ${stock.name}, selling to ${websiteCode}`);
    }
}

/** Link each source to its stock, by the stock's name, unless the link is there already. */
export async function installStockSourceLinks(ctx: KindContext, pack: LinksPack): Promise<void> {
    const { stocks, links } = await readInventory(ctx.get);
    for (const { stockSourceLink: link } of pack.stockSourceLinks) {
        const key = `${link.stock_id}/${link.source_code}`;
        if (ownedId(ctx.session, LINK_KIND, key) === null) continue;
        // Step 14 item 3: a link to a stock or source this install skipped, or one Commerce refuses, is skipped.
        await tryRow(ctx, { kind: LINK_KIND, key }, async () => {
            needsUnskipped(ctx.session, SOURCE_KIND, link.source_code);
            needsUnskipped(ctx.session, STOCK_KIND, link.stock_id);
            const stockId = stocks.find((s) => s.name === link.stock_id)?.stock_id;
            if (stockId === undefined) throw new MissingNameError(STOCK_KIND, link.stock_id, `The store has no stock named ${link.stock_id}.`);
            if (links.some((l) => l.stock_id === stockId && l.source_code === link.source_code)) return;
            const id = `${stockId}/${link.source_code}`;
            await createOne(ctx, { kind: LINK_KIND, key: id, id }, async () => {
                await ctx.send('POST', 'inventory/stock-source-links', {
                    links: [{ stock_id: stockId, source_code: link.source_code, priority: link.priority ?? 1 }],
                });
                return { kind: LINK_KIND, id };
            });
            links.push({ stock_id: stockId, source_code: link.source_code });
            ctx.log(`linked ${link.source_code} to ${link.stock_id}`);
        });
    }
}

/** Switch off a source this engine made or switched on: Commerce cannot delete one. */
export async function removeSource(commerce: { get: CommerceGet; send: CommerceSend }, code: string): Promise<void> {
    await setSourceEnabled(commerce, code, false);
}

/** Delete a stock this engine made, then put the website back on the stock it sold from. */
export async function removeStock(commerce: { get: CommerceGet; send: CommerceSend }, object: CreatedObject): Promise<void> {
    await deleteIfPresent(commerce.send, `inventory/stocks/${segment(object.id)}`);
    const previous = object.previous as StockPrevious | undefined;
    if (previous?.stockId === undefined) return;
    const before = await readOrNull<CommerceInventoryStock>(commerce.get, `inventory/stocks/${segment(previous.stockId)}`);
    if (!before || sellsTo(before, previous.websiteCode)) return;
    const channels = before.extension_attributes?.sales_channels ?? [];
    await commerce.send('PUT', `inventory/stocks/${segment(previous.stockId)}`, {
        stock: { ...before, extension_attributes: { ...before.extension_attributes, sales_channels: [...channels, { type: 'website', code: previous.websiteCode }] } },
    });
}

/** Take a link this engine made back out; `id` is `<stock id>/<source code>`. */
export async function removeStockSourceLink(send: CommerceSend, id: string): Promise<void> {
    const slash = id.indexOf('/');
    await send('POST', 'inventory/stock-source-links-delete', {
        links: [{ stock_id: Number(id.slice(0, slash)), source_code: id.slice(slash + 1) }],
    });
}
