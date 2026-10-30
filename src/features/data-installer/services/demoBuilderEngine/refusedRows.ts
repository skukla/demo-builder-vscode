/**
 * One refused row does not stop the rest (step 14 item 3, owner's choice for step 11 decision 5):
 * a row Commerce refuses is skipped, the install carries on, and the outcome's note names each
 * skipped row with Commerce's reason, as the service's `processingOrchestration.js` L263-341 goes
 * on past a failed row.
 *
 * What counts as the row's fault, and is skipped:
 * - Commerce answered the row's write 400, 404, 409 or 422;
 * - the row names something the store does not have (`MissingNameError`): an attribute set, a
 *   category's url key, a group, a cart rule. When that thing is a row this install skipped, the
 *   reason says so ("it needs the category racks, which was skipped"), so its dependants are named.
 *
 * What is the store's, and still stops the install: Commerce refusing who we are (401, 403),
 * asking us to slow down (429), failing (5xx), or not answering at all; a read of the store a kind
 * makes before its rows; anything the engine itself does not expect. A write that got no answer
 * also stops it: it may have landed, and its pending entry is settled by the next run.
 *
 * @module features/data-installer/services/demoBuilderEngine/refusedRows
 */

import { type CatalogSession, type KindContext, MissingNameError, type SkippedRow } from './kindContext';
import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';

/** The answers that refuse one row's write, not the store as a whole. */
const ROW_STATUSES = new Set([400, 404, 409, 422]);

/** Each kind as a person reads it, for a reason that names a row this one needed. */
const NAMED: Record<string, string> = {
    attribute_sets: 'attribute set',
    product_attributes: 'attribute',
    categories: 'category',
    customer_groups: 'customer group',
    products: 'product',
    giftcards: 'gift card',
    cart_rules: 'cart rule',
    stocks: 'stock',
    sources: 'source',
    b2b_shared_catalogs: 'shared catalog',
    b2b_companies: 'company',
};

/** Whether an error is this one row's, so the install skips it and carries on. */
export function isRowRefusal(error: unknown): boolean {
    if (error instanceof MissingNameError) return true;
    return error instanceof CommerceReadError && error.status !== undefined && ROW_STATUSES.has(error.status);
}

/** The row this install skipped that `kind` knows by `name`, if any. */
export function skippedAs(session: CatalogSession, kinds: string | readonly string[], name: string): SkippedRow | undefined {
    const wanted = typeof kinds === 'string' ? [kinds] : kinds;
    return session.skipped?.find((row) => wanted.includes(row.kind) && (row.key === name || (row.names ?? []).includes(name)));
}

/**
 * Stop a row that needs one this install skipped, so it is skipped too, naming what it needed.
 *
 * @throws MissingNameError when the row `kind` knows by `name` was skipped
 */
export function needsUnskipped(session: CatalogSession, kinds: string | readonly string[], name: string): void {
    const needed = skippedAs(session, kinds, name);
    if (needed) throw new MissingNameError(needed.kind, name, `It needs ${needed.kind} ${name}, which was skipped.`);
}

/** Commerce's own message from a refusal: its JSON `message` with `%1` filled in, else its text. */
function commerceMessage(error: CommerceReadError): string {
    const text = error.message.replace(/^Commerce answered \d+ for [^:]*: /u, '');
    try {
        const body = JSON.parse(text) as { message?: string; parameters?: unknown };
        if (typeof body.message !== 'string') return text;
        const params = body.parameters;
        return body.message.replace(/%(\w+)/gu, (whole, name: string) => {
            const value = Array.isArray(params) ? params[Number(name) - 1] : (params as Record<string, unknown> | undefined)?.[name];
            return value === undefined ? whole : String(value);
        });
    } catch {
        return text;
    }
}

/** Why a row was skipped, in words: the row it needed, or what Commerce said. */
export function reasonOf(session: CatalogSession, error: unknown): string {
    if (error instanceof MissingNameError) {
        const needed = skippedAs(session, error.kind, error.missing);
        return needed ? `it needs the ${NAMED[error.kind] ?? error.kind} ${error.missing}, which was skipped` : error.message;
    }
    return error instanceof CommerceReadError ? commerceMessage(error) : String(error);
}

/** Write a row down as skipped, and say so in Debug Logs. */
export function skipRow(ctx: Pick<KindContext, 'session' | 'log'>, row: SkippedRow): void {
    (ctx.session.skipped ??= []).push(row);
    ctx.log(`skipped ${row.kind} ${row.key}: ${row.reason}`);
}

/**
 * Do one row's writes; when Commerce refuses the row, skip it and answer undefined.
 *
 * @param row - the row, by kind and the pack's name for it, and any other names later rows use
 * @throws whatever is not the row's fault (see the module comment): the install stops
 */
export async function tryRow<T>(
    ctx: Pick<KindContext, 'session' | 'log'>,
    row: Omit<SkippedRow, 'reason'>,
    work: () => Promise<T>,
): Promise<T | undefined> {
    try {
        return await work();
    } catch (error) {
        if (!isRowRefusal(error)) throw error;
        skipRow(ctx, { ...row, reason: reasonOf(ctx.session, error) });
        return undefined;
    }
}

/** The one line an install says about what it skipped, naming each row, or nothing. */
export function skippedLine(skipped: readonly SkippedRow[] | undefined): string | undefined {
    if (!skipped || skipped.length === 0) return undefined;
    const rows = skipped.map((row) => `${row.kind} ${row.key} (${row.reason.replace(/\.$/u, '')})`);
    const count = skipped.length === 1 ? '1 row' : `${skipped.length} rows`;
    return `Skipped ${count}, and installed the rest: ${rows.join('; ')}.`;
}
