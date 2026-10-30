/**
 * Which cart rules a store wipe clears (datapack-engine step 11). A cart rule is website-scoped and
 * one rule can span websites, so only what is unambiguous is done:
 *
 * | Rule | Done |
 * |---|---|
 * | on wholly chosen websites only | deleted (`DELETE salesRules/{id}`); Commerce deletes its coupons with it |
 * | on wholly chosen websites and others too | taken off the chosen ones: read whole (`GET salesRules/{id}`), sent back with only the others (`PUT salesRules/{id}`) |
 * | on a website only partly chosen | left: it applies on that website's stores not chosen too |
 * | listed by an install record, or holding a coupon one lists | left: the pack's removal takes it, by its own rules |
 * | on no chosen website | not read about at all |
 *
 * | Read | Endpoint and field | Confirmed from a real answer? |
 * |---|---|---|
 * | every rule | `GET salesRules/search`, `items[rule_id,name,website_ids]` | the page shape, yes (empty, 2026-10-30); an item **no**. A store without the route answers 404, read as none |
 * | the recorded coupons' rules | `GET coupons/search`, `coupon_id` in: `items[coupon_id,rule_id]` | the page shape, yes (empty); an item **no** |
 *
 * @module features/data-installer/services/demoDataWipe/wipeCartRules
 */

import { filterIn } from '../demoBuilderEngine/b2bReads';
import { removeCartRule } from '../demoBuilderEngine/cartRulesKind';
import { readOrNull, segment } from '../demoBuilderEngine/kindContext';
import type { RemovalAccess } from '../demoBuilderEngine/removers';
import type { WipeScope } from './wipeScope';
import { absentAsEmpty, readAllPages } from '@/features/app-builder/services/erpFillReaders';
import type { CommerceCoupon, CommerceSalesRule } from '@/types/commerceSalesRule';
import type { CommerceGet } from '@/types/commerceWire';

/** What a wipe does with the chosen websites' cart rules. */
export interface CartRuleDecision {
    remove: CommerceSalesRule[];
    /** Each rule kept on the websites not chosen, and those websites. */
    takeOff: Array<{ rule: CommerceSalesRule; websiteIds: number[] }>;
    /** On a website only partly chosen. */
    partWebsite: CommerceSalesRule[];
    /** Holding a coupon an install record lists. */
    holding: CommerceSalesRule[];
}

/** The install records' cart rules and coupons, by id: never touched. */
export interface RecordedPromotions {
    rules: Set<string>;
    coupons: Set<string>;
}

const IDS_PER_READ = 50;

/** The rules the recorded coupons are on. */
async function rulesHoldingRecorded(get: CommerceGet, coupons: ReadonlySet<string>): Promise<Set<string>> {
    const ids = [...coupons].map(Number).filter(Number.isInteger);
    const found: CommerceCoupon[] = [];
    for (let start = 0; start < ids.length; start += IDS_PER_READ) {
        found.push(...(await absentAsEmpty(() => readAllPages<CommerceCoupon>(get, 'coupons/search', filterIn('coupon_id', ids.slice(start, start + IDS_PER_READ))))));
    }
    return new Set(found.filter((c) => coupons.has(String(c.coupon_id))).map((c) => String(c.rule_id)));
}

/** Sort one rule on a chosen website into what the wipe does with it. */
function sortRule(rule: CommerceSalesRule, scope: WipeScope, holdingIds: ReadonlySet<string>, decided: CartRuleDecision): void {
    const websites = (rule.website_ids ?? []).map(Number);
    if (websites.some((id) => scope.websites.part.includes(id))) return void decided.partWebsite.push(rule);
    const others = websites.filter((id) => !scope.websites.whole.includes(id));
    if (others.length > 0) return void decided.takeOff.push({ rule, websiteIds: others });
    (holdingIds.has(String(rule.rule_id)) ? decided.holding : decided.remove).push(rule);
}

/**
 * Read every cart rule and decide those on the chosen websites. Reads only.
 *
 * @param recorded - the rules and coupons install records list: never touched
 */
export async function decideCartRules(get: CommerceGet, scope: WipeScope, recorded: RecordedPromotions): Promise<CartRuleDecision> {
    const decided: CartRuleDecision = { remove: [], takeOff: [], partWebsite: [], holding: [] };
    const chosen = [...scope.websites.whole, ...scope.websites.part];
    const rules = (await absentAsEmpty(() => readAllPages<CommerceSalesRule>(get, 'salesRules/search'))).filter(
        (r) => r.rule_id !== undefined && !recorded.rules.has(String(r.rule_id)) && (r.website_ids ?? []).map(Number).some((id) => chosen.includes(id)),
    );
    const holdingIds = rules.length > 0 && recorded.coupons.size > 0 ? await rulesHoldingRecorded(get, recorded.coupons) : new Set<string>();
    for (const rule of rules) sortRule(rule, scope, holdingIds, decided);
    return decided;
}

/** Delete one rule; Commerce deletes its coupons with it. */
export function deleteRule(commerce: RemovalAccess, id: string): Promise<void> {
    return removeCartRule(commerce.send, id);
}

/**
 * Take a rule off the chosen websites: read it whole, send it back on the others only. A rule gone
 * since counts as done.
 */
export async function takeRuleOff(commerce: RemovalAccess, id: string, websiteIds: number[]): Promise<void> {
    const rule = await readOrNull<CommerceSalesRule>(commerce.get, `salesRules/${segment(id)}`);
    if (!rule) return;
    await commerce.send('PUT', `salesRules/${segment(id)}`, { rule: { ...rule, website_ids: websiteIds } });
}
