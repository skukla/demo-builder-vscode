/**
 * Capture for cart rules and coupons (datapack-engine step 11): what "Save store changes to this
 * pack" reads beside the catalog (`capture.ts`) and the customers (`captureB2b.ts`).
 *
 * As for every kind, it reads what the install record lists and the installed version's own rows
 * found again by the names it gives them (a rule's name, a coupon's code), plus what those need on
 * an empty store:
 *
 * - every rule a captured coupon belongs to;
 * - every code TYPED into a captured rule (`type` 0), the SC's own included: a code handed out in a
 *   demo is part of it. Codes Commerce generated (`type` 1) are left out: there can be thousands,
 *   and a pack installs every code it holds as one typed in.
 *
 * Rules and codes go into pack form (`rulePackForm`, `couponPackForm`): groups by code, conditions
 * by name, a coupon's rule by its name, no store's ids or counters. Reads only.
 *
 * @module features/data-installer/services/demoBuilderEngine/capturePromotions
 */

import { CART_RULE_KIND, ruleByName, rulePackForm } from './cartRulesKind';
import { COUPON_KIND, couponByCode, couponPackForm, couponsOfRule } from './couponsKind';
import type { CreatedObject } from './installRecord';
import { type KindContext, readOrNull, segment } from './kindContext';
import type { ProductLookups } from './productLookups';
import type { CommerceCoupon, CommerceSalesRule } from '@/types/commerceSalesRule';

/** A code Commerce generated, rather than one typed in. */
const GENERATED = 1;

type Row = Record<string, unknown>;
const idsOf = (created: readonly CreatedObject[], kind: string): string[] => created.filter((o) => o.kind === kind).map((o) => o.id);
const namesIn = (installed: Record<string, unknown>, kind: string, outer: string, inner: string): string[] =>
    (Array.isArray(installed[kind]) ? (installed[kind] as Row[]) : [])
        .map((r) => (r[outer] as Row | undefined)?.[inner])
        .filter((v): v is string => typeof v === 'string' && v !== '');
const defined = <T>(values: Array<T | undefined | null>): T[] => values.filter((v): v is T => v !== undefined && v !== null);

async function readEach<T>(ctx: KindContext, route: string, ids: Iterable<string>): Promise<T[]> {
    return defined(await Promise.all([...new Set(ids)].map((id) => readOrNull<T>(ctx.get, `${route}/${segment(id)}`))));
}

/** The codes the record lists and the installed version names, as the store holds them. */
async function namedCoupons(ctx: KindContext, created: readonly CreatedObject[], installed: Record<string, unknown>): Promise<CommerceCoupon[]> {
    const found = await Promise.all(namesIn(installed, COUPON_KIND, 'coupon', 'code').map((code) => couponByCode(ctx.get, code)));
    return readEach<CommerceCoupon>(ctx, 'coupons', [...idsOf(created, COUPON_KIND), ...defined(found.map((c) => c?.coupon_id)).map(String)]);
}

async function namedRules(ctx: KindContext, created: readonly CreatedObject[], installed: Record<string, unknown>, coupons: CommerceCoupon[]): Promise<CommerceSalesRule[]> {
    const found = await Promise.all(namesIn(installed, CART_RULE_KIND, 'rule', 'name').map((name) => ruleByName(ctx.get, name)));
    const ids = [...idsOf(created, CART_RULE_KIND), ...defined(found.map((r) => r?.rule_id)).map(String), ...coupons.map((c) => String(c.rule_id))];
    return readEach<CommerceSalesRule>(ctx, 'salesRules', ids);
}

/** Each coupon once, by its id, in the order first met. */
function uniqueCoupons(coupons: CommerceCoupon[]): CommerceCoupon[] {
    const seen = new Map<string, CommerceCoupon>();
    for (const coupon of coupons) if (!seen.has(String(coupon.coupon_id ?? coupon.code))) seen.set(String(coupon.coupon_id ?? coupon.code), coupon);
    return [...seen.values()];
}

/**
 * The cart rule and coupon rows of a capture, or nothing when the pack has none.
 *
 * @param created - what the install record lists
 * @param installed - the installed version's own rows, by kind
 */
export async function capturePromotions(ctx: KindContext, lk: ProductLookups, created: readonly CreatedObject[], installed: Record<string, unknown>): Promise<Record<string, unknown>> {
    const kinds = [CART_RULE_KIND, COUPON_KIND];
    if (!created.some((o) => kinds.includes(o.kind)) && !kinds.some((kind) => kind in installed)) return {};
    const named = await namedCoupons(ctx, created, installed);
    const rules = await namedRules(ctx, created, installed, named);
    const typedIn: CommerceCoupon[] = [];
    for (const rule of rules) {
        if (rule.rule_id !== undefined) typedIn.push(...(await couponsOfRule(ctx.get, String(rule.rule_id))).filter((c) => c.type !== GENERATED));
    }
    const ruleNames = new Map<number, Promise<string | undefined>>(rules.map((r) => [Number(r.rule_id), Promise.resolve(r.name)]));
    const coupons = await Promise.all(uniqueCoupons([...named, ...typedIn]).map((c) => couponPackForm(ctx.get, c, ruleNames)));
    return {
        ...(rules.length > 0 ? { [CART_RULE_KIND]: await Promise.all(rules.map((r) => rulePackForm(lk, r))) } : {}),
        ...(coupons.length > 0 ? { [COUPON_KIND]: coupons } : {}),
    };
}
