/**
 * The `coupons` kind (datapack-engine step 11): coupon codes, read off the Data Installer's
 * `CouponImportProcessor` and its `coupons` configs. A coupon names its cart rule by the rule's
 * NAME in a pack (`rule_id: "10% Coupon"`; the export's `replaceWithReverseLookup(cart_rules_search,
 * name)`), turned into the rule's id here: the rule this install made for that name, else the
 * store's rule of exactly that name. Codes are kept exactly as the pack spells them.
 *
 * A code the store already has is left alone and not recorded; the service did the same, but
 * called it "skipped" whichever rule it was on.
 *
 * Coupons come after the rules they belong to, and a rule this engine made holds its coupons the
 * way a category holds products: Commerce deletes a rule's coupons with it, so a rule holding a
 * code this engine did not make is kept (`cartRuleHolds`, through `decideRemovals`).
 *
 * | Read or write | Endpoint | Field |
 * |---|---|---|
 * | find a code | `GET coupons/search` (`code` eq) | `items[].coupon_id`, `code` (page shape captured, empty) |
 * | a rule's codes | `GET coupons/search` (`rule_id` eq) | `items[].coupon_id` (not captured) |
 * | its copy | `GET coupons/{id}` | the coupon (not captured) |
 * | make one | `POST coupons` | `{ coupon }`, answers the coupon with `coupon_id` (not captured) |
 * | update one | `PUT coupons/{id}` | `{ coupon }` with `coupon_id` (not captured) |
 * | remove one | `DELETE coupons/{id}` | (not captured) |
 *
 * @module features/data-installer/services/demoBuilderEngine/couponsKind
 */

import { z } from 'zod';
import { filterBy } from './b2bReads';
import { CART_RULE_KIND, ruleByName } from './cartRulesKind';
import type { CreatedObject } from './installRecord';
import { deleteIfPresent, eachCopy, type KindContext, ownedId, parseRows, readOrNull, segment } from './kindContext';
import { createOne } from './pendingCreates';
import { isNumeric } from './productLookups';
import { readAllPages } from '@/features/app-builder/services/erpFillReaders';
import type { CommerceCoupon, CommerceSalesRule } from '@/types/commerceSalesRule';
import type { CommerceGet, CommerceSend } from '@/types/commerceWire';

export const COUPON_KIND = 'coupons';

const couponRows = z.array(
    z.object({
        coupon: z
            .object({
                code: z.string().min(1),
                rule_id: z.union([z.string().min(1), z.number()]),
            })
            .passthrough(),
    }),
);

export type CouponRows = z.infer<typeof couponRows>;
type PackCoupon = CouponRows[number]['coupon'];

export const parseCouponRows = (records: unknown): CouponRows => parseRows(couponRows, records, 'coupons');

/** What only the store a coupon came from means: its id, its counter, when it was made. */
const STORE_ONLY = new Set(['coupon_id', 'times_used', 'created_at']);

const without = (coupon: object): Record<string, unknown> => Object.fromEntries(Object.entries(coupon).filter(([key]) => !STORE_ONLY.has(key)));

/** The coupon with exactly this code, or undefined. */
export async function couponByCode(get: CommerceGet, code: string): Promise<CommerceCoupon | undefined> {
    const found = await readAllPages<CommerceCoupon>(get, 'coupons/search', filterBy('code', code));
    return found.find((c) => c.code === code);
}

/** Every coupon on a rule. */
export function couponsOfRule(get: CommerceGet, ruleId: string): Promise<CommerceCoupon[]> {
    return readAllPages<CommerceCoupon>(get, 'coupons/search', filterBy('rule_id', ruleId));
}

/**
 * The id of the rule a coupon names: the one this engine made for that name, else the store's of
 * exactly that name; `null` when the SC deleted the one this engine made (leave the code out too).
 */
async function ruleIdOf(ctx: KindContext, coupon: PackCoupon): Promise<number | null> {
    const named = String(coupon.rule_id);
    if (isNumeric(named)) return Number(named);
    const owned = ownedId(ctx.session, CART_RULE_KIND, named);
    if (owned === null) return null;
    const made = owned ?? ctx.recorder.byKey(CART_RULE_KIND, named)?.id;
    if (made !== undefined) return Number(made);
    const found = await ruleByName(ctx.get, named);
    if (found?.rule_id === undefined) throw new Error(`The store has no cart rule named ${named}, so the coupon ${coupon.code} has nothing to belong to.`);
    return found.rule_id;
}

/** Make each code the store lacks, on its rule; record it by its code. */
export async function installCoupons(ctx: KindContext, rows: CouponRows): Promise<void> {
    for (const { coupon } of rows) {
        if (ownedId(ctx.session, COUPON_KIND, coupon.code) !== undefined || ctx.recorder.byKey(COUPON_KIND, coupon.code)) continue;
        if (await couponByCode(ctx.get, coupon.code)) {
            ctx.log(`left coupon ${coupon.code} as it is: the store already has it`);
            continue;
        }
        const ruleId = await ruleIdOf(ctx, coupon);
        if (ruleId === null) {
            ctx.log(`left coupon ${coupon.code} out: you deleted its cart rule ${String(coupon.rule_id)} since it was installed`);
            continue;
        }
        await createOne(ctx, { kind: COUPON_KIND, key: coupon.code }, async () => {
            const answer = (await ctx.send('POST', 'coupons', { coupon: { ...without(coupon), rule_id: ruleId } })) as CommerceCoupon | null;
            const id = Number(answer?.coupon_id);
            if (!Number.isInteger(id)) throw new Error(`Commerce did not answer the new coupon ${coupon.code}'s id.`);
            return { kind: COUPON_KIND, id: String(id), key: coupon.code };
        });
        ctx.log(`created coupon ${coupon.code}`);
    }
}

/** Bring a code this engine made up to the pack's row. */
export async function updateCoupon(ctx: KindContext, id: string, row: unknown): Promise<void> {
    const [{ coupon }] = parseCouponRows([row]);
    const ruleId = await ruleIdOf(ctx, coupon);
    if (ruleId === null) return;
    await ctx.send('PUT', `coupons/${segment(id)}`, { coupon: { coupon_id: Number(id), ...without(coupon), rule_id: ruleId } });
}

/** Take back one code this engine made. */
export function removeCoupon(send: CommerceSend, id: string): Promise<void> {
    return deleteIfPresent(send, `coupons/${segment(id)}`);
}

/** A coupon as a pack holds it: its rule by name (the id when the store cannot name it), no store's id or counter. */
export async function couponPackForm(get: CommerceGet, raw: CommerceCoupon, ruleNames = new Map<number, Promise<string | undefined>>()): Promise<{ coupon: PackCoupon }> {
    if (!ruleNames.has(raw.rule_id)) {
        ruleNames.set(raw.rule_id, readOrNull<CommerceSalesRule>(get, `salesRules/${segment(raw.rule_id)}`).then((r) => r?.name, () => undefined));
    }
    const name = await ruleNames.get(raw.rule_id);
    return { coupon: { ...without(raw), code: raw.code, rule_id: name ?? raw.rule_id } };
}

/** The store's copy of each recorded code, in pack form. */
export function readCouponCopies(ctx: KindContext, objects: readonly CreatedObject[]): Promise<Map<string, unknown>> {
    const ruleNames = new Map<number, Promise<string | undefined>>();
    return eachCopy(objects, async (o) => {
        const raw = await readOrNull<CommerceCoupon>(ctx.get, `coupons/${segment(o.id)}`);
        return raw ? couponPackForm(ctx.get, raw, ruleNames) : undefined;
    });
}
